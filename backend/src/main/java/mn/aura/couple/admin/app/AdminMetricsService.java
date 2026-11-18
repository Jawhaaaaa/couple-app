package mn.aura.couple.admin.app;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import mn.aura.couple.api.model.AdminMetrics;
import mn.aura.couple.api.model.AdminMetricsDailyAvg;
import mn.aura.couple.api.model.AdminMetricsSurvey;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Админы нэгтгэсэн хэмжүүр (E1 §7, AC-206). Зөвхөн тоо, хувь — хэрэглэгч/хосын ID, нэр, агуулга хэзээ ч
 * буцаахгүй. Хугацаа `[from, to]` (UTC өдөр, хоёулаа орно); анхдагч нь сүүлийн 30 хоног.
 *
 * <ul>
 *   <li>`pairingSuccessRate` — хугацаанд үүссэн урилгаас хос холбогдсон (`pairing.status = LINKED`) хувь;</li>
 *   <li>`firstWeek3MemoriesRate` — хугацаанд холбогдсон хосоос холбогдсоноос хойш 7 хоногт 3+ дурсамж нэмсэн хувь;</li>
 *   <li>`weeklyActiveAfter30d` — `to`-оос 30+ хоногийн өмнө холбогдсон идэвхтэй хосоос `to` хүртэлх 7 хоногт
 *       мессеж, дурсамж эсвэл зүрх илгээсэн хувь;</li>
 *   <li>`dailyAvg` — хугацааны нийт тоог өдрийн тоонд хуваасан дундаж (нээлт = session × өдөр давхардалгүй);</li>
 *   <li>`survey` — оноотой хариулт (алгассаныг тоолохгүй): тоо, дундаж, 1…5-ын тархалт.</li>
 * </ul>
 */
@Service
public class AdminMetricsService {

    static final int DEFAULT_DAYS = 30;
    static final int MAX_DAYS = 366;

    private final JdbcTemplate jdbc;
    private final TimeProvider time;

    public AdminMetricsService(JdbcTemplate jdbc, TimeProvider time) {
        this.jdbc = jdbc;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public AdminMetrics compute(LocalDate from, LocalDate to) {
        LocalDate end = to != null ? to : time.today(ZoneOffset.UTC);
        LocalDate start = from != null ? from : end.minusDays(DEFAULT_DAYS - 1L);
        long days = ChronoUnit.DAYS.between(start, end) + 1;
        if (days < 1) {
            throw ApiException.validation("from", ErrorCode.VALIDATION_FAILED);
        }
        if (days > MAX_DAYS) {
            throw ApiException.validation("to", ErrorCode.VALIDATION_FAILED);
        }
        Timestamp t0 = Timestamp.from(start.atStartOfDay(ZoneOffset.UTC).toInstant());
        Instant endInstant = end.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        Timestamp t1 = Timestamp.from(endInstant);

        BigDecimal pairing = rate(jdbc.queryForMap("""
                SELECT count(*) AS total,
                       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM pairing p
                                                       WHERE p.invite_id = i.id AND p.status = 'LINKED')) AS hit
                  FROM invite i
                 WHERE i.created_at >= ? AND i.created_at < ?
                """, t0, t1));
        BigDecimal firstWeek = rate(jdbc.queryForMap("""
                SELECT count(*) AS total,
                       count(*) FILTER (WHERE (SELECT count(*) FROM memory m
                                                WHERE m.space_id = s.id
                                                  AND m.created_at < s.linked_at + interval '7 days') >= 3) AS hit
                  FROM space s
                 WHERE s.kind = 'COUPLE' AND s.linked_at >= ? AND s.linked_at < ?
                """, t0, t1));
        Timestamp weekStart = Timestamp.from(endInstant.minus(7, ChronoUnit.DAYS));
        Timestamp linkedBefore = Timestamp.from(endInstant.minus(30, ChronoUnit.DAYS));
        BigDecimal weekly = rate(jdbc.queryForMap("""
                SELECT count(*) AS total,
                       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM chat_message c
                                                       WHERE c.space_id = s.id AND c.created_at >= ? AND c.created_at < ?)
                                          OR EXISTS (SELECT 1 FROM memory m
                                                       WHERE m.space_id = s.id AND m.created_at >= ? AND m.created_at < ?)
                                          OR EXISTS (SELECT 1 FROM heart_signal h
                                                       WHERE h.space_id = s.id AND h.created_at >= ? AND h.created_at < ?)) AS hit
                  FROM space s
                 WHERE s.kind = 'COUPLE' AND s.status = 'ACTIVE' AND s.linked_at IS NOT NULL AND s.linked_at <= ?
                """, weekStart, t1, weekStart, t1, weekStart, t1, linkedBefore));

        long opens = count("SELECT coalesce(sum(opens), 0) FROM app_open_daily WHERE day BETWEEN ? AND ?", start, end);
        long messages = count("SELECT count(*) FROM chat_message WHERE created_at >= ? AND created_at < ?", t0, t1);
        long memories = count("SELECT count(*) FROM memory WHERE created_at >= ? AND created_at < ?", t0, t1);
        long hearts = count("SELECT count(*) FROM heart_signal WHERE created_at >= ? AND created_at < ?", t0, t1);
        AdminMetricsDailyAvg daily = new AdminMetricsDailyAvg(avg(opens, days), avg(messages, days), avg(memories, days),
                avg(hearts, days));

        return new AdminMetrics(pairing, firstWeek, weekly, daily, survey(t0, t1));
    }

    private AdminMetricsSurvey survey(Timestamp t0, Timestamp t1) {
        List<Integer> distribution = new ArrayList<>(List.of(0, 0, 0, 0, 0));
        jdbc.query("""
                SELECT score, count(*) AS n FROM survey_response
                 WHERE score IS NOT NULL AND created_at >= ? AND created_at < ?
                 GROUP BY score
                """, rs -> {
            distribution.set(rs.getInt("score") - 1, rs.getInt("n"));
        }, t0, t1);
        int count = distribution.stream().mapToInt(Integer::intValue).sum();
        BigDecimal average = null;
        if (count > 0) {
            long sum = 0;
            for (int i = 0; i < 5; i++) {
                sum += (long) (i + 1) * distribution.get(i);
            }
            average = BigDecimal.valueOf(sum).divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP);
        }
        return new AdminMetricsSurvey(count, average, distribution);
    }

    private long count(String sql, Object... args) {
        Long n = jdbc.queryForObject(sql, Long.class, args);
        return n == null ? 0 : n;
    }

    private static BigDecimal rate(Map<String, Object> row) {
        long total = ((Number) row.get("total")).longValue();
        long hit = ((Number) row.get("hit")).longValue();
        if (total == 0) {
            return BigDecimal.ZERO;
        }
        return BigDecimal.valueOf(hit).divide(BigDecimal.valueOf(total), 4, RoundingMode.HALF_UP);
    }

    private static BigDecimal avg(long total, long days) {
        return BigDecimal.valueOf(total).divide(BigDecimal.valueOf(days), 2, RoundingMode.HALF_UP);
    }
}
