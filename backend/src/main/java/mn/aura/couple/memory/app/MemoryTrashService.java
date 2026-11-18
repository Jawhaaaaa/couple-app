package mn.aura.couple.memory.app;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.api.model.DeletePreview;
import mn.aura.couple.api.model.Memory;
import mn.aura.couple.api.model.MemorySummary;
import mn.aura.couple.api.model.TrashEntry;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.job.TestRunnableJob;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.UserRefs;
import mn.aura.couple.media.app.MediaStorageService;
import mn.aura.couple.media.app.StorageQuota;
import mn.aura.couple.memory.app.MemoryService.MemoryRef;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Хогийн сав (FR-5.5, AC-23, AC-174): устгахын өмнө хамтрагчийн хэдэн сэтгэгдэл хамт устахыг хэлнэ;
 * устгасан дурсамж 30 хоног зохиогчийн хогийн саванд (сэтгэгдэл, реакцтайгаа хадгалагдана), сэргээж
 * болно; хугацаа дуусвал (эсвэл «бүрмөсөн устгах») DB ба storage-оос бүрмөсөн устна, квот буцна.
 * Хуваалцсан медиа өөр дурсамжид хэрэглэгдэж байвал файлыг хадгална.
 */
@Service
public class MemoryTrashService implements TestRunnableJob {

    public static final Duration RETENTION = Duration.ofDays(30);

    private final NamedParameterJdbcTemplate jdbc;
    private final MemoryService memories;
    private final MemoryAssembler assembler;
    private final UserRefs users;
    private final MediaStorageService storage;
    private final StorageQuota quota;
    private final TimeProvider time;
    private final com.fasterxml.jackson.databind.ObjectMapper mapper;

