package mn.aura.couple.media.app;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Array;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import mn.aura.couple.api.model.MediaRef;
import mn.aura.couple.api.model.UploadCreate;
import mn.aura.couple.api.model.UploadSession;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.job.TestRunnableJob;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.media.app.MediaInspector.Kind;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Resumable/chunked upload (DD-AURA-012, TQ-04, FR-5.6): `POST /uploads` (S3 multipart, квот нөөцлөх) →
 * `PUT …/chunks/{n}` (5 MiB, индексээр, давтан илгээж болно) → `GET …` (хүлээн авсан индекс — тасарвал
 * эхнээс биш үргэлжилнэ, AC-20) → `POST …/complete` (MediaRef).
 * <ul>
 *   <li>Зорилго бүрийн хязгаар: зураг, видео ≤ 200 MB ба ≤ 60 с (FR-5.1), файл ≤ 50 MB (FR-6.1), дуу ≤ 5 мин,
 *       профайлын зураг ≤ 10 MB (AC-172, AC-87)</li>
 *   <li>Эхний chunk-ийн агуулгаар MIME шалгана — `.jpg` нэртэй HTML → 415 (AC-129)</li>
 *   <li>Квот: `POST`-д нөөцөлнө, 80%-д `quotaWarning`, хэтэрвэл 507 (AC-200, NFR-11)</li>
 *   <li>Зураг: дахин кодолж metadata/GPS хасаад 3 хувилбар + blurhash (AC-21, DD-AURA-014)</li>
 * </ul>
 */
@Service
public class UploadSessionService implements TestRunnableJob {

    public static final int CHUNK_SIZE = 5 * 1024 * 1024;
    public static final Duration TTL = Duration.ofHours(24);
    public static final long MB = 1024L * 1024;

    /** Видео/дуу бэлэн болоход хөрвүүлэх ажилд (T-34, T-46) зориулсан дохио. */
    public record MediaUploaded(UUID mediaId, UUID spaceId, String kind, String purpose) {
    }

    record Limits(Set<Kind> kinds, long maxBytes) {
    }

    static final Map<String, Limits> LIMITS = Map.of(
            "MEMORY", new Limits(Set.of(Kind.IMAGE, Kind.VIDEO), 200 * MB),
            "CHAT", new Limits(Set.of(Kind.IMAGE, Kind.VIDEO, Kind.FILE), 50 * MB),
            "LETTER", new Limits(Set.of(Kind.IMAGE), 25 * MB),
            "AVATAR", new Limits(Set.of(Kind.IMAGE), 10 * MB),
            "PERSPECTIVE_AUDIO", new Limits(Set.of(Kind.AUDIO), 50 * MB),
            "VOICE", new Limits(Set.of(Kind.AUDIO), 50 * MB),
            "FILE", new Limits(Set.of(Kind.FILE, Kind.IMAGE, Kind.VIDEO, Kind.AUDIO), 50 * MB));
    static final long IMAGE_MAX_BYTES = 25 * MB;
    static final long VIDEO_MAX_MS = 60_000;
    static final long AUDIO_MAX_MS = 5 * 60_000;

    private record Row(UUID id, UUID ownerId, UUID spaceId, UUID mediaId, String purpose, String fileName,
                       String declaredMime, String detectedMime, String kind, long totalBytes, Long durationMs,
                       int chunkSize, int totalChunks, List<Integer> received, Map<Integer, String> etags, String s3Key,
                       String s3UploadId, String status, Instant expiresAt) {
    }

    private final JdbcTemplate jdbc;
    private final MediaStorageService storage;
    private final MediaInspector inspector;
    private final ImageProcessor images;
    private final StorageQuota quota;
    private final MediaRefs refs;
    private final ApplicationEventPublisher events;
    private final ObjectMapper mapper;
    private final TimeProvider time;

    public UploadSessionService(JdbcTemplate jdbc, MediaStorageService storage, MediaInspector inspector,
                                ImageProcessor images, StorageQuota quota, MediaRefs refs,
                                ApplicationEventPublisher events, ObjectMapper mapper, TimeProvider time) {
        this.jdbc = jdbc;
        this.storage = storage;
        this.inspector = inspector;
        this.images = images;
        this.quota = quota;
        this.refs = refs;
        this.events = events;
        this.mapper = mapper;
        this.time = time;
    }

