package mn.aura.couple.memory.app;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import mn.aura.couple.plan.app.DatePlanService;
import mn.aura.couple.api.model.Comment;
import mn.aura.couple.api.model.CommentPage;
import mn.aura.couple.api.model.Memory;
import mn.aura.couple.api.model.MemoryCreate;
import mn.aura.couple.api.model.MemoryMediaInput;
import mn.aura.couple.api.model.MemoryUpdate;
import mn.aura.couple.api.model.Perspective;
import mn.aura.couple.api.model.PerspectiveInput;
import mn.aura.couple.api.model.Place;
import mn.aura.couple.api.model.ReactionSummary;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.event.Notify;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.CoupleMembers;
import mn.aura.couple.couple.app.UserRefs;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Дурсамж (FR-5.1…5.10): үүсгэх (1–20 медиа, clientId-аар idempotent — outbox), засах (зөвхөн зохиогч —
 * INV-03 → 403, version зөрвөл 409 + серверийн хувилбар — DD-AURA-016), сэтгэгдэл, реакц (хүн тутам нэг),
 * хүн тутмын «Дуртай» (AC-83), хоёр өнцөг (хүн тутам нэг, өөрийнхийг л засна — AC-82). Хамтрагчид realtime
 * ба мэдэгдэл. Хувийн (SOLO-д үлдсэн) дурсамж зөвхөн зохиогчид (R-4).
 */
@Service
public class MemoryService {

    static final int MAX_MEDIA = 20;

    /** Хандалтын шалгалтын дараах мөр. */
    public record MemoryRef(UUID id, UUID spaceId, UUID authorId, boolean deleted, long version) {
    }

    private final NamedParameterJdbcTemplate jdbc;
    private final MemoryAssembler assembler;
    private final CoupleMembers couples;
    private final UserRefs users;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;
    private final DatePlanService datePlans;

    public MemoryService(NamedParameterJdbcTemplate jdbc, MemoryAssembler assembler, CoupleMembers couples,
                         UserRefs users, ApplicationEventPublisher events, TimeProvider time, DatePlanService datePlans) {
        this.datePlans = datePlans;
        this.jdbc = jdbc;
        this.assembler = assembler;
        this.couples = couples;
        this.users = users;
        this.events = events;
        this.time = time;
    }

    /** Болзоо энэ space-ийнх байх ёстой (AC-95) — өөр space-ийнх → 404. */
    private void requirePlan(SpaceContext ctx, UUID planId) {
        if (planId != null && !datePlans.exists(ctx.spaceId(), planId)) {
            throw ApiException.notFound();
        }
    }

    public MemoryScope scope(SpaceContext ctx) {
        Optional<UUID> solo = jdbc.queryForList("SELECT space_id FROM space_member WHERE user_id = :u AND space_kind = 'SOLO' "
                + "AND left_at IS NULL", new MapSqlParameterSource("u", ctx.userId()), UUID.class).stream().findFirst();
        return MemoryScope.of(ctx, solo, couples.partnerIn(ctx.spaceId(), ctx.userId()));
    }

