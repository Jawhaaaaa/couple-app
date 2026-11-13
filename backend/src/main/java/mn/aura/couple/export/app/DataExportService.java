package mn.aura.couple.export.app;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import mn.aura.couple.api.model.DataExport;
import mn.aura.couple.api.model.ExportRequest;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.event.Notify;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.job.JobHandler;
import mn.aura.couple.common.job.JobQueue;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.media.app.MediaStorageService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Экспорт (FR-5.12, FR-14.5, AC-126): хүсэлт дараалалд (`job`, хэрэглэгч тутам нэг зэрэг — 429), үүсгэгч
 * төрлөөр файл үүсгэж S3-ийн `exports/`-д, бэлэн болоход апп доторх мэдэгдэл; татах холбоос 7 хоног
 * (дараа нь 410 `EXPORT_EXPIRED`), бэлэн болоогүй бол 409 `EXPORT_NOT_READY`.
 */
@Service
public class DataExportService implements JobHandler {

    public static final String JOB = "DATA_EXPORT";
    public static final Duration LINK_TTL = Duration.ofDays(7);

    private final JdbcTemplate jdbc;
    private final JobQueue jobs;
    private final Map<String, ExportGenerator> generators;
    private final MediaStorageService storage;
    private final ApplicationEventPublisher events;
    private final ObjectMapper mapper;
    private final ExportMails mails;
    private final TimeProvider time;

    public DataExportService(JdbcTemplate jdbc, JobQueue jobs, List<ExportGenerator> generators,
                             MediaStorageService storage, ApplicationEventPublisher events, ObjectMapper mapper,
                             ExportMails mails, TimeProvider time) {
        this.mails = mails;
        this.jdbc = jdbc;
        this.jobs = jobs;
        this.generators = generators.stream().collect(Collectors.toMap(ExportGenerator::kind, g -> g));
        this.storage = storage;
        this.events = events;
        this.mapper = mapper;
        this.time = time;
    }

    @Transactional
    public DataExport request(SpaceContext ctx, ExportRequest in) {
        String kind = in.getKind().getValue();
        if (!generators.containsKey(kind)) {
            throw ApiException.validation("kind", ErrorCode.VALIDATION_FAILED);
        }
        jdbc.queryForList("SELECT id FROM users WHERE id = ? FOR UPDATE", UUID.class, ctx.userId());
        Integer running = jdbc.queryForObject("SELECT count(*) FROM data_export WHERE user_id = ? AND status IN ('QUEUED', 'RUNNING')",
                Integer.class, ctx.userId());
        if (running != null && running > 0) {
            throw ApiException.rateLimited(60);
        }
        if (in.getGroupId() != null && jdbc.queryForList("SELECT 1 FROM memory_group WHERE id = ? AND space_id = ?",
                Integer.class, in.getGroupId(), ctx.spaceId()).isEmpty()) {
            throw ApiException.notFound();
        }
        UUID id = Ids.newId();
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("groupId", in.getGroupId() == null ? null : in.getGroupId().toString());
        params.put("from", in.getFrom() == null ? null : in.getFrom().toString());
        params.put("to", in.getTo() == null ? null : in.getTo().toString());
        params.put("locale", in.getLocale().getValue());
        Instant now = time.now();
        jdbc.update("INSERT INTO data_export (id, user_id, space_id, kind, params, status, created_at, updated_at) "
                        + "VALUES (?, ?, ?, ?, ?::jsonb, 'QUEUED', ?, ?)", id, ctx.userId(), ctx.spaceId(), kind, json(params),
                Timestamp.from(now), Timestamp.from(now));
        jobs.enqueue(JOB, Map.of("exportId", id.toString()));
        return get(ctx.userId(), id);
    }

    @Transactional(readOnly = true)
    public List<DataExport> list(UUID userId) {
        return jdbc.query("SELECT * FROM data_export WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
                (rs, i) -> toDto(rs), userId);
    }

    @Transactional(readOnly = true)
    public DataExport get(UUID userId, UUID id) {
        return jdbc.query("SELECT * FROM data_export WHERE id = ? AND user_id = ?", (rs, i) -> toDto(rs), id, userId)
                .stream().findFirst().orElseThrow(ApiException::notFound);
    }

    /** 15 минутын presigned URL (302-ын Location). */
    @Transactional(readOnly = true)
    public URI downloadUrl(UUID userId, UUID id) {
        DataExport e = get(userId, id);
        if (e.getStatus() == DataExport.StatusEnum.EXPIRED) {
            throw new ApiException(ErrorCode.EXPORT_EXPIRED, HttpStatus.GONE);
        }
        if (e.getStatus() != DataExport.StatusEnum.READY) {
            throw new ApiException(ErrorCode.EXPORT_NOT_READY, HttpStatus.CONFLICT);
        }
        String key = jdbc.queryForObject("SELECT s3_key FROM data_export WHERE id = ?", String.class, id);
        return storage.presignGet(key);
    }

