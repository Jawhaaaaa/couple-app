package mn.aura.couple.stats.app;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.api.model.Stats;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.CoupleCalendar;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.stats.app.FootstepsCalculator.Footsteps;
import mn.aura.couple.stats.app.FootstepsCalculator.Point;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Хосын статистик (FR-12.2, FR-12.3, AC-47, AC-117): DB-ийн шууд тоолол — нийт дурсамж, зураг, видео, болсон
 * болзоо, дууссан зорилго, хүргэгдсэн захидал, хамт өнгөрүүлсэн хоног (SD-01), илгээсэн зүрх, хот, улс, км.
 * Бүх тоо зөвхөн тухайн space-ийнх. `YearInReviewService` ижил тоололыг жилийн мужаар ашиглана.
 */
@Service
public class StatsService {

    /** Тооллын муж (`null` = бүх хугацаа). */
    public record Range(LocalDate from, LocalDate to) {

        static final Range ALL = new Range(null, null);

        LocalDate lo() {
            return from == null ? LocalDate.of(1900, 1, 1) : from;
        }

        LocalDate hi() {
            return to == null ? LocalDate.of(9999, 12, 31) : to;
        }
    }

    private final NamedParameterJdbcTemplate jdbc;
    private final TimeProvider time;

    public StatsService(NamedParameterJdbcTemplate jdbc, TimeProvider time) {
        this.jdbc = jdbc;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public Stats stats(SpaceContext ctx) {
        return count(ctx.spaceId(), Range.ALL);
    }

    /** Муж доторх тоо (дурсамж — `occurred_on`, болзоо — эхлэх өдөр, бусад — үүссэн/хүргэгдсэн агшин, хосын бүсээр). */
    @Transactional(readOnly = true)
    public Stats count(UUID spaceId, Range range) {
        Map<String, Object> space = jdbc.queryForMap("SELECT timezone, start_date FROM space WHERE id = :s",
                new MapSqlParameterSource("s", spaceId));
        ZoneId zone = zone((String) space.get("timezone"));
        LocalDate today = time.today(zone);
        Instant fromAt = range.lo().atStartOfDay(zone).toInstant();
        Instant toAt = range.hi().plusDays(1).atStartOfDay(zone).toInstant();
        Instant now = time.now();
        MapSqlParameterSource p = new MapSqlParameterSource("s", spaceId)
                .addValue("from", Date.valueOf(range.lo())).addValue("to", Date.valueOf(range.hi()))
                .addValue("fromAt", Timestamp.from(fromAt.isBefore(Instant.EPOCH) ? Instant.EPOCH : fromAt))
                .addValue("toAt", Timestamp.from(toAt.isAfter(now) ? now : toAt));
        int memories = count("""
                SELECT count(*) FROM memory WHERE space_id = :s AND deleted_at IS NULL AND occurred_on BETWEEN :from AND :to
                """, p);
        int photos = count(mediaCount("IMAGE"), p);
        int videos = count(mediaCount("VIDEO"), p);
        int dates = count("""
                SELECT count(*) FROM date_plan WHERE space_id = :s AND series_id IS NULL AND status = 'CONFIRMED'
                   AND starts_at >= :fromAt AND starts_at < :toAt
                """, p);
        int goals = count("""
                SELECT count(*) FROM goal WHERE space_id = :s AND completed_at >= :fromAt AND completed_at < :toAt
                """, p);
        int letters = count("""
                SELECT count(*) FROM letter WHERE space_id = :s AND status IN ('DELIVERED', 'READ')
                   AND delivered_at >= :fromAt AND delivered_at < :toAt
                """, p);
        int hearts = count("""
                SELECT count(*) FROM heart_signal WHERE space_id = :s AND kind = 'HEART'
                   AND created_at >= :fromAt AND created_at < :toAt
                """, p);
        Date start = (Date) space.get("start_date");
        long days = 0;
        if (start != null) {
            LocalDate lo = range.from() == null || range.from().isBefore(start.toLocalDate()) ? start.toLocalDate() : range.from();
            LocalDate hi = range.to() == null || range.to().isAfter(today) ? today : range.to();
            days = hi.isBefore(lo) ? 0 : CoupleCalendar.counterDays(lo, hi);
        }
        Footsteps steps = FootstepsCalculator.compute(points(spaceId, range));
        return new Stats(memories, photos, videos, dates, goals, letters, (int) days, hearts, steps.cities(),
                steps.countries(), steps.distanceKm());
    }

    /** Байршилтай дурсамжийн цэгүүд (газрын зураг ба «Хамтын мөр» ижил өгөгдөл, AC-86). */
    @Transactional(readOnly = true)
    public List<Point> points(UUID spaceId, Range range) {
        return jdbc.query("""
                SELECT occurred_on, created_at, lat, lon, city, country_code FROM memory
                 WHERE space_id = :s AND deleted_at IS NULL AND lat IS NOT NULL AND lon IS NOT NULL
                   AND occurred_on BETWEEN :from AND :to
                """, new MapSqlParameterSource("s", spaceId).addValue("from", Date.valueOf(range.lo()))
                .addValue("to", Date.valueOf(range.hi())), (rs, i) -> new Point(rs.getDate("occurred_on").toLocalDate(),
                rs.getTimestamp("created_at").getTime(), rs.getDouble("lat"), rs.getDouble("lon"), rs.getString("city"),
                rs.getString("country_code")));
    }

    private static String mediaCount(String kind) {
        return """
                SELECT count(*) FROM memory_media mm JOIN memory m ON m.id = mm.memory_id JOIN media x ON x.id = mm.media_id
                 WHERE m.space_id = :s AND m.deleted_at IS NULL AND m.occurred_on BETWEEN :from AND :to AND x.kind = '%s'
                """.formatted(kind);
    }

    private int count(String sql, MapSqlParameterSource p) {
        Integer n = jdbc.queryForObject(sql, p, Integer.class);
        return n == null ? 0 : n;
    }

    static ZoneId zone(String tz) {
        try {
            return ZoneId.of(tz);
        } catch (RuntimeException e) {
            return ZoneId.of("Asia/Ulaanbaatar");
        }
    }
}
