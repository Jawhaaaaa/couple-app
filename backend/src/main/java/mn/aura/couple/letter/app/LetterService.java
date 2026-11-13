package mn.aura.couple.letter.app;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.api.model.Letter;
import mn.aura.couple.api.model.LetterInput;
import mn.aura.couple.api.model.LetterStatus;
import mn.aura.couple.api.model.LetterTeaser;
import mn.aura.couple.api.model.LetterTemplate;
import mn.aura.couple.api.model.LetterUpdate;
import mn.aura.couple.api.model.ListLetters200ResponseInner;
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
 * Захидал (FR-10.1…10.4, AC-43, AC-44, AC-111, AC-112, AC-113, AC-182).
 * <ul>
 *   <li>Шууд эсвэл товлосон (`deliverAt`, UTC); 3 загвар; ≤ 5 зураг (6 дахь → 400 `MEDIA_LIMIT_EXCEEDED`)</li>
 *   <li>Хүргэхээс өмнө хүлээн авагчид агуулга 0 (INV-04): `GET` → 404, жагсаалтад зөвхөн `LetterTeaser`
 *       (огноо, үйл явдлын нэр); WS, push-д ч бичвэр орохгүй</li>
 *   <li>Хүргэхээс өмнө зөвхөн зохиогч засна/цуцална; хүргэгдсэний дараа 409 `LETTER_ALREADY_DELIVERED`</li>
 *   <li>Хүргэлтийг `LetterDeliveryJob` (15 с) хийнэ — T-ээс ≤ 1 мин-д (AC-44)</li>
 * </ul>
 */
@Service
public class LetterService {

    public static final int MAX_MEDIA = 5;

    record Row(UUID id, UUID spaceId, UUID authorId, UUID recipientId, String template, String body, Instant deliverAt,
               String occasionLabel, String status, Instant deliveredAt, Instant readAt, Instant createdAt, long version) {

        boolean delivered() {
            return "DELIVERED".equals(status) || "READ".equals(status);
        }
    }

    private final NamedParameterJdbcTemplate jdbc;
    private final CoupleMembers couples;
    private final UserRefs users;
    private final MediaRefs media;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;

    public LetterService(NamedParameterJdbcTemplate jdbc, CoupleMembers couples, UserRefs users, MediaRefs media,
                         ApplicationEventPublisher events, TimeProvider time) {
        this.jdbc = jdbc;
        this.couples = couples;
        this.users = users;
        this.media = media;
        this.events = events;
        this.time = time;
    }

    /** `box`: `inbox` — надад хүргэгдсэн; `sent` — миний бичсэн (ноорог ба товлосныг оруулаад); `upcoming` — надад ирэх (агуулгагүй). */
    @Transactional(readOnly = true)
    public List<ListLetters200ResponseInner> list(SpaceContext ctx, String box) {
        MapSqlParameterSource p = new MapSqlParameterSource("s", ctx.spaceId()).addValue("u", ctx.userId());
        return switch (box == null ? "" : box) {
            case "inbox" -> query("WHERE space_id = :s AND recipient_id = :u AND status IN ('DELIVERED', 'READ') "
                    + "ORDER BY delivered_at DESC, id", p).stream().map(this::item).toList();
            case "sent" -> query("WHERE space_id = :s AND author_id = :u AND status <> 'CANCELLED' "
                    + "ORDER BY coalesce(delivered_at, deliver_at, created_at) DESC, id", p).stream().map(this::item).toList();
            case "upcoming" -> query("WHERE space_id = :s AND recipient_id = :u AND status = 'SCHEDULED' "
                    + "ORDER BY deliver_at, id", p).stream().map(r -> {
                        LetterTeaser t = teaser(r);
                        return new ListLetters200ResponseInner().id(t.getId()).deliverAt(t.getDeliverAt())
                                .occasionLabel(t.getOccasionLabel());
                    }).toList();
            default -> throw ApiException.validation("box", ErrorCode.VALIDATION_FAILED);
        };
    }

    /** Нүүрний «💌 Чамд … захидал ирнэ» (AC-182) — агуулгагүй. */
    @Transactional(readOnly = true)
    public List<LetterTeaser> incoming(UUID spaceId, UUID userId) {
        return query("WHERE space_id = :s AND recipient_id = :u AND status = 'SCHEDULED' ORDER BY deliver_at, id",
                new MapSqlParameterSource("s", spaceId).addValue("u", userId)).stream().map(LetterService::teaser).toList();
    }

