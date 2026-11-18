package mn.aura.couple.letter.app;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import mn.aura.couple.api.model.Capsule;
import mn.aura.couple.api.model.CapsulePartsInner;
import mn.aura.couple.api.model.CapsuleStatus;
import mn.aura.couple.api.model.CapsuleSummary;
import mn.aura.couple.api.model.MediaRef;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.event.Notify;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.CoupleMembers;
import mn.aura.couple.couple.app.UserRefs;
import mn.aura.couple.media.app.MediaRefs;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Цагийн капсул (FR-10.5, GAP-15, AC-45).
 * <ul>
 *   <li>Үүсгэгч хамтрагчаа урина — гишүүн бүр өөрийн хэсгийг (бичвэр, ≤ 5 зураг) бичиж битүүмжилнэ</li>
 *   <li>Битүүмжилсэн хэсгийг засахгүй (409 `CAPSULE_SEALED`); хоёулаа битүүмжилсний дараа капсул `SEALED` — түгжинэ</li>
 *   <li>Нээх огноо хүртэл хэнд ч (үүсгэгч, өөрийн хэсгийн зохиогч ч) агуулга 0 — API зөвхөн «битүүмжилсэн эсэх»-ийг өгнө</li>
 *   <li>Огноо (хосын бүсээр) болж, хоёулаа битүүмжилсэн бол `LetterDeliveryJob` нээнэ — хоёуланд `capsule.opened`,
 *       мэдэгдэл (ANIM-21)</li>
 * </ul>
 */
@Service
public class TimeCapsuleService {

    private final NamedParameterJdbcTemplate jdbc;
    private final CoupleMembers couples;
    private final UserRefs users;
    private final MediaRefs media;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;

