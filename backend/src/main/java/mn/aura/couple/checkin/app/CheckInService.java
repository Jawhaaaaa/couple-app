package mn.aura.couple.checkin.app;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.account.app.PreferenceService;
import mn.aura.couple.api.model.CheckIn;
import mn.aura.couple.api.model.CheckInInput;
import mn.aura.couple.api.model.CheckInSeries;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.CoupleMembers;
import mn.aura.couple.couple.app.UserRefs;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Сэтгэл санааны check-in (FR-11.1…11.3, AC-46, AC-114, AC-115, AC-183).
 * <ul>
 *   <li>Хүн тутам өдөрт нэг — өөрийн бүсийн (`users.timezone`, DD-AURA-018) «өнөөдөр»; хоёр дахь нь засвар болно</li>
 *   <li>Хуваалцах анхдагчаар унтраастай; `shared` өгөөгүй бол `checkinAutoShare` тохиргоо (AC-183)</li>
 *   <li>Өнгөрсөн өдрийнхийг засахгүй — 403 `CHECKIN_PAST_DAY` (AC-114)</li>
 *   <li>Хамтрагчид зөвхөн хуваалцсан, одоогийн хосын space-д хийгдсэн check-in (AC-46, INV-04)</li>
 *   <li>Хуваалцсан check-in үүсэх, засагдах эсвэл хуваалцахаа болиход хамтрагчид `checkin.shared`
 *       (`contracts/asyncapi.yaml`) — график нь бодит цагаар шинэчлэгдэнэ (AC-115). Payload нь зөвхөн
 *       огноо: түвшин, тэмдэглэл WS-ээр явахгүй, хамтрагч `GET /checkins`-ээр (хуваалцсан бол л) татна</li>
 * </ul>
 */
@Service
public class CheckInService {

    static final int DEFAULT_RANGE_DAYS = 90;
    static final int MAX_RANGE_DAYS = 400;

    private final NamedParameterJdbcTemplate jdbc;
    private final PreferenceService preferences;
    private final CoupleMembers couples;
    private final UserRefs users;
    private final TimeProvider time;
    private final ApplicationEventPublisher events;

    public CheckInService(NamedParameterJdbcTemplate jdbc, PreferenceService preferences, CoupleMembers couples,
                          UserRefs users, TimeProvider time, ApplicationEventPublisher events) {
        this.jdbc = jdbc;
        this.preferences = preferences;
        this.couples = couples;
        this.users = users;
        this.time = time;
        this.events = events;
    }

    /** Хэрэглэгчийн өөрийн бүсийн өнөөдөр. */
    public LocalDate today(UUID userId) {
        String tz = users.row(userId).map(UserRefs.UserRow::timezone).orElse("Asia/Ulaanbaatar");
        try {
            return time.today(ZoneId.of(tz));
        } catch (RuntimeException e) {
            return time.today(ZoneId.of("Asia/Ulaanbaatar"));
        }
    }

    @Transactional(readOnly = true)
    public CheckInSeries list(SpaceContext ctx, LocalDate from, LocalDate to) {
        LocalDate end = to != null ? to : today(ctx.userId());
        LocalDate start = from != null ? from : end.minusDays(DEFAULT_RANGE_DAYS - 1);
        if (start.isAfter(end) || start.plusDays(MAX_RANGE_DAYS).isBefore(end)) {
            throw ApiException.validation("from", ErrorCode.VALIDATION_FAILED);
        }
        MapSqlParameterSource p = new MapSqlParameterSource("u", ctx.userId()).addValue("s", ctx.spaceId())
                .addValue("from", Date.valueOf(start)).addValue("to", Date.valueOf(end));
        List<CheckIn> mine = jdbc.query("""
                SELECT local_date, level, note, shared FROM check_in
                 WHERE user_id = :u AND local_date BETWEEN :from AND :to ORDER BY local_date
                """, p, (rs, i) -> map(rs.getDate("local_date"), rs.getInt("level"), rs.getString("note"),
                rs.getBoolean("shared")));
        Optional<UUID> partner = couples.partnerIn(ctx.spaceId(), ctx.userId());
        List<CheckIn> theirs = partner.isEmpty() ? List.of() : jdbc.query("""
                SELECT local_date, level, note, shared FROM check_in
                 WHERE user_id = :p AND space_id = :s AND shared AND local_date BETWEEN :from AND :to ORDER BY local_date
                """, p.addValue("p", partner.get()), (rs, i) -> map(rs.getDate("local_date"), rs.getInt("level"),
                rs.getString("note"), true));
        return new CheckInSeries(mine, theirs);
    }