    @Transactional
    public Memory create(SpaceContext ctx, MemoryCreate in) {
        MemoryScope scope = scope(ctx);
        List<UUID> existing = jdbc.queryForList("SELECT id FROM memory WHERE author_id = :a AND client_id = :c",
                new MapSqlParameterSource("a", ctx.userId()).addValue("c", in.getClientId()), UUID.class);
        if (!existing.isEmpty()) {
            return assembler.detail(existing.get(0), ctx.userId()); // outbox-оос давтан (DD-AURA-017)
        }
        if (in.getMedia() == null || in.getMedia().isEmpty() || in.getMedia().size() > MAX_MEDIA) {
            throw ApiException.badRequest(ErrorCode.MEDIA_LIMIT_EXCEEDED, "media");
        }
        requirePlan(ctx, in.getDatePlanId());
        UUID id = Ids.newId();
        Instant now = time.now();
        Set<String> tags = normalizeTags(in.getTags());
        Place loc = in.getLocation();
        MapSqlParameterSource p = new MapSqlParameterSource("id", id).addValue("space", ctx.spaceId())
                .addValue("author", ctx.userId()).addValue("client", in.getClientId()).addValue("title", in.getTitle().strip())
                .addValue("description", blankToNull(in.getDescription())).addValue("occurred", in.getOccurredOn())
                .addValue("dateSource", in.getDateSource().getValue())
                .addValue("locSource", loc == null ? "NONE" : in.getLocationSource().getValue())
                .addValue("datePlan", in.getDatePlanId()).addValue("now", Timestamp.from(now));
        place(p, loc);
        p.addValue("search", searchText(in.getTitle(), in.getDescription(), tags));
        try {
            jdbc.update("""
                    INSERT INTO memory (id, space_id, author_id, client_id, title, description, occurred_on, date_source,
                        location_name, lat, lon, city, country_code, location_source, date_plan_id, search_text, created_at, updated_at)
                    VALUES (:id, :space, :author, :client, :title, :description, :occurred, :dateSource, :locName, :lat, :lon,
                        :city, :country, :locSource, :datePlan, :search, :now, :now)
                    """, p);
        } catch (DuplicateKeyException e) {
            return assembler.detail(jdbc.queryForObject("SELECT id FROM memory WHERE author_id = :a AND client_id = :c",
                    new MapSqlParameterSource("a", ctx.userId()).addValue("c", in.getClientId()), UUID.class), ctx.userId());
        }
        setMedia(id, ctx, in.getMedia());
        setTags(id, tags);
        setGroups(id, ctx.spaceId(), in.getGroupIds());
        scope.partnerId().ifPresent(partner -> {
            events.publishEvent(RealtimeEvent.of("memory.created", ctx.userId(), List.of(partner),
                    Map.of("memoryId", id)));
            events.publishEvent(new Notify(partner, ctx.spaceId(), ctx.userId(), "MEMORY_CREATED",
                    Map.of("partner", users.ref(ctx.userId()).getDisplayName(), "title", in.getTitle().strip()),
                    "/memories/" + id));
        });
        return assembler.detail(id, ctx.userId());
    }

    @Transactional(readOnly = true)
    public Memory get(SpaceContext ctx, UUID id) {
        visible(scope(ctx), id);
        return assembler.detail(id, ctx.userId());
    }

