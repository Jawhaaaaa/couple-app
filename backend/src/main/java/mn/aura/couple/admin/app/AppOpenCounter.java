package mn.aura.couple.admin.app;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.UUID;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * `dailyAvg.opens`-ийн эх (AC-206): апп эхлэхэд дууддаг `GET /me` бүрд session × UTC өдөр нэг л удаа
 * `app_open_daily`-г нэмнэ. Хэрэглэгчийн ID хадгалахгүй — зөвхөн өдрийн нийт тоо. Давхардлын шүүлтүүр нь
 * процессын санах ойд тул олон хуулбартай үед бага зэрэг илүү тоолж болно (ойролцоо хэмжүүр).
 */
@Component
public class AppOpenCounter {

    private final JdbcTemplate jdbc;
    private final TimeProvider time;
    private final Cache<String, Boolean> seen = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofHours(25))
            .maximumSize(200_000)
            .build();

    public AppOpenCounter(JdbcTemplate jdbc, TimeProvider time) {
        this.jdbc = jdbc;
        this.time = time;
    }

    public void record(UUID sessionId) {
        LocalDate day = time.today(ZoneOffset.UTC);
        if (seen.asMap().putIfAbsent(sessionId + ":" + day, Boolean.TRUE) != null) {
            return;
        }
        jdbc.update("""
                INSERT INTO app_open_daily (day, opens) VALUES (?, 1)
                ON CONFLICT (day) DO UPDATE SET opens = app_open_daily.opens + 1
                """, day);
    }
}
