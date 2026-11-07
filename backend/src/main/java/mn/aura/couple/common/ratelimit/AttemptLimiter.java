package mn.aura.couple.common.ratelimit;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Оролдлогын тоолуур (DD-AURA-029) — `attempt_counter(key, window_start, count, locked_until)` DB-д,
 * тул процесс дахин асахад ч хадгалагдана. Түлхүүр: `login:{ip}:{email}` 10/15 мин,
 * `verify:{userId}` 5 → 15 мин түгжээ, `invite:{userId}` 10/цаг г.м.
 *
 * <p>Цаг нь `TimeProvider`-ээс (E2E-д `MutableClock`). Дуудагч нь алдаа шидэхдээ тоолуурыг
 * буцаахгүйн тулд `@Transactional(noRollbackFor = ApiException.class)` ашиглана.
 */
@Component
public class AttemptLimiter {

    /**
     * `max` оролдлого `window` дотор; `max`-д хүрмэгц `lock` хугацаагаар түгжинэ
     * (`lock == null` бол цонх дуустал — «10/15 мин» төрлийн хязгаар).
     */
    public record Limit(int max, Duration window, Duration lock) {

        public static Limit perWindow(int max, Duration window) {
            return new Limit(max, window, null);
        }

        public static Limit lockAfter(int max, Duration window, Duration lock) {
            return new Limit(max, window, lock);
        }
    }

    /** `recordAttempt`-ийн дараах төлөв. */
    public record State(int count, int max, Instant lockedUntil, Instant now) {

        public boolean locked() {
            return lockedUntil != null && lockedUntil.isAfter(now);
        }

        public int attemptsLeft() {
            return Math.max(0, max - count);
        }

        public int retryAfterSeconds() {
            return locked() ? secondsUntil(now, lockedUntil) : 0;
        }
    }

    private record Row(Instant windowStart, int count, Instant lockedUntil) {
    }

    private final JdbcTemplate jdbc;
    private final TimeProvider time;

    public AttemptLimiter(JdbcTemplate jdbc, TimeProvider time) {
        this.jdbc = jdbc;
        this.time = time;
    }

    /** Түгжээтэй бол үлдсэн хугацаа (өөрчлөхгүй). */
    public Optional<Duration> lockedFor(String key) {
        Instant now = time.now();
        List<Instant> locked = jdbc.query("SELECT locked_until FROM attempt_counter WHERE key = ?",
                (rs, i) -> {
                    Timestamp t = rs.getTimestamp(1);
                    return t == null ? null : t.toInstant();
                }, key);
        if (locked.isEmpty() || locked.get(0) == null || !locked.get(0).isAfter(now)) {
            return Optional.empty();
        }
        return Optional.of(Duration.between(now, locked.get(0)));
    }

    /** Нэг оролдлого бүртгэнэ (амжилтгүй эсвэл хязгаарлагдах үйлдэл). */
    @Transactional
    public State recordAttempt(String key, Limit limit) {
        Instant now = time.now();
        jdbc.update("INSERT INTO attempt_counter (key, window_start, count) VALUES (?, ?, 0) ON CONFLICT (key) DO NOTHING",
                key, Timestamp.from(now));
        Row row = jdbc.queryForObject(
                "SELECT window_start, count, locked_until FROM attempt_counter WHERE key = ? FOR UPDATE",
                (rs, i) -> new Row(rs.getTimestamp(1).toInstant(), rs.getInt(2),
                        rs.getTimestamp(3) == null ? null : rs.getTimestamp(3).toInstant()),
                key);
        Instant windowStart = row.windowStart();
        int count = row.count();
        Instant lockedUntil = row.lockedUntil();
        boolean windowOver = !windowStart.plus(limit.window()).isAfter(now);
        boolean lockOver = lockedUntil != null && !lockedUntil.isAfter(now);
        if (windowOver || lockOver || windowStart.isAfter(now)) {
            windowStart = now;
            count = 0;
            lockedUntil = null;
        }
        count++;
        if (count >= limit.max() && lockedUntil == null) {
            lockedUntil = limit.lock() != null ? now.plus(limit.lock()) : windowStart.plus(limit.window());
        }
        jdbc.update("UPDATE attempt_counter SET window_start = ?, count = ?, locked_until = ? WHERE key = ?",
                Timestamp.from(windowStart), count, lockedUntil == null ? null : Timestamp.from(lockedUntil), key);
        return new State(count, limit.max(), lockedUntil, now);
    }

    /** Амжилттай үйлдлийн дараа тоолуурыг цэвэрлэнэ. */
    public void reset(String key) {
        jdbc.update("DELETE FROM attempt_counter WHERE key = ?", key);
    }

    /** `Retry-After`-ийн секунд (дээш тоймлосон, ≥ 1). */
    public static int seconds(Duration remaining) {
        long ms = remaining.toMillis();
        return (int) Math.max(1, (ms + 999) / 1000);
    }

    public static int secondsUntil(Instant now, Instant until) {
        long ms = Duration.between(now, until).toMillis();
        return (int) Math.max(1, (ms + 999) / 1000);
    }
}