    @Transactional
    public Memory update(SpaceContext ctx, UUID id, MemoryUpdate in) {
        MemoryScope scope = scope(ctx);
        MemoryRef ref = owned(scope, id, true);
        if (in.getVersion() == null || in.getVersion() != ref.version()) {
            Memory current = assembler.detail(id, ctx.userId());
            throw new ApiException(ErrorCode.VERSION_CONFLICT, HttpStatus.CONFLICT,
                    Map.of("current", current, "updatedBy", current.getAuthor().getDisplayName()));
        }
        Map<String, Object> cur = jdbc.queryForMap("SELECT title, description FROM memory WHERE id = :id",
                new MapSqlParameterSource("id", id));
        List<String> sets = new ArrayList<>();
        MapSqlParameterSource p = new MapSqlParameterSource("id", id).addValue("now", Timestamp.from(time.now()));
        String title = in.getTitle() != null ? in.getTitle().strip() : (String) cur.get("title");
        String description = in.getDescription() != null ? blankToNull(in.getDescription()) : (String) cur.get("description");
        if (in.getTitle() != null) {
            sets.add("title = :title");
            p.addValue("title", title);
        }
        if (in.getDescription() != null) {
            sets.add("description = :description");
            p.addValue("description", description);
        }
        if (in.getOccurredOn() != null) {
            sets.add("occurred_on = :occurred");
            p.addValue("occurred", in.getOccurredOn());
        }
        if (in.getDateSource() != null) {
            sets.add("date_source = :dateSource");
            p.addValue("dateSource", in.getDateSource().getValue());
        }
        if (in.getLocation() != null || in.getLocationSource() == MemoryUpdate.LocationSourceEnum.NONE) {
            Place loc = in.getLocation() == null ? null : toPlace(in.getLocation());
            place(p, loc);
            sets.add("location_name = :locName, lat = :lat, lon = :lon, city = :city, country_code = :country");
            sets.add("location_source = :locSource");
            p.addValue("locSource", loc == null ? "NONE"
                    : in.getLocationSource() == null ? "MANUAL" : in.getLocationSource().getValue());
        }
        if (in.getDatePlanId() != null) {
            requirePlan(ctx, in.getDatePlanId());
            sets.add("date_plan_id = :datePlan");
            p.addValue("datePlan", in.getDatePlanId());
        }
        Set<String> tags = in.getTags() != null ? normalizeTags(in.getTags()) : currentTags(id);
        sets.add("search_text = :search");
        p.addValue("search", searchText(title, description, tags));
        sets.add("version = version + 1");
        sets.add("updated_at = :now");
        jdbc.update("UPDATE memory SET " + String.join(", ", sets) + " WHERE id = :id", p);
        if (in.getTags() != null) {
            setTags(id, tags);
        }
        if (in.getMedia() != null) {
            if (in.getMedia().isEmpty() || in.getMedia().size() > MAX_MEDIA) {
                throw ApiException.badRequest(ErrorCode.MEDIA_LIMIT_EXCEEDED, "media");
            }
            jdbc.update("DELETE FROM memory_media WHERE memory_id = :id", new MapSqlParameterSource("id", id));
            setMedia(id, ctx, in.getMedia());
        }
        if (in.getGroupIds() != null) {
            jdbc.update("DELETE FROM memory_group_item WHERE memory_id = :id", new MapSqlParameterSource("id", id));
            setGroups(id, ref.spaceId(), in.getGroupIds());
        }
        publishUpdated(scope, ref.spaceId(), id, "memory.updated");
        return assembler.detail(id, ctx.userId());
    }

    // --- Сэтгэгдэл (AC-173) ---

    @Transactional
    public Comment comment(SpaceContext ctx, UUID memoryId, String text, UUID clientId) {
        MemoryScope scope = scope(ctx);
        MemoryRef ref = visible(scope, memoryId);
        MapSqlParameterSource key = new MapSqlParameterSource("a", ctx.userId()).addValue("c", clientId);
        List<UUID> existing = jdbc.queryForList("SELECT id FROM memory_comment WHERE author_id = :a AND client_id = :c", key, UUID.class);
        UUID id = existing.isEmpty() ? Ids.newId() : existing.get(0);
        if (existing.isEmpty()) {
            jdbc.update("""
                    INSERT INTO memory_comment (id, space_id, memory_id, author_id, client_id, text, created_at)
                    VALUES (:id, :space, :memory, :a, :c, :text, :now)
                    """, key.addValue("id", id).addValue("space", ref.spaceId()).addValue("memory", memoryId)
                    .addValue("text", text.strip()).addValue("now", Timestamp.from(time.now())));
            publishUpdated(scope, ref.spaceId(), memoryId, "memory.comment");
            if (!scope.isPrivate(ref.spaceId())) {
                scope.partnerId().ifPresent(partner -> events.publishEvent(new Notify(partner, ref.spaceId(), ctx.userId(),
                        "MEMORY_COMMENT", Map.of("partner", users.ref(ctx.userId()).getDisplayName(), "title", title(memoryId)),
                        "/memories/" + memoryId)));
            }
        }
        return comment(id);
    }

