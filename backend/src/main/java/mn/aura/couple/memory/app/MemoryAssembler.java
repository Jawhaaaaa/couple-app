package mn.aura.couple.memory.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import mn.aura.couple.api.model.Comment;
import mn.aura.couple.api.model.MediaRef;
import mn.aura.couple.api.model.Memory;
import mn.aura.couple.api.model.MemoryGroupRef;
import mn.aura.couple.api.model.MemoryMediaItem;
import mn.aura.couple.api.model.MemorySummary;
import mn.aura.couple.api.model.NullablePlace;
import mn.aura.couple.api.model.Perspective;
import mn.aura.couple.api.model.ReactionEmoji;
import mn.aura.couple.api.model.ReactionSummary;
import mn.aura.couple.api.model.UserRef;
import mn.aura.couple.couple.app.UserRefs;
import mn.aura.couple.media.app.MediaRefs;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * `MemorySummary` / `Memory` DTO — жагсаалтад N+1-гүйгээр (нэг хайлтаар нүүр зураг, тоо, дуртай).
 * `visibility`: SOLO space-д үлдсэн бол PRIVATE (AC-67, R-4). `status`: медиа бүгд бэлэн биш бол UPLOADING.
 */
@Component
public class MemoryAssembler {

    private final NamedParameterJdbcTemplate jdbc;
    private final MediaRefs media;
    private final UserRefs users;
    private final ObjectMapper mapper;

    public MemoryAssembler(NamedParameterJdbcTemplate jdbc, MediaRefs media, UserRefs users, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.media = media;
        this.users = users;
        this.mapper = mapper;
    }

    record Row(UUID id, UUID spaceId, String spaceKind, UUID authorId, String title, String description,
               java.time.LocalDate occurredOn, String dateSource, String locationName, Double lat, Double lon, String city,
               String countryCode, String locationSource, Instant createdAt, long version, int mediaCount,
               int pendingMedia, UUID coverId, int commentCount, boolean favorite) {
    }

    /** `ids`-ийн дарааллаар (олдоогүйг алгасна). */
    public List<MemorySummary> summaries(Collection<UUID> ids, UUID viewer) {
        Map<UUID, Row> rows = rows(ids, viewer);
        Map<UUID, UserRef> authors = users.refs(rows.values().stream().map(Row::authorId).distinct().toList());
        Map<UUID, MediaRef> covers = media.findAll(rows.values().stream().map(Row::coverId).filter(Objects::nonNull).toList());
        List<MemorySummary> out = new ArrayList<>();
        for (UUID id : ids) {
            Row r = rows.get(id);
            if (r != null) {
                out.add(summary(r, authors.get(r.authorId()), r.coverId() == null ? null : covers.get(r.coverId())));
            }
        }
        return out;
    }

    public Memory detail(UUID id, UUID viewer) {
        Row r = rows(List.of(id), viewer).get(id);
        if (r == null) {
            throw mn.aura.couple.common.ApiException.notFound();
        }
        MapSqlParameterSource p = new MapSqlParameterSource("id", id).addValue("viewer", viewer);
        List<MemoryMediaItem> items = new ArrayList<>();
        List<Map<String, Object>> mediaRows = jdbc.queryForList(
                "SELECT media_id, position, alt_text FROM memory_media WHERE memory_id = :id ORDER BY position", p);
        Map<UUID, MediaRef> refs = media.findAll(mediaRows.stream().map(m -> (UUID) m.get("media_id")).toList());
        for (Map<String, Object> m : mediaRows) {
            MediaRef ref = refs.get((UUID) m.get("media_id"));
            if (ref != null) {
                MemoryMediaItem item = new MemoryMediaItem(ref, ((Number) m.get("position")).intValue());
                item.altText((String) m.get("alt_text"));
                items.add(item);
            }
        }
        List<String> tags = jdbc.queryForList("SELECT tag FROM memory_tag WHERE memory_id = :id ORDER BY tag", p, String.class);
        List<MemoryGroupRef> groups = jdbc.query("""
                SELECT g.id, g.name FROM memory_group_item i JOIN memory_group g ON g.id = i.group_id
                 WHERE i.memory_id = :id ORDER BY g.name
                """, p, (rs, i) -> new MemoryGroupRef(rs.getObject("id", UUID.class), rs.getString("name")));
        List<Comment> comments = latestComments(id, 20);
        MemorySummary s = summary(r, users.ref(r.authorId()), null);
        Memory m = new Memory(s.getId(), s.getTitle(), s.getOccurredOn(), Memory.VisibilityEnum.fromValue(s.getVisibility().getValue()),
                Memory.StatusEnum.fromValue(s.getStatus().getValue()), s.getMediaCount(), s.getAuthor(), s.getCommentCount(),
                s.getFavorite(), s.getCreatedAt(), r.description(), items, tags, groups, perspectives(id), comments,
                reactions("MEMORY", id, viewer), r.favorite(), r.version());
        m.location(s.getLocation());
        m.cover(items.isEmpty() ? null : media.nullable(items.get(0).getMedia()));
        m.dateSource(Memory.DateSourceEnum.fromValue(r.dateSource()));
        m.locationSource(Memory.LocationSourceEnum.fromValue(r.locationSource()));
        return m;
    }