    /** `spaceId` — дуудагч сонгоно (AVATAR → SOLO, бусад → идэвхтэй space). */
    @Transactional
    public UploadSession create(UUID ownerId, UUID spaceId, UploadCreate in) {
        String purpose = in.getPurpose().getValue();
        Limits limits = LIMITS.get(purpose);
        Kind declaredKind = kindOf(in.getMime());
        if (declaredKind == null || !limits.kinds().contains(declaredKind)) {
            throw new ApiException(ErrorCode.MEDIA_TYPE_FORBIDDEN, HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        }
        long max = declaredKind == Kind.IMAGE ? Math.min(limits.maxBytes(), IMAGE_MAX_BYTES) : limits.maxBytes();
        if (in.getTotalBytes() > max) {
            throw new ApiException(ErrorCode.MEDIA_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE, Map.of("maxBytes", max));
        }
        Long duration = in.getDurationMs() == null ? null : in.getDurationMs().longValue();
        if (declaredKind == Kind.VIDEO && "MEMORY".equals(purpose) && duration != null && duration > VIDEO_MAX_MS) {
            throw ApiException.badRequest(ErrorCode.VIDEO_TOO_LONG, "durationMs");
        }
        if (declaredKind == Kind.AUDIO && duration != null && duration > AUDIO_MAX_MS) {
            throw ApiException.badRequest(ErrorCode.AUDIO_TOO_LONG, "durationMs");
        }
        StorageQuota.Usage usage = quota.reserve(spaceId, in.getTotalBytes());
        UUID id = Ids.newId();
        UUID mediaId = Ids.newId();
        String key = MediaStorageService.key(spaceId, mediaId, "original");
        String s3UploadId = storage.createMultipart(key, in.getMime());
        int chunks = (int) ((in.getTotalBytes() + CHUNK_SIZE - 1) / CHUNK_SIZE);
        Instant now = time.now();
        jdbc.update("""
                INSERT INTO upload_session (id, owner_id, space_id, media_id, purpose, file_name, declared_mime, total_bytes,
                    duration_ms, chunk_size, total_chunks, s3_key, s3_upload_id, expires_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, id, ownerId, spaceId, mediaId, purpose, cleanName(in.getFileName()), in.getMime(), in.getTotalBytes(),
                duration, CHUNK_SIZE, chunks, key, s3UploadId, Timestamp.from(now.plus(TTL)), Timestamp.from(now),
                Timestamp.from(now));
        UploadSession dto = new UploadSession(id, CHUNK_SIZE, chunks, List.of());
        dto.quotaWarning(usage.warning());
        return dto;
    }

    @Transactional(readOnly = true)
    public UploadSession get(UUID ownerId, UUID uploadId) {
        Row row = load(ownerId, uploadId, false);
        if ("ABORTED".equals(row.status()) || ("OPEN".equals(row.status()) && !row.expiresAt().isAfter(time.now()))) {
            throw new ApiException(ErrorCode.NOT_FOUND, HttpStatus.GONE);
        }
        return toDto(row);
    }

    /** Нэг chunk (давтан илгээвэл солигдоно). Сүүлийнхээс бусад нь яг `chunkSize`. */
    @Transactional(noRollbackFor = ApiException.class)
    public UploadSession putChunk(UUID ownerId, UUID uploadId, int index, byte[] bytes) {
        Row row = open(ownerId, uploadId);
        if (index < 0 || index >= row.totalChunks()) {
            throw new ApiException(ErrorCode.CHUNK_SIZE_MISMATCH, HttpStatus.CONFLICT, Map.of("index", index));
        }
        long expected = index < row.totalChunks() - 1 ? row.chunkSize()
                : row.totalBytes() - (long) row.chunkSize() * (row.totalChunks() - 1);
        if (bytes.length != expected) {
            throw new ApiException(ErrorCode.CHUNK_SIZE_MISMATCH, HttpStatus.CONFLICT, Map.of("expectedBytes", expected));
        }
        String detectedMime = row.detectedMime();
        String kind = row.kind();
        if (index == 0) {
            MediaInspector.Inspection inspection;
            try {
                inspection = inspector.inspect(bytes, row.fileName(), row.declaredMime());
            } catch (ApiException e) {
                abort(row);
                throw e;
            }
            if (!LIMITS.get(row.purpose()).kinds().contains(inspection.kind())) {
                abort(row);
                throw new ApiException(ErrorCode.MEDIA_TYPE_FORBIDDEN, HttpStatus.UNSUPPORTED_MEDIA_TYPE);
            }
            detectedMime = inspection.mime();
            kind = inspection.kind().name();
        }
        String etag = storage.uploadPart(row.s3Key(), row.s3UploadId(), index + 1, bytes);
        Row locked = load(ownerId, uploadId, true);
        TreeMap<Integer, String> etags = new TreeMap<>(locked.etags());
        etags.put(index, etag);
        List<Integer> received = new ArrayList<>(etags.keySet());
        String mime = detectedMime;
        String detectedKind = kind;
        jdbc.update(con -> {
            var ps = con.prepareStatement("UPDATE upload_session SET received = ?, etags = ?::jsonb, detected_mime = ?, "
                    + "kind = ?, updated_at = ? WHERE id = ?");
            ps.setArray(1, con.createArrayOf("integer", received.toArray()));
            ps.setString(2, json(etags));
            ps.setString(3, mime);
            ps.setString(4, detectedKind);
            ps.setTimestamp(5, Timestamp.from(time.now()));
            ps.setObject(6, uploadId);
            return ps;
        });
        return toDto(load(ownerId, uploadId, false));
    }

    @Transactional
    public MediaRef complete(UUID ownerId, UUID uploadId) {
        Row row = load(ownerId, uploadId, true);
        if ("COMPLETED".equals(row.status())) {
            return refs.find(row.mediaId()).orElseThrow(ApiException::notFound);
        }
        row = open(ownerId, uploadId);
        if (row.received().size() != row.totalChunks() || row.detectedMime() == null) {
            throw new ApiException(ErrorCode.UPLOAD_INCOMPLETE, HttpStatus.CONFLICT,
                    Map.of("receivedChunks", row.received(), "totalChunks", row.totalChunks()));
        }
        List<String> etags = new ArrayList<>();
        for (int i = 0; i < row.totalChunks(); i++) {
            etags.add(row.etags().get(i));
        }
        storage.completeMultipart(row.s3Key(), row.s3UploadId(), etags);
        Instant now = time.now();
        long stored = row.totalBytes();
        Kind kind = Kind.valueOf(row.kind());
        if (kind == Kind.IMAGE) {
            ImageProcessor.ProcessedImage img = images.process(storage.get(row.s3Key()));
            storage.put(row.s3Key(), img.original().bytes(), img.original().mime());
            Map<String, String> variants = new TreeMap<>();
            stored = img.original().bytes().length;
            for (ImageProcessor.Variant v : img.variants()) {
                String key = MediaStorageService.key(row.spaceId(), row.mediaId(), v.name());
                storage.put(key, v.bytes(), v.mime());
                variants.put(v.name(), key);
                stored += v.bytes().length;
            }
            insertMedia(row, "IMAGE", ImageProcessor.MIME, stored, refs.variantsJson(variants), img.blurhash(), img.width(),
                    img.height(), "READY", now);
        } else {
            // Видео (T-34) ба дууг (T-46) хөрвүүлэх ажил `MediaUploaded`-ийг сонсож PROCESSING → READY болгоно
            String status = kind == Kind.VIDEO ? "PROCESSING" : "READY";
            insertMedia(row, kind.name(), row.detectedMime(), stored, "{}", null, null, null, status, now);
        }
        quota.adjust(row.spaceId(), stored - row.totalBytes());
        jdbc.update("UPDATE upload_session SET status = 'COMPLETED', updated_at = ? WHERE id = ?", Timestamp.from(now), uploadId);
        events.publishEvent(new MediaUploaded(row.mediaId(), row.spaceId(), kind.name(), row.purpose()));
        return refs.find(row.mediaId()).orElseThrow(ApiException::notFound);
    }

    @Transactional
    public void cancel(UUID ownerId, UUID uploadId) {
        Row row = load(ownerId, uploadId, true);
        if ("OPEN".equals(row.status())) {
            abort(row);
        }
    }

    @Scheduled(fixedDelayString = "PT1H")
    @SchedulerLock(name = "uploadCleanup", lockAtMostFor = "PT10M")
    public void scheduled() {
        runOnce();
    }

    @Override
    public String name() {
        return "uploadCleanup";
    }

    /** 24 цагаас хуучин дуусаагүй upload-ыг цуцалж квотыг буцаана. */
    @Override
    @Transactional
    public int runOnce() {
        List<Row> expired = jdbc.query("SELECT * FROM upload_session WHERE status = 'OPEN' AND expires_at <= ? FOR UPDATE SKIP LOCKED",
                (rs, i) -> map(rs), Timestamp.from(time.now()));
        expired.forEach(this::abort);
        return expired.size();
    }

    private void abort(Row row) {
        try {
            storage.abortMultipart(row.s3Key(), row.s3UploadId());
        } catch (software.amazon.awssdk.core.exception.SdkException e) {
            // S3 талд аль хэдийн цэвэрлэгдсэн — мөрийг ABORTED болгож квотыг буцаах нь чухал
        }
        quota.release(row.spaceId(), row.totalBytes());
        jdbc.update("UPDATE upload_session SET status = 'ABORTED', updated_at = ? WHERE id = ?",
                Timestamp.from(time.now()), row.id());
    }

    private void insertMedia(Row row, String kind, String mime, long size, String variants, String blurhash, Integer width,
                             Integer height, String status, Instant now) {
        jdbc.update("""
                INSERT INTO media (id, space_id, owner_id, kind, mime, size_bytes, file_name, s3_key, variants, blurhash,
                                   width, height, duration_ms, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?)
                """, row.mediaId(), row.spaceId(), row.ownerId(), kind, mime, size, row.fileName(), row.s3Key(), variants,
                blurhash, width, height, row.durationMs(), status, Timestamp.from(now), Timestamp.from(now));
    }

    private Row open(UUID ownerId, UUID uploadId) {
        Row row = load(ownerId, uploadId, false);
        if (!"OPEN".equals(row.status())) {
            throw new ApiException(ErrorCode.NOT_FOUND, HttpStatus.GONE);
        }
        if (!row.expiresAt().isAfter(time.now())) {
            throw new ApiException(ErrorCode.NOT_FOUND, HttpStatus.GONE);
        }
        return row;
    }

    private Row load(UUID ownerId, UUID uploadId, boolean lock) {
        return jdbc.query("SELECT * FROM upload_session WHERE id = ? AND owner_id = ?" + (lock ? " FOR UPDATE" : ""),
                (rs, i) -> map(rs), uploadId, ownerId).stream().findFirst().orElseThrow(ApiException::notFound);
    }

    private Row map(java.sql.ResultSet rs) throws java.sql.SQLException {
        Array arr = rs.getArray("received");
        List<Integer> received = arr == null ? List.of() : Arrays.asList((Integer[]) arr.getArray());
        Map<Integer, String> etags = new TreeMap<>();
        try {
            Map<String, String> raw = mapper.readValue(rs.getString("etags"), new TypeReference<Map<String, String>>() {
            });
            raw.forEach((k, v) -> etags.put(Integer.parseInt(k), v));
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
        Object duration = rs.getObject("duration_ms");
        return new Row(rs.getObject("id", UUID.class), rs.getObject("owner_id", UUID.class),
                rs.getObject("space_id", UUID.class), rs.getObject("media_id", UUID.class), rs.getString("purpose"),
                rs.getString("file_name"), rs.getString("declared_mime"), rs.getString("detected_mime"),
                rs.getString("kind"), rs.getLong("total_bytes"), duration == null ? null : ((Number) duration).longValue(),
                rs.getInt("chunk_size"), rs.getInt("total_chunks"), received, etags, rs.getString("s3_key"),
                rs.getString("s3_upload_id"), rs.getString("status"), rs.getTimestamp("expires_at").toInstant());
    }

    private UploadSession toDto(Row row) {
        return new UploadSession(row.id(), row.chunkSize(), row.totalChunks(), List.copyOf(row.received()));
    }

    private String json(Map<Integer, String> etags) {
        try {
            return mapper.writeValueAsString(etags);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static Kind kindOf(String mime) {
        if (mime == null) {
            return null;
        }
        String m = mime.toLowerCase(Locale.ROOT).split(";")[0].strip();
        Kind k = MediaInspector.ALLOWED.get(m);
        if (k != null) {
            return k;
        }
        // Хөтчийн MediaRecorder `audio/webm;codecs=opus`, iOS `audio/x-m4a` г.м. — ангиллаар
        return m.startsWith("audio/") ? Kind.AUDIO : m.startsWith("video/") ? Kind.VIDEO : null;
    }

    private static String cleanName(String name) {
        String n = name.replaceAll("[\\\\/\\p{Cntrl}]", "_").strip();
        return n.length() > 255 ? n.substring(n.length() - 255) : n;
    }
}