    public MemoryTrashService(NamedParameterJdbcTemplate jdbc, MemoryService memories, MemoryAssembler assembler,
                              UserRefs users, MediaStorageService storage, StorageQuota quota, TimeProvider time,
                              com.fasterxml.jackson.databind.ObjectMapper mapper) {
        this.mapper = mapper;
        this.jdbc = jdbc;
        this.memories = memories;
        this.assembler = assembler;
        this.users = users;
        this.storage = storage;
        this.quota = quota;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public DeletePreview preview(SpaceContext ctx, UUID id) {
        MemoryRef ref = memories.owned(memories.scope(ctx), id, false);
        Integer n = jdbc.queryForObject("SELECT count(*) FROM memory_comment WHERE memory_id = :m AND author_id <> :u",
                new MapSqlParameterSource("m", ref.id()).addValue("u", ctx.userId()), Integer.class);
        DeletePreview p = new DeletePreview(n == null ? 0 : n);
        memories.scope(ctx).partnerId().ifPresent(partner -> p.partnerName(users.ref(partner).getDisplayName()));
        return p;
    }

    @Transactional
    public TrashEntry delete(SpaceContext ctx, UUID id) {
        MemoryScope scope = memories.scope(ctx);
        MemoryRef ref = memories.owned(scope, id, true);
        if (ref.deleted()) {
            throw ApiException.notFound();
        }
        Instant now = time.now();
        Instant purgeAfter = now.plus(RETENTION);
        jdbc.update("UPDATE memory SET deleted_at = :now, purge_after = :p, version = version + 1, updated_at = :now WHERE id = :id",
                new MapSqlParameterSource("now", Timestamp.from(now)).addValue("p", Timestamp.from(purgeAfter)).addValue("id", id));
        memories.publishUpdated(scope, ref.spaceId(), id, "memory.deleted");
        return new TrashEntry(id, MemoryService.utc(purgeAfter));
    }

    @Transactional(readOnly = true)
    public List<TrashEntry> list(SpaceContext ctx) {
        MemoryScope scope = memories.scope(ctx);
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT id, deleted_at, purge_after FROM memory
                 WHERE author_id = :u AND space_id IN (:spaces) AND deleted_at IS NOT NULL ORDER BY deleted_at DESC
                """, new MapSqlParameterSource("u", ctx.userId()).addValue("spaces", scope.spaces("all")));
        List<UUID> ids = rows.stream().map(r -> (UUID) r.get("id")).toList();
        Map<UUID, MemorySummary> summaries = new java.util.HashMap<>();
        assembler.summaries(ids, ctx.userId()).forEach(s -> summaries.put(s.getId(), s));
        Instant now = time.now();
        List<TrashEntry> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Instant purge = ((Timestamp) r.get("purge_after")).toInstant();
            TrashEntry e = new TrashEntry((UUID) r.get("id"), MemoryService.utc(purge));
            e.memory(summaries.get((UUID) r.get("id")));
            e.deletedAt(MemoryService.utc(((Timestamp) r.get("deleted_at")).toInstant()));
            // Үлдсэн хоногийг дээш тоймлоно — устгасны дараа шууд «30 хоног»
            long seconds = Math.max(0, java.time.Duration.between(now, purge).toSeconds());
            e.daysLeft((int) Math.min(30, (seconds + 86_399) / 86_400));
            out.add(e);
        }
        return out;
    }

    @Transactional
    public Memory restore(SpaceContext ctx, UUID id) {
        MemoryScope scope = memories.scope(ctx);
        MemoryRef ref = memories.owned(scope, id, true);
        if (!ref.deleted()) {
            throw ApiException.notFound();
        }
        Timestamp purge = jdbc.queryForObject("SELECT purge_after FROM memory WHERE id = :id",
                new MapSqlParameterSource("id", id), Timestamp.class);
        if (purge == null || !purge.toInstant().isAfter(time.now())) {
            throw new ApiException(ErrorCode.NOT_FOUND, HttpStatus.GONE);
        }
        jdbc.update("UPDATE memory SET deleted_at = NULL, purge_after = NULL, version = version + 1, updated_at = :now WHERE id = :id",
                new MapSqlParameterSource("now", Timestamp.from(time.now())).addValue("id", id));
        memories.publishUpdated(scope, ref.spaceId(), id, "memory.created");
        return assembler.detail(id, ctx.userId());
    }

    /** «Бүрмөсөн устгах» — хогийн савнаас л. */
    @Transactional
    public void purgeNow(SpaceContext ctx, UUID id) {
        MemoryRef ref = memories.owned(memories.scope(ctx), id, true);
        if (!ref.deleted()) {
            throw ApiException.notFound();
        }
        purge(id, ref.spaceId());
    }

    @Scheduled(fixedDelayString = "PT1H")
    @SchedulerLock(name = "trashPurge", lockAtMostFor = "PT30M")
    public void scheduled() {
        runOnce();
    }

    @Override
    public String name() {
        return "trashPurge";
    }

    /** TrashPurgeJob: 30 хоног өнгөрсөн дурсамжийг бүрмөсөн устгана. */
    @Override
    @Transactional
    public int runOnce() {
        List<Map<String, Object>> due = jdbc.queryForList("""
                SELECT id, space_id FROM memory WHERE deleted_at IS NOT NULL AND purge_after <= :now
                 ORDER BY purge_after LIMIT 500 FOR UPDATE SKIP LOCKED
                """, new MapSqlParameterSource("now", Timestamp.from(time.now())));
        for (Map<String, Object> r : due) {
            purge((UUID) r.get("id"), (UUID) r.get("space_id"));
        }
        return due.size();
    }

    private void purge(UUID memoryId, UUID spaceId) {
        MapSqlParameterSource p = new MapSqlParameterSource("m", memoryId);
        List<Map<String, Object>> media = jdbc.queryForList("""
                SELECT x.id, x.s3_key, x.variants::text AS variants, x.size_bytes FROM memory_media mm JOIN media x ON x.id = mm.media_id
                 WHERE mm.memory_id = :m
                   AND NOT EXISTS (SELECT 1 FROM memory_media o WHERE o.media_id = x.id AND o.memory_id <> :m)
                   AND NOT EXISTS (SELECT 1 FROM users u WHERE u.avatar_media_id = x.id)
                """, p);
        List<UUID> perspectiveAudio = jdbc.queryForList(
                "SELECT audio_media_id FROM memory_perspective WHERE memory_id = :m AND audio_media_id IS NOT NULL", p, UUID.class);
        jdbc.update("DELETE FROM reaction WHERE target_type = 'COMMENT' AND target_id IN (SELECT id FROM memory_comment WHERE memory_id = :m)", p);
        jdbc.update("DELETE FROM reaction WHERE target_type = 'MEMORY' AND target_id = :m", p);
        jdbc.update("DELETE FROM memory WHERE id = :m", p);
        long freed = 0;
        for (Map<String, Object> m : media) {
            deleteObjects((String) m.get("s3_key"), (String) m.get("variants"));
            jdbc.update("DELETE FROM media WHERE id = :id", new MapSqlParameterSource("id", m.get("id")));
            freed += ((Number) m.get("size_bytes")).longValue();
        }
        for (UUID audio : perspectiveAudio) {
            List<Map<String, Object>> a = jdbc.queryForList("SELECT s3_key, variants::text AS variants, size_bytes FROM media WHERE id = :id",
                    new MapSqlParameterSource("id", audio));
            if (!a.isEmpty()) {
                deleteObjects((String) a.get(0).get("s3_key"), (String) a.get(0).get("variants"));
                jdbc.update("DELETE FROM media WHERE id = :id", new MapSqlParameterSource("id", audio));
                freed += ((Number) a.get(0).get("size_bytes")).longValue();
            }
        }
        if (freed > 0) {
            quota.release(spaceId, freed);
        }
    }

    private void deleteObjects(String key, String variantsJson) {
        storage.delete(key);
        if (variantsJson == null) {
            return;
        }
        try {
            mapper.readValue(variantsJson, new com.fasterxml.jackson.core.type.TypeReference<Map<String, String>>() {
            }).values().forEach(storage::delete);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException("media.variants задлах боломжгүй", e);
        }
    }
}