    @Transactional(readOnly = true)
    public CommentPage comments(SpaceContext ctx, UUID memoryId, String cursor, Integer limit) {
        visible(scope(ctx), memoryId);
        int size = limit == null ? 30 : Math.max(1, Math.min(100, limit));
        MapSqlParameterSource p = new MapSqlParameterSource("m", memoryId).addValue("limit", size + 1);
        String where = "";
        if (cursor != null && !cursor.isBlank()) {
            String[] c = decode(cursor);
            where = " AND (created_at, id) > (:at, :cid)";
            p.addValue("at", Timestamp.from(Instant.parse(c[0]))).addValue("cid", UUID.fromString(c[1]));
        }
        List<Comment> items = jdbc.query("SELECT id, memory_id, author_id, text, created_at, edited_at, version FROM memory_comment "
                + "WHERE memory_id = :m" + where + " ORDER BY created_at, id LIMIT :limit", p, (rs, i) -> assembler.comment(rs));
        boolean more = items.size() > size;
        List<Comment> page = more ? items.subList(0, size) : items;
        String next = more ? encode(page.get(page.size() - 1).getCreatedAt().toInstant() + "|" + page.get(page.size() - 1).getId()) : null;
        return new CommentPage(new ArrayList<>(page), next);
    }

    @Transactional
    public Comment updateComment(SpaceContext ctx, UUID commentId, String text, long version) {
        Map<String, Object> c = ownComment(ctx, commentId);
        if (((Number) c.get("version")).longValue() != version) {
            throw new ApiException(ErrorCode.VERSION_CONFLICT, HttpStatus.CONFLICT, Map.of("current", comment(commentId)));
        }
        jdbc.update("UPDATE memory_comment SET text = :t, edited_at = :now, version = version + 1 WHERE id = :id",
                new MapSqlParameterSource("t", text.strip()).addValue("now", Timestamp.from(time.now())).addValue("id", commentId));
        publishUpdated(scope(ctx), (UUID) c.get("space_id"), (UUID) c.get("memory_id"), "memory.comment");
        return comment(commentId);
    }

    @Transactional
    public void deleteComment(SpaceContext ctx, UUID commentId) {
        Map<String, Object> c = ownComment(ctx, commentId);
        jdbc.update("DELETE FROM memory_comment WHERE id = :id", new MapSqlParameterSource("id", commentId));
        jdbc.update("DELETE FROM reaction WHERE target_type = 'COMMENT' AND target_id = :id", new MapSqlParameterSource("id", commentId));
        publishUpdated(scope(ctx), (UUID) c.get("space_id"), (UUID) c.get("memory_id"), "memory.comment");
    }

    // --- Реакц, дуртай (AC-83, ANIM-07) ---

    @Transactional
    public List<ReactionSummary> react(SpaceContext ctx, UUID memoryId, String emoji) {
        MemoryScope scope = scope(ctx);
        MemoryRef ref = visible(scope, memoryId);
        jdbc.update("""
                INSERT INTO reaction (id, space_id, target_type, target_id, user_id, emoji, created_at)
                VALUES (:id, :space, 'MEMORY', :t, :u, :e, :now)
                ON CONFLICT (target_type, target_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = EXCLUDED.created_at
                """, new MapSqlParameterSource("id", Ids.newId()).addValue("space", ref.spaceId()).addValue("t", memoryId)
                .addValue("u", ctx.userId()).addValue("e", emoji).addValue("now", Timestamp.from(time.now())));
        publishUpdated(scope, ref.spaceId(), memoryId, "memory.reaction");
        return assembler.reactions("MEMORY", memoryId, ctx.userId());
    }

    @Transactional
    public List<ReactionSummary> unreact(SpaceContext ctx, UUID memoryId) {
        MemoryScope scope = scope(ctx);
        MemoryRef ref = visible(scope, memoryId);
        jdbc.update("DELETE FROM reaction WHERE target_type = 'MEMORY' AND target_id = :t AND user_id = :u",
                new MapSqlParameterSource("t", memoryId).addValue("u", ctx.userId()));
        publishUpdated(scope, ref.spaceId(), memoryId, "memory.reaction");
        return assembler.reactions("MEMORY", memoryId, ctx.userId());
    }

