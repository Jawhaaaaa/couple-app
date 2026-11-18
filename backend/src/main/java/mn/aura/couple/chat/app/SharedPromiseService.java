package mn.aura.couple.chat.app;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.api.model.SharedPromise;
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
 * Хамтын амлалт (FR-6.11, AC-93, S-47).
 * <ul>
 *   <li>A санал болгоно (`PROPOSED`) → B-д `PROMISE_PROPOSED` мэдэгдэл; space-д нэг л нээлттэй амлалт (409)</li>
 *   <li>Зөвхөн хамтрагч зөвшөөрнө/татгалзана (өөрийнхийг → 403 `NOT_OWNER`)</li>
 *   <li>Зөвшөөрсөн өдрөөс (хосын бүсээр) 7 хоног `ACTIVE` — чатын толгойд; 7 хоног өнгөрмөгц `ENDED`</li>
 *   <li>`ENDED` үед хүн бүр «Биелүүлсэн үү?» гэдэгт хариулна; түүнээс өмнө → 409 `PROMISE_NOT_ENDED`</li>
 * </ul>
 * Өөрчлөлт бүр `promise.updated`-аар хоёр талд (хүлээн авагч тутам `myOutcome`/`partnerOutcome` проекцтой).
 */
@Service
public class SharedPromiseService {

    public static final int DAYS = 7;
    /** Дууссан амлалт хариулаагүй хүнд хэр удаан «одоогийн» хэвээр харагдах. */
    static final int ENDED_VISIBLE_DAYS = 30;

    private static final String COLUMNS = "id, space_id, proposer_id, responder_id, text, status, starts_on, ends_on, "
            + "outcome_a, outcome_b";

    private record Row(UUID id, UUID spaceId, UUID proposerId, UUID responderId, String text, String status,
                       LocalDate startsOn, LocalDate endsOn, Boolean outcomeA, Boolean outcomeB) {
    }

    private final NamedParameterJdbcTemplate jdbc;
    private final CoupleMembers couples;
    private final UserRefs users;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;

    public SharedPromiseService(NamedParameterJdbcTemplate jdbc, CoupleMembers couples, UserRefs users,
                                ApplicationEventPublisher events, TimeProvider time) {
        this.jdbc = jdbc;
        this.couples = couples;
        this.users = users;
        this.events = events;
        this.time = time;
    }

    /** Нээлттэй (санал, идэвхтэй) эсвэл надад хариулт хүлээж буй дууссан амлалт; алга бол empty (204). */
    @Transactional
    public Optional<SharedPromise> current(SpaceContext ctx) {
        endExpired(ctx.spaceId());
        List<Row> open = query("WHERE space_id = :s AND status IN ('PROPOSED', 'ACTIVE') ORDER BY created_at DESC LIMIT 1",
                new MapSqlParameterSource("s", ctx.spaceId()));
        if (!open.isEmpty()) {
            return Optional.of(toDto(open.get(0), ctx.userId()));
        }
        LocalDate today = today(ctx.spaceId());
        List<Row> ended = query("WHERE space_id = :s AND status = 'ENDED' AND ends_on >= :since "
                        + "ORDER BY ends_on DESC, created_at DESC LIMIT 1",
                new MapSqlParameterSource("s", ctx.spaceId()).addValue("since", Date.valueOf(today.minusDays(ENDED_VISIBLE_DAYS))));
        return ended.stream().filter(r -> myOutcome(r, ctx.userId()) == null).findFirst()
                .map(r -> toDto(r, ctx.userId()));
    }