    @Transactional(readOnly = true)
    public Letter get(SpaceContext ctx, UUID letterId) {
        return toDto(visible(ctx, letterId, false));
    }

    @Transactional
    public Letter create(SpaceContext ctx, LetterInput in) {
        UUID partner = couples.partnerIn(ctx.spaceId(), ctx.userId()).orElseThrow(
                () -> new ApiException(ErrorCode.NOT_PAIRED, HttpStatus.CONFLICT));
        List<UUID> mediaIds = requireMedia(ctx, in.getMediaIds());
        String body = requireBody(in.getBody());
        Instant now = time.now();
        Instant deliverAt = in.getDeliverAt() == null ? null : in.getDeliverAt().toInstant();
        String status = Boolean.TRUE.equals(in.getDraft()) ? "DRAFT"
                : deliverAt != null && deliverAt.isAfter(now) ? "SCHEDULED" : "DELIVERED";
        UUID id = Ids.newId();
        jdbc.update("""
                INSERT INTO letter (id, space_id, author_id, recipient_id, template, body, deliver_at, occasion_label, status,
                    delivered_at, created_at, updated_at)
                VALUES (:id, :s, :u, :r, :template, :body, :deliverAt, :label, :status, :deliveredAt, :now, :now)
                """, new MapSqlParameterSource("id", id).addValue("s", ctx.spaceId()).addValue("u", ctx.userId())
                .addValue("r", partner).addValue("template", in.getTemplate().getValue()).addValue("body", body)
                .addValue("deliverAt", deliverAt == null ? null : Timestamp.from(deliverAt))
                .addValue("label", blankToNull(in.getOccasionLabel())).addValue("status", status)
                .addValue("deliveredAt", "DELIVERED".equals(status) ? Timestamp.from(now) : null)
                .addValue("now", Timestamp.from(now)));
        saveMedia(id, mediaIds);
        Row row = load(id);
        if ("DELIVERED".equals(status)) {
            announceDelivered(row);
        }
        return toDto(row);
    }

    @Transactional
    public Letter update(SpaceContext ctx, UUID letterId, LetterUpdate in) {
        Row row = ownUndelivered(ctx, letterId);
        if (in.getVersion() == null || in.getVersion() != row.version()) {
            Letter current = toDto(row);
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("current", current);
            details.put("currentVersion", current.getVersion());
            details.put("updatedBy", row.authorId());
            throw new ApiException(ErrorCode.VERSION_CONFLICT, HttpStatus.CONFLICT, details);
        }
        Instant now = time.now();
        List<String> sets = new ArrayList<>();
        MapSqlParameterSource p = new MapSqlParameterSource("id", letterId).addValue("now", Timestamp.from(now));
        if (in.getTemplate() != null) {
            sets.add("template = :template");
            p.addValue("template", in.getTemplate().getValue());
        }
        if (in.getBody() != null) {
            sets.add("body = :body");
            p.addValue("body", requireBody(in.getBody()));
        }
        if (in.getOccasionLabel() != null) {
            sets.add("occasion_label = :label");
            p.addValue("label", blankToNull(in.getOccasionLabel()));
        }
        Instant deliverAt = in.getDeliverAt() != null ? in.getDeliverAt().toInstant() : row.deliverAt();
        boolean draft = in.getDraft() != null ? in.getDraft() : "DRAFT".equals(row.status());
        String status = draft ? "DRAFT" : deliverAt != null && deliverAt.isAfter(now) ? "SCHEDULED" : "DELIVERED";
        sets.add("deliver_at = :deliverAt, status = :status, delivered_at = :deliveredAt");
        p.addValue("deliverAt", deliverAt == null ? null : Timestamp.from(deliverAt)).addValue("status", status)
                .addValue("deliveredAt", "DELIVERED".equals(status) ? Timestamp.from(now) : null);
        if (in.getMediaIds() != null) {
            List<UUID> mediaIds = requireMedia(ctx, in.getMediaIds());
            jdbc.update("DELETE FROM letter_media WHERE letter_id = :id", p);
            saveMedia(letterId, mediaIds);
        }
        sets.add("updated_at = :now, version = version + 1");
        jdbc.update("UPDATE letter SET " + String.join(", ", sets) + " WHERE id = :id", p);
        Row updated = load(letterId);
        if ("DELIVERED".equals(status)) {
            announceDelivered(updated);
        }
        return toDto(updated);
    }