    @Transactional
    public void favorite(SpaceContext ctx, UUID memoryId, boolean on) {
        visible(scope(ctx), memoryId);
        MapSqlParameterSource p = new MapSqlParameterSource("m", memoryId).addValue("u", ctx.userId())
                .addValue("now", Timestamp.from(time.now()));
        if (on) {
            jdbc.update("INSERT INTO memory_favorite (memory_id, user_id, created_at) VALUES (:m, :u, :now) ON CONFLICT DO NOTHING", p);
        } else {
            jdbc.update("DELETE FROM memory_favorite WHERE memory_id = :m AND user_id = :u", p);
        }
    }

    // --- Хоёр өнцөг (AC-82) ---

    @Transactional
    public Perspective upsertPerspective(SpaceContext ctx, UUID memoryId, PerspectiveInput in) {
        MemoryScope scope = scope(ctx);
        MemoryRef ref = visible(scope, memoryId);
        MapSqlParameterSource p = new MapSqlParameterSource("m", memoryId).addValue("u", ctx.userId());
        List<Map<String, Object>> mine = jdbc.queryForList(
                "SELECT id, version FROM memory_perspective WHERE memory_id = :m AND author_id = :u FOR UPDATE", p);
        UUID audio = in.getAudioMediaId();
        if (audio != null) {
            ownMedia(ctx, audio);
        }
        p.addValue("text", in.getText() == null ? "" : in.getText().strip()).addValue("audio", audio)
                .addValue("now", Timestamp.from(time.now()));
        if (mine.isEmpty()) {
            jdbc.update("""
                    INSERT INTO memory_perspective (id, memory_id, author_id, text, audio_media_id, created_at, updated_at)
                    VALUES (:id, :m, :u, :text, :audio, :now, :now)
                    """, p.addValue("id", Ids.newId()));
        } else {
            long version = ((Number) mine.get(0).get("version")).longValue();
            if (in.getVersion() == null || in.getVersion() != version) {
                throw new ApiException(ErrorCode.VERSION_CONFLICT, HttpStatus.CONFLICT, Map.of("currentVersion", version));
            }
            jdbc.update("""
                    UPDATE memory_perspective SET text = :text, audio_media_id = :audio, version = version + 1, updated_at = :now
                     WHERE memory_id = :m AND author_id = :u
                    """, p);
        }
        publishUpdated(scope, ref.spaceId(), memoryId, "memory.updated");
        return assembler.perspectives(memoryId).stream().filter(x -> x.getAuthor().getId().equals(ctx.userId()))
                .findFirst().orElseThrow(ApiException::notFound);
    }

    @Transactional
    public void deletePerspective(SpaceContext ctx, UUID memoryId) {
        MemoryScope scope = scope(ctx);
        MemoryRef ref = visible(scope, memoryId);
        jdbc.update("DELETE FROM memory_perspective WHERE memory_id = :m AND author_id = :u",
                new MapSqlParameterSource("m", memoryId).addValue("u", ctx.userId()));
        publishUpdated(scope, ref.spaceId(), memoryId, "memory.updated");
    }

    // --- Хандалт ---

    /** Дуудагчид харагдах, устгаагүй дурсамж (өөр space → 404). */
    public MemoryRef visible(MemoryScope scope, UUID id) {
        MemoryRef ref = find(id).orElseThrow(ApiException::notFound);
        if (!scope.canSee(ref.spaceId(), ref.authorId()) || ref.deleted()) {
            throw ApiException.notFound();
        }
        return ref;
    }

    /** Зохиогчийн дурсамж: харагдахгүй → 404, бусдынх → 403 `NOT_OWNER` (INV-03, AC-22). */
    public MemoryRef owned(MemoryScope scope, UUID id, boolean lock) {
        MemoryRef ref = (lock ? findForUpdate(id) : find(id)).orElseThrow(ApiException::notFound);
        if (!scope.canSee(ref.spaceId(), ref.authorId())) {
            throw ApiException.notFound();
        }
        if (!ref.authorId().equals(scope.userId())) {
            throw new ApiException(ErrorCode.NOT_OWNER, HttpStatus.FORBIDDEN);
        }
        return ref;
    }

