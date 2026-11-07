package mn.aura.couple.auth.app;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import mn.aura.couple.auth.domain.DeviceSession;
import mn.aura.couple.auth.domain.EmailToken;
import mn.aura.couple.auth.domain.EmailTokenRepository;
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
 * Нууц үг сэргээх (FR-1.3, AC-03, AC-166): нэг удаагийн холбоос 30 мин. Хүсэлт нь бүртгэлтэй
 * эсэхээс үл хамааран 202 (имэйл тутам 15 мин-д 3, 429). Амжилттай сэргээлт хэрэглэгчийн БҮХ
 * session-ийг хааж `session_version`-ийг нэмнэ — хуучин refresh ба access хоёулаа 401.
 */
@Service
public class PasswordResetService {

    public static final Duration LINK_TTL = Duration.ofMinutes(30);
    public static final AttemptLimiter.Limit REQUEST_LIMIT = AttemptLimiter.Limit.perWindow(3, Duration.ofMinutes(15));

    private final UserAccountRepository users;
    private final EmailTokenRepository tokens;
    private final TokenHasher hasher;
    private final PasswordPolicy policy;
    private final PasswordHasher passwordHasher;
    private final DeviceSessionService sessions;
    private final AttemptLimiter limiter;
    private final AuthMails mails;
    private final TimeProvider time;

    public PasswordResetService(UserAccountRepository users, EmailTokenRepository tokens, TokenHasher hasher,
                                PasswordPolicy policy, PasswordHasher passwordHasher, DeviceSessionService sessions,
                                AttemptLimiter limiter, AuthMails mails, TimeProvider time) {
        this.users = users;
        this.tokens = tokens;
        this.hasher = hasher;
        this.policy = policy;
        this.passwordHasher = passwordHasher;
        this.sessions = sessions;
        this.limiter = limiter;
        this.mails = mails;
        this.time = time;
    }

    @Transactional(noRollbackFor = ApiException.class)
    public void request(String rawEmail) {
        String email = RegistrationService.normalizeEmail(rawEmail);
        String key = "reset:" + email;
        Optional<Duration> locked = limiter.lockedFor(key);
        if (locked.isPresent()) {
            throw ApiException.rateLimited(AttemptLimiter.seconds(locked.get()));
        }
        limiter.recordAttempt(key, REQUEST_LIMIT);
        Optional<UserAccount> user = users.findByEmail(email).filter(u -> !"DELETED".equals(u.status()));
        if (user.isEmpty()) {
            return;
        }
        Instant now = time.now();
        String link = hasher.randomToken();
        tokens.replace(user.get().id(), EmailToken.Purpose.PASSWORD_RESET, null, hasher.sha256(link), null,
                now.plus(LINK_TTL), now);
        mails.passwordReset(user.get().email(), user.get().locale(), link);
    }

    /** Токен эхэлж (400 `TOKEN_INVALID` / 410 `TOKEN_EXPIRED`), дараа нь нууц үгийн дүрэм — сул бол токен хэвээр. */
    @Transactional
    public void confirm(String linkToken, String newPassword) {
        Instant now = time.now();
        EmailToken token = tokens.findByLinkHash(hasher.sha256(linkToken.strip()), EmailToken.Purpose.PASSWORD_RESET)
                .filter(t -> !t.consumed())
                .orElseThrow(() -> new ApiException(ErrorCode.TOKEN_INVALID, HttpStatus.BAD_REQUEST));
        if (token.expired(now)) {
            throw new ApiException(ErrorCode.TOKEN_EXPIRED, HttpStatus.GONE);
        }
        UserAccount user = users.findById(token.userId())
                .orElseThrow(() -> new ApiException(ErrorCode.TOKEN_INVALID, HttpStatus.BAD_REQUEST));
        policy.check(newPassword, user.email(), "newPassword");
        if (!tokens.consume(token.id(), now)) {
            throw new ApiException(ErrorCode.TOKEN_INVALID, HttpStatus.BAD_REQUEST);
        }
        users.updatePassword(user.id(), passwordHasher.hash(newPassword), now);
        // Холбоос имэйлд очсон тул хаяг эзэмшигч нь баталгаатай
        users.markEmailVerified(user.id(), now);
        sessions.revokeAll(user.id(), DeviceSession.RevokedReason.PASSWORD_RESET, null, true);
    }
}