    /** Өнөөдрийн check-in (байвал засвар) — AC-114. */
    @Transactional
    public CheckIn putToday(SpaceContext ctx, CheckInInput in) {
        return upsert(ctx, today(ctx.userId()), in, true);
    }

    /** Тодорхой өдрийнхийг засах — зөвхөн өнөөдрийнх (AC-114). */
    @Transactional
    public CheckIn update(SpaceContext ctx, LocalDate localDate, CheckInInput in) {
        LocalDate today = today(ctx.userId());
        if (localDate != null && localDate.isBefore(today)) {
            throw new ApiException(ErrorCode.CHECKIN_PAST_DAY, HttpStatus.FORBIDDEN);
        }
        if (localDate == null || localDate.isAfter(today)) {
            throw ApiException.notFound();
        }
        return upsert(ctx, today, in, false);
    }

    private CheckIn upsert(SpaceContext ctx, LocalDate day, CheckInInput in, boolean create) {
        int level = in.getLevel() == null ? 0 : in.getLevel();
        if (level < 1 || level > 5) {
            throw ApiException.validation("level", ErrorCode.VALIDATION_FAILED);
        }
        String note = in.getNote() == null || in.getNote().isBlank() ? null : in.getNote().strip();
        if (note != null && note.length() > 280) {
            throw ApiException.validation("note", ErrorCode.VALIDATION_FAILED);
        }
        MapSqlParameterSource p = new MapSqlParameterSource("u", ctx.userId()).addValue("d", Date.valueOf(day));
        List<Boolean> existing = jdbc.queryForList(
                "SELECT shared FROM check_in WHERE user_id = :u AND local_date = :d FOR UPDATE", p, Boolean.class);
        if (existing.isEmpty() && !create) {
            throw ApiException.notFound();
        }
        boolean shared = in.getShared() != null ? in.getShared()
                : !existing.isEmpty() ? existing.get(0)
                : Boolean.TRUE.equals(preferences.get(ctx.userId()).getCheckinAutoShare());
        Timestamp now = Timestamp.from(time.now());
        p.addValue("id", Ids.newId()).addValue("s", ctx.spaceId()).addValue("level", level).addValue("note", note)
                .addValue("shared", shared).addValue("now", now);
        jdbc.update("""
                INSERT INTO check_in (id, user_id, space_id, local_date, level, note, shared, created_at, updated_at)
                VALUES (:id, :u, :s, :d, :level, :note, :shared, :now, :now)
                ON CONFLICT (user_id, local_date) DO UPDATE SET level = EXCLUDED.level, note = EXCLUDED.note,
                    shared = EXCLUDED.shared, space_id = EXCLUDED.space_id, updated_at = EXCLUDED.updated_at
                """, p);
        boolean wasShared = !existing.isEmpty() && Boolean.TRUE.equals(existing.get(0));
        if (shared || wasShared) {
            couples.partnerIn(ctx.spaceId(), ctx.userId()).ifPresent(partner -> events.publishEvent(
                    RealtimeEvent.of("checkin.shared", ctx.userId(), List.of(partner), Map.of("localDate", day.toString()))));
        }
        return map(Date.valueOf(day), level, note, shared);
    }

    private static CheckIn map(Date d, int level, String note, boolean shared) {
        CheckIn c = new CheckIn(d.toLocalDate(), level, shared);
        c.note(note);
        return c;
    }
}