    Optional<MemoryRef> find(UUID id) {
        return jdbc.query("SELECT id, space_id, author_id, deleted_at, version FROM memory WHERE id = :id",
                new MapSqlParameterSource("id", id), (rs, i) -> new MemoryRef(rs.getObject("id", UUID.class),
                        rs.getObject("space_id", UUID.class), rs.getObject("author_id", UUID.class),
                        rs.getTimestamp("deleted_at") != null, rs.getLong("version"))).stream().findFirst();
    }

    private Optional<MemoryRef> findForUpdate(UUID id) {
        return jdbc.query("SELECT id, space_id, author_id, deleted_at, version FROM memory WHERE id = :id FOR UPDATE",
                new MapSqlParameterSource("id", id), (rs, i) -> new MemoryRef(rs.getObject("id", UUID.class),
                        rs.getObject("space_id", UUID.class), rs.getObject("author_id", UUID.class),
                        rs.getTimestamp("deleted_at") != null, rs.getLong("version"))).stream().findFirst();
    }

    /** Хамтрагчид (хуваалцсан дурсамжид л) realtime. */
    void publishUpdated(MemoryScope scope, UUID spaceId, UUID memoryId, String type) {
        List<UUID> recipients = new ArrayList<>(List.of(scope.userId()));
        if (!scope.isPrivate(spaceId)) {
            scope.partnerId().ifPresent(recipients::add);
        }
        events.publishEvent(RealtimeEvent.of(type, scope.userId(), recipients, Map.of("memoryId", memoryId)));
    }

    private void setMedia(UUID memoryId, SpaceContext ctx, List<MemoryMediaInput> items) {
        Set<UUID> seen = new LinkedHashSet<>();
        int position = 0;
        for (MemoryMediaInput item : items) {
            if (!seen.add(item.getMediaId())) {
                continue;
            }
            Map<String, Object> m = ownMedia(ctx, item.getMediaId());
            if (!"IMAGE".equals(m.get("kind")) && !"VIDEO".equals(m.get("kind"))) {
                throw new ApiException(ErrorCode.MEDIA_TYPE_FORBIDDEN, HttpStatus.UNSUPPORTED_MEDIA_TYPE);
            }
            jdbc.update("INSERT INTO memory_media (memory_id, media_id, position, alt_text) VALUES (:m, :x, :p, :alt)",
                    new MapSqlParameterSource("m", memoryId).addValue("x", item.getMediaId()).addValue("p", position++)
                            .addValue("alt", blankToNull(item.getAltText())));
        }
    }