    /** Хүргэхээс өмнө цуцлах (AC-112) — хүлээн авагчийн «ирэх захидал» тэмдэг алга болно. */
    @Transactional
    public void cancel(SpaceContext ctx, UUID letterId) {
        ownUndelivered(ctx, letterId);
        jdbc.update("UPDATE letter SET status = 'CANCELLED', updated_at = :now, version = version + 1 WHERE id = :id",
                new MapSqlParameterSource("id", letterId).addValue("now", Timestamp.from(time.now())));
    }

    /** Хүлээн авагч нээв (AC-182) — зохиогчид `letter.read`. */
    @Transactional
    public Letter markRead(SpaceContext ctx, UUID letterId) {
        Row row = visible(ctx, letterId, true);
        if (row.recipientId().equals(ctx.userId()) && "DELIVERED".equals(row.status())) {
            jdbc.update("UPDATE letter SET status = 'READ', read_at = :now WHERE id = :id",
                    new MapSqlParameterSource("id", letterId).addValue("now", Timestamp.from(time.now())));
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("letterId", letterId);
            events.publishEvent(RealtimeEvent.of("letter.read", ctx.userId(), List.of(row.authorId(), row.recipientId()),
                    payload));
            row = load(letterId);
        }
        return toDto(row);
    }

    /** Хугацаа болсон товлосон захидлуудыг хүргэнэ (`LetterDeliveryJob`). */
    @Transactional
    public int deliverDue(int limit) {
        Instant now = time.now();
        List<Row> due = query("WHERE status = 'SCHEDULED' AND deliver_at <= :now ORDER BY deliver_at LIMIT :limit "
                + "FOR UPDATE SKIP LOCKED", new MapSqlParameterSource("now", Timestamp.from(now)).addValue("limit", limit));
        for (Row r : due) {
            jdbc.update("UPDATE letter SET status = 'DELIVERED', delivered_at = :now WHERE id = :id",
                    new MapSqlParameterSource("id", r.id()).addValue("now", Timestamp.from(now)));
            announceDelivered(load(r.id()));
        }
        return due.size();
    }

    // --- Дотоод ---

    /** Хүлээн авагчид мэдэгдэл (нэр ба үйл явдлын нэр л — бичвэр биш, NFR-06) ба `letter.delivered` (teaser). */
    private void announceDelivered(Row r) {
        events.publishEvent(new Notify(r.recipientId(), r.spaceId(), r.authorId(), "LETTER_DELIVERED",
                Map.of("partner", users.ref(r.authorId()).getDisplayName(),
                        "title", r.occasionLabel() == null ? "💌" : r.occasionLabel()), "/letters/" + r.id()));
        events.publishEvent(RealtimeEvent.of("letter.delivered", r.authorId(), List.of(r.recipientId()), teaser(r)));
    }

    /** Зохиогч бүгдийг; хүлээн авагч зөвхөн хүргэгдсэнийг. Бусад → 404 (байгаа эсэхийг ил гаргахгүй). */
    private Row visible(SpaceContext ctx, UUID letterId, boolean lock) {
        List<Row> rows = query("WHERE id = :id AND space_id = :s" + (lock ? " FOR UPDATE" : ""),
                new MapSqlParameterSource("id", letterId).addValue("s", ctx.spaceId()));
        if (rows.isEmpty()) {
            throw ApiException.notFound();
        }
        Row r = rows.get(0);
        boolean author = r.authorId().equals(ctx.userId());
        boolean recipient = r.recipientId().equals(ctx.userId()) && r.delivered();
        if (!author && !recipient || "CANCELLED".equals(r.status()) && !author) {
            throw ApiException.notFound();
        }
        return r;
    }

    private Row ownUndelivered(SpaceContext ctx, UUID letterId) {
        Row r = visible(ctx, letterId, true);
        if (!r.authorId().equals(ctx.userId())) {
            throw new ApiException(ErrorCode.NOT_OWNER, HttpStatus.FORBIDDEN);
        }
        if (r.delivered()) {
            throw new ApiException(ErrorCode.LETTER_ALREADY_DELIVERED, HttpStatus.CONFLICT);
        }
        if ("CANCELLED".equals(r.status())) {
            throw ApiException.notFound();
        }
        return r;
    }

