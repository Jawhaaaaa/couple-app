package mn.aura.couple.lists.app;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import mn.aura.couple.api.model.ListItem;
import mn.aura.couple.api.model.ListItemInput;
import mn.aura.couple.api.model.ListItemUpdate;
import mn.aura.couple.api.model.WishType;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.CoupleMembers;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Хамтын жагсаалт (FR-9.1, 9.2, 9.5, 9.6): bucket, to-do, худалдан авалт, wishlist.
 * <ul>
 *   <li>Хэн, хэзээ дуусгасан нь (`doneBy`, `doneAt`) хоёр талд харагдана; дууссан нь доор бүлэглэгдэнэ (AC-107)</li>
 *   <li>«Дууссаныг цэвэрлэх» — мөрийг устгахгүй, `cleared_at` тавьж жагсаалтаас гаргана (AC-107)</li>
 *   <li>«Хүсэж байна» санал хүн тутам нэг; хоёулаа хүсвэл `bothWant` ба дээд талд (AC-109)</li>
 *   <li>Чирж эрэмбэлэх нь `position`; дараалал хоёр талд ижил (AC-109). Эрэмбэ нь `version` өсгөхгүй —
 *       агуулгын засвартай зөрчилдөхгүй</li>
 *   <li>Засварт `version` заавал; зөрвөл 409 `VERSION_CONFLICT` + серверийн одоогийн зүйл, хэн өөрчилсөн
 *       (DD-AURA-016, AC-41, AC-131) — аль ч өөрчлөлт чимээгүй дарагдахгүй</li>
 * </ul>
 * Bucket дуусахад «Дурсамж болгох уу?», wishlist-ээс «Болзоо болгох» нь client талд ноорог (AC-106, AC-110).
 * Өөрчлөлт бүр `list.updated`-аар space-ийн гишүүдэд түгнэ.
 */
@Service
public class SharedListService {

    /** Гэрээний `listKind` (path) ↔ DB-ийн `list_kind`. */
    public enum Kind {
        BUCKET, TODO, SHOPPING, WISHLIST;

        public String path() {
            return name().toLowerCase(Locale.ROOT);
        }

        /** Мэдэгдэхгүй төрөл → 404 (гэрээнд path enum). */
        public static Kind of(String path) {
            if (path != null) {
                for (Kind k : values()) {
                    if (k.path().equals(path)) {
                        return k;
                    }
                }
            }
            throw ApiException.notFound();
        }
    }

    private static final String COLUMNS = """
            i.id, i.space_id, i.list_kind, i.title, i.description, i.category, i.wish_type, i.position, i.created_by,
            i.updated_by, i.done_by, i.done_at, i.version
            """;

    /** Харагдах дараалал: нээлттэй нь эхэнд (хоёулаа хүссэн нь хамгийн дээр), дууссан нь доор. */
    private static final String ORDER = """
             ORDER BY (i.done_at IS NOT NULL),
                      (SELECT count(*) FROM list_item_vote v WHERE v.item_id = i.id) >= 2 DESC,
                      i.position, i.created_at, i.id
            """;

    private final NamedParameterJdbcTemplate jdbc;
    private final CoupleMembers couples;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;