    public TimeCapsuleService(NamedParameterJdbcTemplate jdbc, CoupleMembers couples, UserRefs users, MediaRefs media,
                              ApplicationEventPublisher events, TimeProvider time) {
        this.jdbc = jdbc;
        this.couples = couples;
        this.users = users;
        this.media = media;
        this.events = events;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public List<CapsuleSummary> list(SpaceContext ctx) {
        return jdbc.query("SELECT id, title, open_on, status FROM capsule WHERE space_id = :s ORDER BY open_on, created_at, id",
                new MapSqlParameterSource("s", ctx.spaceId()), (rs, i) -> new CapsuleSummary(rs.getObject("id", UUID.class),
                        rs.getString("title"), rs.getDate("open_on").toLocalDate(),
                        CapsuleStatus.fromValue(rs.getString("status"))));
    }

    @Transactional
    public Capsule create(SpaceContext ctx, String title, LocalDate openOn) {
        String clean = title == null ? "" : title.strip();
        if (clean.isEmpty() || clean.length() > 80) {
            throw ApiException.validation("title", ErrorCode.VALIDATION_FAILED);
        }
        if (openOn == null || !openOn.isAfter(today(ctx.spaceId()))) {
            throw ApiException.validation("openOn", ErrorCode.VALIDATION_FAILED);
        }
        UUID id = Ids.newId();
        jdbc.update("""
                INSERT INTO capsule (id, space_id, creator_id, title, open_on, created_at)
                VALUES (:id, :s, :u, :title, :open, :now)
                """, new MapSqlParameterSource("id", id).addValue("s", ctx.spaceId()).addValue("u", ctx.userId())
                .addValue("title", clean).addValue("open", Date.valueOf(openOn)).addValue("now", Timestamp.from(time.now())));
        return get(ctx, id);
    }

    @Transactional(readOnly = true)
    public Capsule get(SpaceContext ctx, UUID capsuleId) {
        return toDto(require(ctx, capsuleId, false));
    }

    @Transactional
    public Capsule putMyPart(SpaceContext ctx, UUID capsuleId, String body, List<UUID> mediaIds) {
        Map<String, Object> c = require(ctx, capsuleId, true);
        if (!"WRITING".equals(c.get("status")) || mySealed(capsuleId, ctx.userId())) {
            throw new ApiException(ErrorCode.CAPSULE_SEALED, HttpStatus.CONFLICT);
        }
        if (body == null || body.length() > 20000) {
            throw ApiException.validation("body", ErrorCode.VALIDATION_FAILED);
        }
        List<UUID> ids = mediaIds == null ? List.of() : mediaIds.stream().distinct().toList();
        if (ids.size() > LetterService.MAX_MEDIA) {
            throw ApiException.badRequest(ErrorCode.MEDIA_LIMIT_EXCEEDED, "mediaIds");
        }
        for (UUID m : ids) {
            Integer own = jdbc.queryForObject("""
                    SELECT count(*) FROM media WHERE id = :id AND space_id = :s AND owner_id = :u AND kind = 'IMAGE'
                    """, new MapSqlParameterSource("id", m).addValue("s", ctx.spaceId()).addValue("u", ctx.userId()),
                    Integer.class);
            if (own == null || own == 0) {
                throw ApiException.notFound();
            }
        }
        MapSqlParameterSource p = new MapSqlParameterSource("c", capsuleId).addValue("u", ctx.userId())
                .addValue("body", body).addValue("now", Timestamp.from(time.now()));
        jdbc.update("""
                INSERT INTO capsule_part (capsule_id, author_id, body, updated_at) VALUES (:c, :u, :body, :now)
                ON CONFLICT (capsule_id, author_id) DO UPDATE SET body = EXCLUDED.body, updated_at = EXCLUDED.updated_at
                """, p);
        jdbc.update("DELETE FROM capsule_part_media WHERE capsule_id = :c AND author_id = :u", p);
        for (int i = 0; i < ids.size(); i++) {
            jdbc.update("INSERT INTO capsule_part_media (capsule_id, author_id, media_id, position) VALUES (:c, :u, :m, :p)",
                    new MapSqlParameterSource(p.getValues()).addValue("m", ids.get(i)).addValue("p", i));
        }
        return toDto(require(ctx, capsuleId, false));
    }

    /** Өөрийн хэсгийг битүүмжлэх; хоёулаа битүүмжилмэгц капсул түгжинэ (`SEALED`). */
    @Transactional
    public Capsule seal(SpaceContext ctx, UUID capsuleId) {
        Map<String, Object> c = require(ctx, capsuleId, true);
        if (!"WRITING".equals(c.get("status")) || mySealed(capsuleId, ctx.userId())) {
            throw new ApiException(ErrorCode.CAPSULE_SEALED, HttpStatus.CONFLICT);
        }
        MapSqlParameterSource p = new MapSqlParameterSource("c", capsuleId).addValue("u", ctx.userId())
                .addValue("now", Timestamp.from(time.now()));
        jdbc.update("""
                INSERT INTO capsule_part (capsule_id, author_id, body, sealed_at, updated_at) VALUES (:c, :u, '', :now, :now)
                ON CONFLICT (capsule_id, author_id) DO UPDATE SET sealed_at = EXCLUDED.sealed_at
                """, p);
        List<UUID> members = couples.members(ctx.spaceId());
        Integer sealed = jdbc.queryForObject("""
                SELECT count(*) FROM capsule_part WHERE capsule_id = :c AND sealed_at IS NOT NULL AND author_id IN (:members)
                """, p.addValue("members", members), Integer.class);
        if (sealed != null && sealed >= members.size() && members.size() >= 2) {
            jdbc.update("UPDATE capsule SET status = 'SEALED', sealed_at = :now WHERE id = :c", p);
        }
        return toDto(require(ctx, capsuleId, false));
    }

    /** Огноо болсон битүүмжилсэн капсулуудыг нээнэ (`LetterDeliveryJob`). */
    @Transactional
    public int openDue(int limit) {
        List<Map<String, Object>> due = jdbc.queryForList("""
                SELECT c.id, c.space_id, c.title, s.timezone, c.open_on FROM capsule c JOIN space s ON s.id = c.space_id
                 WHERE c.status = 'SEALED' AND c.open_on <= :horizon ORDER BY c.open_on LIMIT :limit FOR UPDATE OF c SKIP LOCKED
                """, new MapSqlParameterSource("horizon", Date.valueOf(time.today(ZoneId.of("Pacific/Kiritimati"))))
                .addValue("limit", limit));
        int opened = 0;
        for (Map<String, Object> c : due) {
            LocalDate openOn = ((Date) c.get("open_on")).toLocalDate();
            if (openOn.isAfter(time.today(zone((String) c.get("timezone"))))) {
                continue; // хосын бүсээр хараахан болоогүй
            }
            UUID id = (UUID) c.get("id");
            UUID spaceId = (UUID) c.get("space_id");
            jdbc.update("UPDATE capsule SET status = 'OPENED', opened_at = :now WHERE id = :id",
                    new MapSqlParameterSource("id", id).addValue("now", Timestamp.from(time.now())));
            List<UUID> members = couples.members(spaceId);
            for (UUID m : members) {
                String partner = members.stream().filter(x -> !x.equals(m)).findFirst()
                        .map(x -> users.ref(x).getDisplayName()).orElse("");
                events.publishEvent(new Notify(m, spaceId, null, "CAPSULE_OPENED",
                        Map.of("title", (String) c.get("title"), "partner", partner), "/capsules/" + id));
            }
            events.publishEvent(RealtimeEvent.of("capsule.opened", null, members, Map.of("capsuleId", id)));
            opened++;
        }
        return opened;
    }

    // --- Дотоод ---

    private Map<String, Object> require(SpaceContext ctx, UUID capsuleId, boolean lock) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM capsule WHERE id = :id AND space_id = :s" + (lock ? " FOR UPDATE" : ""),
                new MapSqlParameterSource("id", capsuleId).addValue("s", ctx.spaceId()));
        if (rows.isEmpty()) {
            throw ApiException.notFound();
        }
        return rows.get(0);
    }

    private boolean mySealed(UUID capsuleId, UUID userId) {
        Integer n = jdbc.queryForObject("""
                SELECT count(*) FROM capsule_part WHERE capsule_id = :c AND author_id = :u AND sealed_at IS NOT NULL
                """, new MapSqlParameterSource("c", capsuleId).addValue("u", userId), Integer.class);
        return n != null && n > 0;
    }

    /** Нээгдэхээс өмнө хэнд ч `body`, `media` байхгүй (AC-45, GAP-15) — зөвхөн хэн битүүмжилсэн. */
    private Capsule toDto(Map<String, Object> c) {
        UUID id = (UUID) c.get("id");
        boolean opened = "OPENED".equals(c.get("status"));
        Map<UUID, Map<String, Object>> parts = new HashMap<>();
        jdbc.queryForList("SELECT author_id, body, sealed_at FROM capsule_part WHERE capsule_id = :c",
                new MapSqlParameterSource("c", id)).forEach(r -> parts.put((UUID) r.get("author_id"), r));
        List<UUID> authors = new ArrayList<>(couples.members((UUID) c.get("space_id")));
        parts.keySet().stream().filter(a -> !authors.contains(a)).forEach(authors::add);
        authors.sort((x, y) -> x.equals(c.get("creator_id")) ? -1 : y.equals(c.get("creator_id")) ? 1 : 0);
        List<CapsulePartsInner> out = new ArrayList<>();
        for (UUID author : authors.subList(0, Math.min(2, authors.size()))) {
            Map<String, Object> part = parts.get(author);
            CapsulePartsInner p = new CapsulePartsInner(users.ref(author), part != null && part.get("sealed_at") != null);
            if (opened && part != null) {
                p.body((String) part.get("body"));
                List<UUID> ids = jdbc.queryForList("""
                        SELECT media_id FROM capsule_part_media WHERE capsule_id = :c AND author_id = :u ORDER BY position
                        """, new MapSqlParameterSource("c", id).addValue("u", author), UUID.class);
                Map<UUID, MediaRef> refs = media.findAll(ids);
                p.media(new ArrayList<>(ids.stream().map(refs::get).filter(Objects::nonNull).toList()));
            }
            out.add(p);
        }
        return new Capsule(id, (String) c.get("title"), ((Date) c.get("open_on")).toLocalDate(),
                CapsuleStatus.fromValue((String) c.get("status")), out);
    }

    private LocalDate today(UUID spaceId) {
        List<String> tz = jdbc.queryForList("SELECT timezone FROM space WHERE id = :s",
                new MapSqlParameterSource("s", spaceId), String.class);
        return time.today(zone(tz.isEmpty() ? null : tz.get(0)));
    }

    private static ZoneId zone(String tz) {
        try {
            return ZoneId.of(tz);
        } catch (RuntimeException e) {
            return ZoneId.of("Asia/Ulaanbaatar");
        }
    }
}