    @Transactional
    public SharedPromise propose(SpaceContext ctx, String text) {
        String clean = text == null ? "" : text.strip();
        if (clean.isEmpty() || clean.length() > 140) {
            throw ApiException.validation("text", ErrorCode.VALIDATION_FAILED);
        }
        endExpired(ctx.spaceId());
        if (!query("WHERE space_id = :s AND status IN ('PROPOSED', 'ACTIVE') LIMIT 1",
                new MapSqlParameterSource("s", ctx.spaceId())).isEmpty()) {
            throw alreadyOpen(ctx);
        }
        UUID id = Ids.newId();
        Timestamp now = Timestamp.from(time.now());
        try {
            jdbc.update("""
                    INSERT INTO shared_promise (id, space_id, proposer_id, text, status, created_at, updated_at)
                    VALUES (:id, :s, :u, :text, 'PROPOSED', :now, :now)
                    """, new MapSqlParameterSource("id", id).addValue("s", ctx.spaceId()).addValue("u", ctx.userId())
                    .addValue("text", clean).addValue("now", now));
        } catch (DuplicateKeyException e) {
            // Зэрэг санал — транзакц эвдэрсэн тул дахин уншихгүй
            throw new ApiException(ErrorCode.ALREADY_DECIDED, HttpStatus.CONFLICT);
        }
        Row row = load(ctx, id, false);
        couples.partnerIn(ctx.spaceId(), ctx.userId()).ifPresent(partner -> events.publishEvent(new Notify(partner,
                ctx.spaceId(), ctx.userId(), "PROMISE_PROPOSED",
                Map.of("partner", users.ref(ctx.userId()).getDisplayName(), "title", clean), "/chat/promise")));
        publish(ctx, row);
        return toDto(row, ctx.userId());
    }

    @Transactional
    public SharedPromise accept(SpaceContext ctx, UUID promiseId) {
        Row row = pendingFromPartner(ctx, promiseId);
        LocalDate start = today(ctx.spaceId());
        jdbc.update("""
                UPDATE shared_promise SET status = 'ACTIVE', responder_id = :u, starts_on = :start, ends_on = :end,
                       updated_at = :now WHERE id = :id
                """, new MapSqlParameterSource("id", row.id()).addValue("u", ctx.userId())
                .addValue("start", Date.valueOf(start)).addValue("end", Date.valueOf(start.plusDays(DAYS - 1)))
                .addValue("now", Timestamp.from(time.now())));
        Row updated = load(ctx, promiseId, false);
        publish(ctx, updated);
        return toDto(updated, ctx.userId());
    }

    @Transactional
    public SharedPromise decline(SpaceContext ctx, UUID promiseId) {
        Row row = pendingFromPartner(ctx, promiseId);
        jdbc.update("UPDATE shared_promise SET status = 'DECLINED', responder_id = :u, updated_at = :now WHERE id = :id",
                new MapSqlParameterSource("id", row.id()).addValue("u", ctx.userId())
                        .addValue("now", Timestamp.from(time.now())));
        Row updated = load(ctx, promiseId, false);
        publish(ctx, updated);
        return toDto(updated, ctx.userId());
    }

    /** «Амлалтаа биелүүлсэн үү?» — зөвхөн `ENDED` үед; хүн бүр өөрийнхөө хариуг (дахин өөрчилж болно). */
    @Transactional
    public SharedPromise outcome(SpaceContext ctx, UUID promiseId, boolean kept) {
        endExpired(ctx.spaceId());
        Row row = load(ctx, promiseId, true);
        if (!"ENDED".equals(row.status())) {
            throw new ApiException(ErrorCode.PROMISE_NOT_ENDED, HttpStatus.CONFLICT);
        }
        String column = ctx.userId().equals(row.proposerId()) ? "outcome_a" : "outcome_b";
        jdbc.update("UPDATE shared_promise SET " + column + " = :kept, updated_at = :now WHERE id = :id",
                new MapSqlParameterSource("id", row.id()).addValue("kept", kept)
                        .addValue("now", Timestamp.from(time.now())));
        Row updated = load(ctx, promiseId, false);
        publish(ctx, updated);
        return toDto(updated, ctx.userId());
    }

    // --- Дотоод ---

    /** 7 хоног нь өнгөрсөн ACTIVE → ENDED (хосын бүсээр «өнөөдөр» > ends_on); хоёр талд мэдэгдэнэ. */
    private void endExpired(UUID spaceId) {
        LocalDate today = today(spaceId);
        List<Row> expired = query("WHERE space_id = :s AND status = 'ACTIVE' AND ends_on < :today FOR UPDATE",
                new MapSqlParameterSource("s", spaceId).addValue("today", Date.valueOf(today)));
        for (Row r : expired) {
            jdbc.update("UPDATE shared_promise SET status = 'ENDED', updated_at = :now WHERE id = :id",
                    new MapSqlParameterSource("id", r.id()).addValue("now", Timestamp.from(time.now())));
            Row ended = query("WHERE id = :id", new MapSqlParameterSource("id", r.id())).get(0);
            events.publishEvent(RealtimeEvent.projected("promise.updated", null, couples.members(spaceId),
                    viewer -> toDto(ended, viewer)));
        }
    }