    private List<UUID> requireMedia(SpaceContext ctx, List<UUID> ids) {
        List<UUID> list = ids == null ? List.of() : ids.stream().distinct().toList();
        if (list.size() > MAX_MEDIA) {
            throw ApiException.badRequest(ErrorCode.MEDIA_LIMIT_EXCEEDED, "mediaIds");
        }
        for (UUID id : list) {
            Integer own = jdbc.queryForObject("""
                    SELECT count(*) FROM media WHERE id = :id AND space_id = :s AND owner_id = :u AND kind = 'IMAGE'
                    """, new MapSqlParameterSource("id", id).addValue("s", ctx.spaceId()).addValue("u", ctx.userId()),
                    Integer.class);
            if (own == null || own == 0) {
                throw ApiException.notFound();
            }
        }
        return list;
    }

    private void saveMedia(UUID letterId, List<UUID> ids) {
        for (int i = 0; i < ids.size(); i++) {
            jdbc.update("INSERT INTO letter_media (letter_id, media_id, position) VALUES (:l, :m, :p)",
                    new MapSqlParameterSource("l", letterId).addValue("m", ids.get(i)).addValue("p", i));
        }
    }

    private static String requireBody(String body) {
        if (body == null || body.length() > 20000) {
            throw ApiException.validation("body", ErrorCode.VALIDATION_FAILED);
        }
        return body;
    }

    private Row load(UUID id) {
        return query("WHERE id = :id", new MapSqlParameterSource("id", id)).stream().findFirst()
                .orElseThrow(ApiException::notFound);
    }

    private List<Row> query(String where, MapSqlParameterSource p) {
        return jdbc.query("SELECT * FROM letter " + where, p, (rs, i) -> map(rs));
    }

    private static Row map(ResultSet rs) throws SQLException {
        return new Row(rs.getObject("id", UUID.class), rs.getObject("space_id", UUID.class),
                rs.getObject("author_id", UUID.class), rs.getObject("recipient_id", UUID.class), rs.getString("template"),
                rs.getString("body"), instant(rs.getTimestamp("deliver_at")), rs.getString("occasion_label"),
                rs.getString("status"), instant(rs.getTimestamp("delivered_at")), instant(rs.getTimestamp("read_at")),
                instant(rs.getTimestamp("created_at")), rs.getLong("version"));
    }

    private Letter toDto(Row r) {
        List<UUID> ids = jdbc.queryForList("SELECT media_id FROM letter_media WHERE letter_id = :l ORDER BY position",
                new MapSqlParameterSource("l", r.id()), UUID.class);
        Map<UUID, MediaRef> refs = media.findAll(ids);
        List<MediaRef> list = ids.stream().map(refs::get).filter(java.util.Objects::nonNull).toList();
        Letter l = new Letter(r.id(), users.ref(r.authorId()), users.ref(r.recipientId()),
                LetterTemplate.fromValue(r.template()), r.body(), new ArrayList<>(list), LetterStatus.fromValue(r.status()),
                utc(r.createdAt()), r.version());
        l.deliverAt(utc(r.deliverAt()));
        l.occasionLabel(r.occasionLabel());
        l.deliveredAt(utc(r.deliveredAt()));
        l.readAt(utc(r.readAt()));
        return l;
    }

    private ListLetters200ResponseInner item(Row r) {
        return new ListLetters200ResponseInner().id(r.id()).author(users.ref(r.authorId()))
                .recipient(users.ref(r.recipientId())).template(LetterTemplate.fromValue(r.template()))
                .status(LetterStatus.fromValue(r.status())).deliverAt(utc(r.deliverAt())).deliveredAt(utc(r.deliveredAt()))
                .readAt(utc(r.readAt())).occasionLabel(r.occasionLabel());
    }

    private static LetterTeaser teaser(Row r) {
        LetterTeaser t = new LetterTeaser(r.id());
        t.deliverAt(utc(r.deliverAt()));
        t.occasionLabel(r.occasionLabel());
        return t;
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }

    private static OffsetDateTime utc(Instant i) {
        return i == null ? null : OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