    /** Медиа дуудагчийнх бөгөөд түүний харагдах space-д (идэвхтэй эсвэл хувийн). */
    private Map<String, Object> ownMedia(SpaceContext ctx, UUID mediaId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT m.kind FROM media m JOIN space_member sm ON sm.space_id = m.space_id AND sm.user_id = :u AND sm.left_at IS NULL
                 WHERE m.id = :id AND m.owner_id = :u
                """, new MapSqlParameterSource("id", mediaId).addValue("u", ctx.userId()));
        if (rows.isEmpty()) {
            throw ApiException.notFound();
        }
        return rows.get(0);
    }

    private void setTags(UUID memoryId, Set<String> tags) {
        jdbc.update("DELETE FROM memory_tag WHERE memory_id = :m", new MapSqlParameterSource("m", memoryId));
        for (String t : tags) {
            jdbc.update("INSERT INTO memory_tag (memory_id, tag) VALUES (:m, :t)", new MapSqlParameterSource("m", memoryId).addValue("t", t));
        }
    }

    private Set<String> currentTags(UUID memoryId) {
        return new LinkedHashSet<>(jdbc.queryForList("SELECT tag FROM memory_tag WHERE memory_id = :m",
                new MapSqlParameterSource("m", memoryId), String.class));
    }

    private void setGroups(UUID memoryId, UUID spaceId, List<UUID> groupIds) {
        if (groupIds == null) {
            return;
        }
        for (UUID g : new LinkedHashSet<>(groupIds)) {
            int n = jdbc.update("""
                    INSERT INTO memory_group_item (group_id, memory_id)
                    SELECT id, :m FROM memory_group WHERE id = :g AND space_id = :s ON CONFLICT DO NOTHING
                    """, new MapSqlParameterSource("m", memoryId).addValue("g", g).addValue("s", spaceId));
            if (n == 0 && jdbc.queryForList("SELECT 1 FROM memory_group WHERE id = :g AND space_id = :s",
                    new MapSqlParameterSource("g", g).addValue("s", spaceId), Integer.class).isEmpty()) {
                throw ApiException.notFound();
            }
        }
    }

    private Map<String, Object> ownComment(SpaceContext ctx, UUID commentId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT c.space_id, c.memory_id, c.author_id, c.version, m.author_id AS memory_author FROM memory_comment c "
                        + "JOIN memory m ON m.id = c.memory_id WHERE c.id = :id FOR UPDATE OF c",
                new MapSqlParameterSource("id", commentId));
        if (rows.isEmpty() || !scope(ctx).canSee((UUID) rows.get(0).get("space_id"), (UUID) rows.get(0).get("memory_author"))) {
            throw ApiException.notFound();
        }
        if (!ctx.userId().equals(rows.get(0).get("author_id"))) {
            throw new ApiException(ErrorCode.NOT_OWNER, HttpStatus.FORBIDDEN);
        }
        return rows.get(0);
    }

    private Comment comment(UUID id) {
        return jdbc.query("SELECT id, memory_id, author_id, text, created_at, edited_at, version FROM memory_comment WHERE id = :id",
                new MapSqlParameterSource("id", id), (rs, i) -> assembler.comment(rs)).stream().findFirst()
                .orElseThrow(ApiException::notFound);
    }

    private String title(UUID memoryId) {
        return jdbc.queryForObject("SELECT title FROM memory WHERE id = :id", new MapSqlParameterSource("id", memoryId), String.class);
    }

    private static void place(MapSqlParameterSource p, Place loc) {
        p.addValue("locName", loc == null ? null : loc.getName().strip())
                .addValue("lat", loc == null ? null : loc.getLat().doubleValue())
                .addValue("lon", loc == null ? null : loc.getLon().doubleValue())
                .addValue("city", loc == null ? null : loc.getCity())
                .addValue("country", loc == null ? null : loc.getCountryCode());
    }

    private static Place toPlace(Object nullablePlace) {
        org.springframework.beans.BeanWrapperImpl w = new org.springframework.beans.BeanWrapperImpl(nullablePlace);
        Place p = new Place((String) w.getPropertyValue("name"), (BigDecimal) w.getPropertyValue("lat"),
                (BigDecimal) w.getPropertyValue("lon"));
        p.city((String) w.getPropertyValue("city"));
        p.countryCode((String) w.getPropertyValue("countryCode"));
        return p;
    }

    static Set<String> normalizeTags(List<String> tags) {
        Set<String> out = new LinkedHashSet<>();
        if (tags != null) {
            for (String t : tags) {
                String n = t == null ? "" : t.strip().toLowerCase(Locale.ROOT).replaceAll("^#", "");
                if (!n.isEmpty() && n.length() <= 40) {
                    out.add(n);
                }
            }
        }
        return out;
    }

    static String searchText(String title, String description, Set<String> tags) {
        return (title + " " + (description == null ? "" : description) + " " + String.join(" ", tags))
                .toLowerCase(Locale.ROOT).strip();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    static String encode(String s) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(s.getBytes(StandardCharsets.UTF_8));
    }

    static String[] decode(String cursor) {
        try {
            String[] parts = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8).split("\\|");
            if (parts.length < 2) {
                throw new IllegalArgumentException(cursor);
            }
            return parts;
        } catch (IllegalArgumentException e) {
            throw ApiException.validation("cursor", ErrorCode.VALIDATION_FAILED);
        }
    }

    static OffsetDateTime utc(Instant i) {
        return i == null ? null : OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }
}