    private Row pendingFromPartner(SpaceContext ctx, UUID promiseId) {
        Row row = load(ctx, promiseId, true);
        if (row.proposerId().equals(ctx.userId())) {
            throw new ApiException(ErrorCode.NOT_OWNER, HttpStatus.FORBIDDEN);
        }
        if (!"PROPOSED".equals(row.status())) {
            throw new ApiException(ErrorCode.ALREADY_DECIDED, HttpStatus.CONFLICT);
        }
        return row;
    }

    private ApiException alreadyOpen(SpaceContext ctx) {
        List<Row> open = query("WHERE space_id = :s AND status IN ('PROPOSED', 'ACTIVE') LIMIT 1",
                new MapSqlParameterSource("s", ctx.spaceId()));
        return new ApiException(ErrorCode.ALREADY_DECIDED, HttpStatus.CONFLICT,
                open.isEmpty() ? Map.of() : Map.of("current", toDto(open.get(0), ctx.userId())));
    }

    /** Энэ space-ийн амлалт; өөр space-ийнх → 404 (DD-AURA-004). */
    private Row load(SpaceContext ctx, UUID id, boolean lock) {
        List<Row> rows = query("WHERE id = :id AND space_id = :s" + (lock ? " FOR UPDATE" : ""),
                new MapSqlParameterSource("id", id).addValue("s", ctx.spaceId()));
        if (rows.isEmpty()) {
            throw ApiException.notFound();
        }
        return rows.get(0);
    }

    private List<Row> query(String where, MapSqlParameterSource p) {
        return jdbc.query("SELECT " + COLUMNS + " FROM shared_promise " + where, p, (rs, i) -> new Row(
                rs.getObject("id", UUID.class), rs.getObject("space_id", UUID.class),
                rs.getObject("proposer_id", UUID.class), rs.getObject("responder_id", UUID.class), rs.getString("text"),
                rs.getString("status"), toLocal(rs.getDate("starts_on")), toLocal(rs.getDate("ends_on")),
                (Boolean) rs.getObject("outcome_a"), (Boolean) rs.getObject("outcome_b")));
    }

    private static LocalDate toLocal(Date d) {
        return d == null ? null : d.toLocalDate();
    }

    private static Boolean myOutcome(Row r, UUID viewer) {
        return viewer.equals(r.proposerId()) ? r.outcomeA() : r.outcomeB();
    }

    private SharedPromise toDto(Row r, UUID viewer) {
        SharedPromise p = new SharedPromise(r.id(), r.text(), SharedPromise.StatusEnum.fromValue(r.status()),
                users.ref(r.proposerId()));
        p.startsOn(r.startsOn());
        p.endsOn(r.endsOn());
        p.myOutcome(myOutcome(r, viewer));
        p.partnerOutcome(viewer.equals(r.proposerId()) ? r.outcomeB() : r.outcomeA());
        return p;
    }

    private void publish(SpaceContext ctx, Row row) {
        events.publishEvent(RealtimeEvent.projected("promise.updated", ctx.userId(), couples.members(ctx.spaceId()),
                viewer -> toDto(row, viewer)));
    }

    private LocalDate today(UUID spaceId) {
        List<String> tz = jdbc.queryForList("SELECT timezone FROM space WHERE id = :s",
                new MapSqlParameterSource("s", spaceId), String.class);
        ZoneId zone;
        try {
            zone = ZoneId.of(tz.isEmpty() ? "Asia/Ulaanbaatar" : tz.get(0));
        } catch (RuntimeException e) {
            zone = ZoneId.of("Asia/Ulaanbaatar");
        }
        return time.today(zone);
    }
}