    @Override
    public String type() {
        return JOB;
    }

    @Override
    public void handle(JobQueue.Job job) throws Exception {
        UUID id = job.uuid("exportId");
        Map<String, Object> row = jdbc.queryForMap("SELECT user_id, space_id, kind, params::text AS params, status FROM data_export WHERE id = ?", id);
        if ("READY".equals(row.get("status")) || "EXPIRED".equals(row.get("status"))) {
            return;
        }
        jdbc.update("UPDATE data_export SET status = 'RUNNING', updated_at = ? WHERE id = ?", Timestamp.from(time.now()), id);
        @SuppressWarnings("unchecked")
        Map<String, Object> params = mapper.readValue((String) row.get("params"), Map.class);
        UUID userId = (UUID) row.get("user_id");
        ExportGenerator.Request request = new ExportGenerator.Request(id, userId, (UUID) row.get("space_id"),
                params.get("groupId") == null ? null : UUID.fromString((String) params.get("groupId")),
                params.get("from") == null ? null : LocalDate.parse((String) params.get("from")),
                params.get("to") == null ? null : LocalDate.parse((String) params.get("to")),
                (String) params.getOrDefault("locale", "mn"));
        Path dir = Files.createTempDirectory("aura-export-");
        try {
            ExportGenerator.Output out = generators.get((String) row.get("kind")).generate(request, dir);
            String key = "exports/" + userId + "/" + id + "/" + safe(out.fileName());
            storage.putFile(key, out.file(), out.contentType());
            Instant now = time.now();
            jdbc.update("UPDATE data_export SET status = 'READY', s3_key = ?, file_name = ?, size_bytes = ?, ready_at = ?, "
                            + "expires_at = ?, updated_at = ? WHERE id = ?", key, out.fileName(), Files.size(out.file()),
                    Timestamp.from(now), Timestamp.from(now.plus(LINK_TTL)), Timestamp.from(now), id);
            events.publishEvent(new Notify(userId, (UUID) row.get("space_id"), null, "EXPORT_READY", Map.of(),
                    "/settings/data"));
            mails.ready(userId); // апп ба имэйл мэдэгдэл (AC-126)
        } finally {
            try (var paths = Files.walk(dir)) {
                for (Path p : paths.sorted(java.util.Comparator.reverseOrder()).toList()) {
                    Files.deleteIfExists(p);
                }
            }
        }
    }

    @Override
    public void onGiveUp(JobQueue.Job job, Exception cause) {
        jdbc.update("UPDATE data_export SET status = 'FAILED', updated_at = ? WHERE id = ?", Timestamp.from(time.now()),
                job.uuid("exportId"));
    }

    /** Хугацаа дууссан холбоосын файлыг устгаж EXPIRED болгоно (`exportExpiry` ажил — T-72). */
    @Transactional
    public int expire() {
        List<Map<String, Object>> due = jdbc.queryForList("SELECT id, s3_key FROM data_export WHERE status = 'READY' "
                + "AND expires_at <= ? FOR UPDATE SKIP LOCKED", Timestamp.from(time.now()));
        for (Map<String, Object> r : due) {
            storage.delete((String) r.get("s3_key"));
            jdbc.update("UPDATE data_export SET status = 'EXPIRED', updated_at = ? WHERE id = ?", Timestamp.from(time.now()),
                    r.get("id"));
        }
        return due.size();
    }

    private DataExport toDto(java.sql.ResultSet rs) throws java.sql.SQLException {
        Instant expires = rs.getTimestamp("expires_at") == null ? null : rs.getTimestamp("expires_at").toInstant();
        String status = rs.getString("status");
        if ("READY".equals(status) && expires != null && !expires.isAfter(time.now())) {
            status = "EXPIRED"; // ажил хараахан ажиллаагүй ч хугацаа дууссан
        }
        DataExport e = new DataExport(rs.getObject("id", UUID.class), DataExport.KindEnum.fromValue(rs.getString("kind")),
                DataExport.StatusEnum.fromValue(status),
                OffsetDateTime.ofInstant(rs.getTimestamp("created_at").toInstant(), ZoneOffset.UTC));
        Timestamp ready = rs.getTimestamp("ready_at");
        e.readyAt(ready == null ? null : OffsetDateTime.ofInstant(ready.toInstant(), ZoneOffset.UTC));
        e.expiresAt(expires == null ? null : OffsetDateTime.ofInstant(expires, ZoneOffset.UTC));
        return e;
    }

    private String json(Map<String, Object> m) {
        try {
            return mapper.writeValueAsString(m);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String safe(String name) {
        return name.replaceAll("[^\\p{L}\\p{N}._-]", "_");
    }
}