    public SharedListService(NamedParameterJdbcTemplate jdbc, CoupleMembers couples, ApplicationEventPublisher events,
                             TimeProvider time) {
        this.jdbc = jdbc;
        this.couples = couples;
        this.events = events;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public List<ListItem> list(SpaceContext ctx, String listKind) {
        return items(ctx.spaceId(), Kind.of(listKind));
    }

    @Transactional
    public ListItem create(SpaceContext ctx, String listKind, ListItemInput in) {
        Kind kind = Kind.of(listKind);
        MapSqlParameterSource key = new MapSqlParameterSource("u", ctx.userId()).addValue("c", in.getClientId());
        List<UUID> existing = jdbc.queryForList("SELECT id FROM list_item WHERE created_by = :u AND client_id = :c", key, UUID.class);
        if (!existing.isEmpty()) {
            return one(existing.get(0)); // outbox-оос давтан ирсэн (DD-AURA-017)
        }
        UUID id = Ids.newId();
        Integer next = jdbc.queryForObject("""
                SELECT coalesce(max(position) + 1, 0) FROM list_item
                 WHERE space_id = :s AND list_kind = :k AND cleared_at IS NULL
                """, new MapSqlParameterSource("s", ctx.spaceId()).addValue("k", kind.name()), Integer.class);
        WishType wish = kind == Kind.WISHLIST ? in.getWishType() : null;
        try {
            jdbc.update("""
                    INSERT INTO list_item (id, space_id, list_kind, client_id, title, description, category, wish_type,
                        position, created_by, updated_by, created_at, updated_at)
                    VALUES (:id, :s, :k, :c, :title, :description, :category, :wish, :pos, :u, :u, :now, :now)
                    """, key.addValue("id", id).addValue("s", ctx.spaceId()).addValue("k", kind.name())
                    .addValue("title", in.getTitle().strip()).addValue("description", blankToNull(in.getDescription()))
                    .addValue("category", blankToNull(in.getCategory())).addValue("wish", wish == null ? null : wish.getValue())
                    .addValue("pos", next == null ? 0 : next).addValue("now", Timestamp.from(time.now())));
        } catch (DuplicateKeyException e) {
            return one(jdbc.queryForObject("SELECT id FROM list_item WHERE created_by = :u AND client_id = :c", key, UUID.class));
        }
        ListItem item = one(id);
        publish(ctx, kind, item, false);
        return item;
    }

    @Transactional
    public ListItem update(SpaceContext ctx, UUID itemId, ListItemUpdate in) {
        Row row = lockVisible(ctx, itemId);
        if (in.getVersion() == null || in.getVersion() != row.version()) {
            ListItem current = one(itemId);
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("current", current);
            details.put("currentVersion", current.getVersion());
            details.put("updatedBy", row.updatedBy() == null ? row.createdBy() : row.updatedBy());
            throw new ApiException(ErrorCode.VERSION_CONFLICT, HttpStatus.CONFLICT, details);
        }
        List<String> sets = new ArrayList<>();
        MapSqlParameterSource p = new MapSqlParameterSource("id", itemId).addValue("u", ctx.userId())
                .addValue("now", Timestamp.from(time.now()));
        if (in.getTitle() != null) {
            sets.add("title = :title");
            p.addValue("title", in.getTitle().strip());
        }
        if (in.getDescription() != null) {
            sets.add("description = :description");
            p.addValue("description", blankToNull(in.getDescription()));
        }
        if (in.getDone() != null && in.getDone() != row.done()) {
            sets.add(in.getDone() ? "done_by = :u, done_at = :now" : "done_by = NULL, done_at = NULL");
        }
        if (!sets.isEmpty()) {
            sets.add("updated_by = :u");
            sets.add("updated_at = :now");
            sets.add("version = version + 1");
            jdbc.update("UPDATE list_item SET " + String.join(", ", sets) + " WHERE id = :id", p);
        }
        ListItem item = one(itemId);
        if (!sets.isEmpty()) {
            publish(ctx, row.kind(), item, false);
        }
        return item;
    }

    @Transactional
    public void delete(SpaceContext ctx, UUID itemId) {
        Row row = lockVisible(ctx, itemId);
        ListItem last = one(itemId);
        jdbc.update("DELETE FROM list_item WHERE id = :id", new MapSqlParameterSource("id", itemId));
        publish(ctx, row.kind(), last, true);
    }

    @Transactional
    public ListItem vote(SpaceContext ctx, UUID itemId, boolean on) {
        Row row = lockVisible(ctx, itemId);
        MapSqlParameterSource p = new MapSqlParameterSource("i", itemId).addValue("u", ctx.userId())
                .addValue("now", Timestamp.from(time.now()));
        int changed = on
                ? jdbc.update("INSERT INTO list_item_vote (item_id, user_id, created_at) VALUES (:i, :u, :now) ON CONFLICT DO NOTHING", p)
                : jdbc.update("DELETE FROM list_item_vote WHERE item_id = :i AND user_id = :u", p);
        ListItem item = one(itemId);
        if (changed > 0) {
            publish(ctx, row.kind(), item, false);
        }
        return item;
    }

    /**
     * Чирж эрэмбэлэх (AC-109). `itemIds` нь жагсаалтын бүх нээлттэй зүйлийг агуулах ёстой (дууссаныг оруулж
     * болно); өөр төхөөрөмжөөс зүйл нэмэгдсэн/хасагдсан бол 409 — client жагсаалтаа шинэчлээд дахин эрэмбэлнэ.
     */
    @Transactional
    public List<ListItem> reorder(SpaceContext ctx, String listKind, Set<UUID> itemIds) {
        Kind kind = Kind.of(listKind);
        MapSqlParameterSource scope = new MapSqlParameterSource("s", ctx.spaceId()).addValue("k", kind.name());
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT id, done_at FROM list_item WHERE space_id = :s AND list_kind = :k AND cleared_at IS NULL
                 ORDER BY position, created_at, id FOR UPDATE
                """, scope);
        Set<UUID> all = new LinkedHashSet<>();
        Set<UUID> open = new LinkedHashSet<>();
        for (Map<String, Object> r : rows) {
            all.add((UUID) r.get("id"));
            if (r.get("done_at") == null) {
                open.add((UUID) r.get("id"));
            }
        }
        Set<UUID> wanted = itemIds == null ? Set.of() : itemIds;
        if (!all.containsAll(wanted) || !wanted.containsAll(open)) {
            List<ListItem> current = items(ctx.spaceId(), kind);
            long maxVersion = current.stream().mapToLong(ListItem::getVersion).max().orElse(0);
            throw new ApiException(ErrorCode.VERSION_CONFLICT, HttpStatus.CONFLICT,
                    Map.of("current", Map.of("items", current), "currentVersion", maxVersion));
        }
        List<UUID> order = new ArrayList<>(wanted);
        all.stream().filter(id -> !wanted.contains(id)).forEach(order::add); // дууссан, жагсаагдаагүй нь ард
        MapSqlParameterSource[] batch = new MapSqlParameterSource[order.size()];
        for (int i = 0; i < order.size(); i++) {
            batch[i] = new MapSqlParameterSource("id", order.get(i)).addValue("pos", i);
        }
        jdbc.batchUpdate("UPDATE list_item SET position = :pos WHERE id = :id", batch);
        List<ListItem> result = items(ctx.spaceId(), kind);
        result.forEach(item -> publish(ctx, kind, item, false));
        return result;
    }

    /** «Дууссаныг цэвэрлэх» (AC-107) — цэвэрлэсэн тоо. */
    @Transactional
    public int clearDone(SpaceContext ctx, String listKind) {
        Kind kind = Kind.of(listKind);
        List<ListItem> done = items(ctx.spaceId(), kind).stream().filter(i -> i.getDoneAt() != null).toList();
        if (done.isEmpty()) {
            return 0;
        }
        jdbc.update("""
                UPDATE list_item SET cleared_at = :now
                 WHERE space_id = :s AND list_kind = :k AND cleared_at IS NULL AND done_at IS NOT NULL
                """, new MapSqlParameterSource("s", ctx.spaceId()).addValue("k", kind.name())
                .addValue("now", Timestamp.from(time.now())));
        done.forEach(item -> publish(ctx, kind, item, true));
        return done.size();
    }

    // --- Дотоод ---

    private record Row(UUID id, Kind kind, boolean done, UUID createdBy, UUID updatedBy, long version) {
    }

    /** Space-ийн цэвэрлэгдээгүй зүйл (мөрийг түгжинэ); өөр space-ийнх → 404 (DD-AURA-004). */
    private Row lockVisible(SpaceContext ctx, UUID itemId) {
        List<Row> rows = jdbc.query("""
                SELECT id, list_kind, done_at, created_by, updated_by, version FROM list_item
                 WHERE id = :id AND space_id = :s AND cleared_at IS NULL FOR UPDATE
                """, new MapSqlParameterSource("id", itemId).addValue("s", ctx.spaceId()),
                (rs, i) -> new Row(rs.getObject("id", UUID.class), Kind.valueOf(rs.getString("list_kind")),
                        rs.getTimestamp("done_at") != null, rs.getObject("created_by", UUID.class),
                        rs.getObject("updated_by", UUID.class), rs.getLong("version")));
        if (rows.isEmpty()) {
            throw ApiException.notFound();
        }
        return rows.get(0);
    }

    private List<ListItem> items(UUID spaceId, Kind kind) {
        List<ListItem> items = jdbc.query("SELECT " + COLUMNS + " FROM list_item i "
                        + "WHERE i.space_id = :s AND i.list_kind = :k AND i.cleared_at IS NULL" + ORDER,
                new MapSqlParameterSource("s", spaceId).addValue("k", kind.name()), (rs, n) -> map(rs));
        return withVotes(items);
    }

    private ListItem one(UUID id) {
        List<ListItem> items = jdbc.query("SELECT " + COLUMNS + " FROM list_item i WHERE i.id = :id",
                new MapSqlParameterSource("id", id), (rs, n) -> map(rs));
        if (items.isEmpty()) {
            throw ApiException.notFound();
        }
        return withVotes(items).get(0);
    }

    private List<ListItem> withVotes(List<ListItem> items) {
        if (items.isEmpty()) {
            return items;
        }
        Map<UUID, List<UUID>> votes = new HashMap<>();
        jdbc.query("SELECT item_id, user_id FROM list_item_vote WHERE item_id IN (:ids) ORDER BY created_at, user_id",
                new MapSqlParameterSource("ids", items.stream().map(ListItem::getId).toList()),
                rs -> {
                    votes.computeIfAbsent(rs.getObject("item_id", UUID.class), k -> new ArrayList<>())
                            .add(rs.getObject("user_id", UUID.class));
                });
        for (ListItem item : items) {
            List<UUID> v = votes.getOrDefault(item.getId(), List.of());
            item.votes(new ArrayList<>(v));
            item.bothWant(v.size() >= 2);
        }
        return items;
    }

    private static ListItem map(ResultSet rs) throws SQLException {
        ListItem item = new ListItem(rs.getObject("id", UUID.class), rs.getString("title"), rs.getInt("position"),
                rs.getObject("created_by", UUID.class), new ArrayList<>(), false, rs.getLong("version"));
        item.description(rs.getString("description"));
        item.category(rs.getString("category"));
        String wish = rs.getString("wish_type");
        item.wishType(wish == null ? null : WishType.fromValue(wish));
        item.doneBy(rs.getObject("done_by", UUID.class));
        Timestamp doneAt = rs.getTimestamp("done_at");
        item.doneAt(doneAt == null ? null : OffsetDateTime.ofInstant(doneAt.toInstant(), ZoneOffset.UTC));
        return item;
    }

    /** `list.updated` (asyncapi) — space-ийн гишүүд бүгдэд (хамтрагч ба өөрийн бусад төхөөрөмж). */
    private void publish(SpaceContext ctx, Kind kind, ListItem item, boolean removed) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("listKind", kind.path());
        payload.put("item", item);
        if (removed) {
            payload.put("removed", true);
        }
        events.publishEvent(RealtimeEvent.of("list.updated", ctx.userId(), couples.members(ctx.spaceId()), payload));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
