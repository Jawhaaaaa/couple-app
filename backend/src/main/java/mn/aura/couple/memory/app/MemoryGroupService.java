package mn.aura.couple.memory.app;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.api.model.MemoryGroup;
import mn.aura.couple.api.model.MemoryGroupDetail;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.media.app.MediaRefs;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Дурсамжийн бүлэг (FR-5.7, AC-81): «Анхны аялал», «2025 зун». Хоёулаа засна (тэнцүү эрх), дурсамж олон
 * бүлэгт хамаарна, бүлэг устахад дурсамж хэвээр. Засварт version (DD-AURA-016).
 */
@Service
public class MemoryGroupService {

    private final NamedParameterJdbcTemplate jdbc;
    private final MemoryService memories;
    private final MemoryAssembler assembler;
    private final MediaRefs media;
    private final TimeProvider time;

    public MemoryGroupService(NamedParameterJdbcTemplate jdbc, MemoryService memories, MemoryAssembler assembler,
                              MediaRefs media, TimeProvider time) {
        this.jdbc = jdbc;
        this.memories = memories;
        this.assembler = assembler;
        this.media = media;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public List<MemoryGroup> list(SpaceContext ctx) {
        return jdbc.query("""
                SELECT g.id, g.name, g.cover_media_id, g.version,
                       (SELECT count(*) FROM memory_group_item i JOIN memory m ON m.id = i.memory_id
                         WHERE i.group_id = g.id AND m.deleted_at IS NULL) AS n,
                       (SELECT mm.media_id FROM memory_group_item i JOIN memory m ON m.id = i.memory_id
                          JOIN memory_media mm ON mm.memory_id = m.id
                         WHERE i.group_id = g.id AND m.deleted_at IS NULL ORDER BY m.occurred_on DESC, mm.position LIMIT 1) AS auto_cover
                  FROM memory_group g WHERE g.space_id = :s ORDER BY g.created_at DESC
                """, new MapSqlParameterSource("s", ctx.spaceId()), (rs, i) -> {
            MemoryGroup g = new MemoryGroup(rs.getObject("id", UUID.class), rs.getString("name"), rs.getInt("n"), rs.getLong("version"));
            UUID cover = rs.getObject("cover_media_id", UUID.class);
            g.cover(media.nullable(cover != null ? cover : rs.getObject("auto_cover", UUID.class)));
            return g;
        });
    }

    @Transactional
    public MemoryGroup create(SpaceContext ctx, String name, UUID coverMediaId) {
        UUID id = Ids.newId();
        checkCover(ctx, coverMediaId);
        jdbc.update("INSERT INTO memory_group (id, space_id, name, cover_media_id, created_at, updated_at) VALUES (:id, :s, :n, :c, :now, :now)",
                new MapSqlParameterSource("id", id).addValue("s", ctx.spaceId()).addValue("n", name.strip())
                        .addValue("c", coverMediaId).addValue("now", Timestamp.from(time.now())));
        return one(ctx, id);
    }

    @Transactional(readOnly = true)
    public MemoryGroupDetail detail(SpaceContext ctx, UUID id) {
        MemoryGroup g = one(ctx, id);
        List<UUID> ids = jdbc.queryForList("""
                SELECT m.id FROM memory_group_item i JOIN memory m ON m.id = i.memory_id
                 WHERE i.group_id = :g AND m.deleted_at IS NULL ORDER BY m.occurred_on DESC, m.created_at DESC
                """, new MapSqlParameterSource("g", id), UUID.class);
        MemoryGroupDetail d = new MemoryGroupDetail(g.getId(), g.getName(), g.getCount(), g.getVersion(),
                new ArrayList<>(assembler.summaries(ids, ctx.userId())));
        d.cover(g.getCover());
        return d;
    }

    @Transactional
    public MemoryGroup update(SpaceContext ctx, UUID id, String name, UUID coverMediaId, boolean coverGiven, long version) {
        Map<String, Object> row = lock(ctx, id);
        if (((Number) row.get("version")).longValue() != version) {
            throw new ApiException(ErrorCode.VERSION_CONFLICT, HttpStatus.CONFLICT, Map.of("current", one(ctx, id)));
        }
        if (coverGiven) {
            checkCover(ctx, coverMediaId);
        }
        jdbc.update("""
                UPDATE memory_group SET name = coalesce(:n, name),
                       cover_media_id = CASE WHEN :cg THEN :c ELSE cover_media_id END,
                       version = version + 1, updated_at = :now WHERE id = :id
                """, new MapSqlParameterSource("n", name == null ? null : name.strip()).addValue("cg", coverGiven)
                .addValue("c", coverMediaId).addValue("now", Timestamp.from(time.now())).addValue("id", id));
        return one(ctx, id);
    }

    /** Бүлгийг устгахад дурсамжууд хэвээр (AC-81). */
    @Transactional
    public void delete(SpaceContext ctx, UUID id) {
        lock(ctx, id);
        jdbc.update("DELETE FROM memory_group WHERE id = :id", new MapSqlParameterSource("id", id));
    }

    @Transactional
    public void add(SpaceContext ctx, UUID groupId, UUID memoryId) {
        lock(ctx, groupId);
        MemoryService.MemoryRef ref = memories.visible(memories.scope(ctx), memoryId);
        if (!ref.spaceId().equals(ctx.spaceId())) {
            throw ApiException.notFound(); // хувийн дурсамжийг хосын бүлэгт оруулахгүй
        }
        jdbc.update("INSERT INTO memory_group_item (group_id, memory_id, added_at) VALUES (:g, :m, :now) ON CONFLICT DO NOTHING",
                new MapSqlParameterSource("g", groupId).addValue("m", memoryId).addValue("now", Timestamp.from(time.now())));
    }

    @Transactional
    public void remove(SpaceContext ctx, UUID groupId, UUID memoryId) {
        lock(ctx, groupId);
        if (jdbc.update("DELETE FROM memory_group_item WHERE group_id = :g AND memory_id = :m",
                new MapSqlParameterSource("g", groupId).addValue("m", memoryId)) == 0) {
            throw ApiException.notFound();
        }
    }

    private MemoryGroup one(SpaceContext ctx, UUID id) {
        return list(ctx).stream().filter(g -> g.getId().equals(id)).findFirst().orElseThrow(ApiException::notFound);
    }

    private Map<String, Object> lock(SpaceContext ctx, UUID id) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT version FROM memory_group WHERE id = :id AND space_id = :s FOR UPDATE",
                new MapSqlParameterSource("id", id).addValue("s", ctx.spaceId()));
        if (rows.isEmpty()) {
            throw ApiException.notFound();
        }
        return rows.get(0);
    }

    private void checkCover(SpaceContext ctx, UUID coverMediaId) {
        if (coverMediaId != null && media.findInSpace(coverMediaId, ctx.spaceId()).isEmpty()) {
            throw ApiException.notFound();
        }
    }
}
