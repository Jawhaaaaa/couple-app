package mn.aura.couple.auth.app;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.auth.domain.DeviceSession;
import mn.aura.couple.auth.domain.UserAccount;
import mn.aura.couple.auth.domain.UserAccountRepository;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.ratelimit.AttemptLimiter;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Нэвтэрсэн хэрэглэгчийн нууц үг солих (FR-18.4, AC-189): одоогийн нууц үг (401
 * `AUTH_INVALID_CREDENTIALS`, 15 мин-д 5 буруу → 429), FR-1.1-ийн дүрэм, амжилттай бол одоогийн
 * session-оос БУСАД бүх session хаагдана (одоогийн access хэвээр).
 */
@Service
public class PasswordChangeService {

    static final AttemptLimiter.Limit LIMIT = AttemptLimiter.Limit.perWindow(5, Duration.ofMinutes(15));

    private final UserAccountRepository users;
    private final PasswordHasher hasher;
    private final PasswordPolicy policy;
    private final DeviceSessionService sessions;
    private final AttemptLimiter limiter;
    private final TimeProvider time;

    public PasswordChangeService(UserAccountRepository users, PasswordHasher hasher, PasswordPolicy policy,
                                 DeviceSessionService sessions, AttemptLimiter limiter, TimeProvider time) {
        this.users = users;
        this.hasher = hasher;
        this.policy = policy;
        this.sessions = sessions;
        this.limiter = limiter;
        this.time = time;
    }

    @Transactional(noRollbackFor = ApiException.class)
    public void change(UUID userId, UUID currentSessionId, String currentPassword, String newPassword) {
        UserAccount user = users.findById(userId).orElseThrow(ApiException::notFound);
        verifyPassword(user, currentPassword, "password-check:" + userId, limiter, hasher);
        policy.check(newPassword, user.email(), "newPassword");
        users.updatePassword(userId, hasher.hash(newPassword), time.now());
        sessions.revokeAll(userId, DeviceSession.RevokedReason.PASSWORD_CHANGE, currentSessionId, false);
    }

    /** Нэвтэрсэн хэрэглэгчийн нууц үгийг дахин шалгах (имэйл солих, OAuth холбох) — хязгаартай. */
    static void verifyPassword(UserAccount user, String password, String key, AttemptLimiter limiter, PasswordHasher hasher) {
        Optional<Duration> locked = limiter.lockedFor(key);
        if (locked.isPresent()) {
            throw ApiException.rateLimited(AttemptLimiter.seconds(locked.get()));
        }
        if (!hasher.matches(password == null ? "" : password, user.passwordHash())) {
            limiter.recordAttempt(key, LIMIT);
            throw new ApiException(ErrorCode.AUTH_INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
        }
        limiter.reset(key);
    }
}