    public List<Perspective> perspectives(UUID memoryId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT id, author_id, text, audio_media_id, version FROM memory_perspective WHERE memory_id = :id ORDER BY created_at
                """, new MapSqlParameterSource("id", memoryId));
        Map<UUID, UserRef> authors = users.refs(rows.stream().map(r -> (UUID) r.get("author_id")).toList());
        List<Perspective> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Perspective p = new Perspective((UUID) r.get("id"), authors.get((UUID) r.get("author_id")), (String) r.get("text"),
                    ((Number) r.get("version")).longValue());
            p.audio(media.nullable((UUID) r.get("audio_media_id")));
            out.add(p);
        }
        return out;
    }

    public List<Comment> latestComments(UUID memoryId, int limit) {
        List<Comment> desc = jdbc.query("""
                SELECT id, memory_id, author_id, text, created_at, edited_at, version FROM memory_comment
                 WHERE memory_id = :id ORDER BY created_at DESC, id DESC LIMIT :limit
                """, new MapSqlParameterSource("id", memoryId).addValue("limit", limit), (rs, i) -> comment(rs));
        List<Comment> asc = new ArrayList<>(desc);
        java.util.Collections.reverse(asc);
        return asc;
    }

    Comment comment(java.sql.ResultSet rs) throws java.sql.SQLException {
        Comment c = new Comment(rs.getObject("id", UUID.class), rs.getObject("memory_id", UUID.class),
                users.ref(rs.getObject("author_id", UUID.class)), rs.getString("text"),
                OffsetDateTime.ofInstant(rs.getTimestamp("created_at").toInstant(), ZoneOffset.UTC), rs.getLong("version"));
        Timestamp edited = rs.getTimestamp("edited_at");
        c.editedAt(edited == null ? null : OffsetDateTime.ofInstant(edited.toInstant(), ZoneOffset.UTC));
        return c;
    }

    /** Объектын реакцын нэгтгэл (дурсамж, мессеж — хүн тутам нэг). */
    public List<ReactionSummary> reactions(String targetType, UUID targetId, UUID viewer) {
        Map<String, List<UUID>> byEmoji = new LinkedHashMap<>();
        jdbc.query("SELECT emoji, user_id FROM reaction WHERE target_type = :t AND target_id = :id ORDER BY created_at",
                new MapSqlParameterSource("t", targetType).addValue("id", targetId),
                rs -> {
                    byEmoji.computeIfAbsent(rs.getString("emoji"), k -> new ArrayList<>()).add(rs.getObject("user_id", UUID.class));
                });
        List<ReactionSummary> out = new ArrayList<>();
        byEmoji.forEach((emoji, ids) -> out.add(new ReactionSummary(ReactionEmoji.fromValue(emoji), ids.size(), ids,
                ids.contains(viewer))));
        return out;
    }

    private Map<UUID, Row> rows(Collection<UUID> ids, UUID viewer) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<UUID, Row> out = new HashMap<>();
        jdbc.query("""
                SELECT m.id, m.space_id, s.kind AS space_kind, m.author_id, m.title, m.description, m.occurred_on, m.date_source,
                       m.location_name, m.lat, m.lon, m.city, m.country_code, m.location_source, m.created_at, m.version,
                       (SELECT count(*) FROM memory_media mm WHERE mm.memory_id = m.id) AS media_count,
                       (SELECT count(*) FROM memory_media mm JOIN media x ON x.id = mm.media_id
                         WHERE mm.memory_id = m.id AND x.status IN ('PENDING', 'PROCESSING')) AS pending_media,
                       (SELECT mm.media_id FROM memory_media mm WHERE mm.memory_id = m.id ORDER BY mm.position LIMIT 1) AS cover_id,
                       (SELECT count(*) FROM memory_comment c WHERE c.memory_id = m.id) AS comment_count,
                       EXISTS (SELECT 1 FROM memory_favorite f WHERE f.memory_id = m.id AND f.user_id = :viewer) AS favorite
                  FROM memory m JOIN space s ON s.id = m.space_id
                 WHERE m.id IN (:ids)
                """, new MapSqlParameterSource("ids", ids).addValue("viewer", viewer), rs -> {
            Row r = new Row(rs.getObject("id", UUID.class), rs.getObject("space_id", UUID.class), rs.getString("space_kind"),
                    rs.getObject("author_id", UUID.class), rs.getString("title"), rs.getString("description"),
                    rs.getDate("occurred_on").toLocalDate(), rs.getString("date_source"), rs.getString("location_name"),
                    (Double) rs.getObject("lat"), (Double) rs.getObject("lon"), rs.getString("city"),
                    rs.getString("country_code"), rs.getString("location_source"), rs.getTimestamp("created_at").toInstant(),
                    rs.getLong("version"), rs.getInt("media_count"), rs.getInt("pending_media"),
                    rs.getObject("cover_id", UUID.class), rs.getInt("comment_count"), rs.getBoolean("favorite"));
            out.put(r.id(), r);
        });
        return out;
    }

    private MemorySummary summary(Row r, UserRef author, MediaRef cover) {
        MemorySummary s = new MemorySummary(r.id(), r.title(), r.occurredOn(),
                "SOLO".equals(r.spaceKind()) ? MemorySummary.VisibilityEnum.PRIVATE : MemorySummary.VisibilityEnum.SHARED,
                r.pendingMedia() > 0 ? MemorySummary.StatusEnum.UPLOADING : MemorySummary.StatusEnum.READY,
                r.mediaCount(), author, r.commentCount(), r.favorite(),
                OffsetDateTime.ofInstant(r.createdAt(), ZoneOffset.UTC));
        s.cover(media.nullable(cover));
        s.location(place(r));
        return s;
    }

    private NullablePlace place(Row r) {
        if (r.locationName() == null || r.lat() == null || r.lon() == null) {
            return null;
        }
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("name", r.locationName());
        p.put("lat", BigDecimal.valueOf(r.lat()));
        p.put("lon", BigDecimal.valueOf(r.lon()));
        p.put("city", r.city());
        p.put("countryCode", r.countryCode());
        return mapper.convertValue(p, NullablePlace.class);
    }
}
