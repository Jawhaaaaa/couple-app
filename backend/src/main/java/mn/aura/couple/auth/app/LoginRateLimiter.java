package mn.aura.couple.auth.app;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ratelimit.AttemptLimiter;
import org.springframework.stereotype.Component;

/**
 * Нэвтрэх оролдлогын хязгаар (DD-AURA-029, AC-05): `login:{ip}:{email}` — 15 мин дотор 10 амжилтгүй
 * оролдлого; 11 дэх нь (зөв нууц үгтэй ч) 429 `RATE_LIMITED` + `Retry-After` (цонх дуусах хүртэл).
 * Амжилттай нэвтрэлт тоолуурыг цэвэрлэнэ.
 */
@Component
public class LoginRateLimiter {

    public static final AttemptLimiter.Limit LIMIT = AttemptLimiter.Limit.perWindow(10, Duration.ofMinutes(15));

    private final AttemptLimiter limiter;

    public LoginRateLimiter(AttemptLimiter limiter) {
        this.limiter = limiter;
    }

    /** Түгжээтэй бол 429. */
    public void check(String ip, String email) {
        limiter.lockedFor(key(ip, email)).ifPresent(remaining ->
                { throw ApiException.rateLimited(AttemptLimiter.seconds(remaining)); });
    }

    public void recordFailure(String ip, String email) {
        limiter.recordAttempt(key(ip, email), LIMIT);
    }

    public void recordSuccess(String ip, String email) {
        limiter.reset(key(ip, email));
    }

    static String key(String ip, String email) {
        return "login:" + (ip == null ? "-" : ip) + ":" + (email == null ? "" : email.strip().toLowerCase(Locale.ROOT));
    }
}
