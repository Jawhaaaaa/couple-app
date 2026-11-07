package mn.aura.couple.auth.app;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
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
 * Имэйл солих (FR-18.4, AC-136): нууц үгээ баталж хүсэлт гаргахад ШИНЭ хаягт 6 оронтой код (15 мин)
 * очно; баталгаажих хүртэл хуучин хаяг идэвхтэй (нэвтрэлт, имэйл). Баталгаажмагц хуучин хаягт
 * «Имэйл солигдлоо — та биш бол» холбоос (`NOT_ME`, 7 хоног) очно. Буруу код 5 → 15 мин түгжээ.
 */
@Service
public class EmailChangeService {

    public static final Duration CODE_TTL = Duration.ofMinutes(15);
    public static final Duration NOT_ME_TTL = Duration.ofDays(7);
    static final AttemptLimiter.Limit CONFIRM_LIMIT =
            AttemptLimiter.Limit.lockAfter(5, Duration.ofMinutes(15), Duration.ofMinutes(15));

    private final UserAccountRepository users;
    private final EmailTokenRepository tokens;
    private final TokenHasher tokenHasher;
    private final PasswordHasher passwordHasher;
    private final AttemptLimiter limiter;
    private final AuthMails mails;
    private final TimeProvider time;

    public EmailChangeService(UserAccountRepository users, EmailTokenRepository tokens, TokenHasher tokenHasher,
                              PasswordHasher passwordHasher, AttemptLimiter limiter, AuthMails mails, TimeProvider time) {
        this.users = users;
        this.tokens = tokens;
        this.tokenHasher = tokenHasher;
        this.passwordHasher = passwordHasher;
        this.limiter = limiter;
        this.mails = mails;
        this.time = time;
    }

    /** 202. Шинэ хаяг өөр акаунтад бүртгэлтэй бол код биш «аль хэдийн бүртгэлтэй» имэйл очно (ил гаргахгүй). */
    @Transactional(noRollbackFor = ApiException.class)
    public void request(UUID userId, String rawNewEmail, String password) {
        UserAccount user = users.findById(userId).orElseThrow(ApiException::notFound);
        PasswordChangeService.verifyPassword(user, password, "password-check:" + userId, limiter, passwordHasher);
        String newEmail = RegistrationService.normalizeEmail(rawNewEmail);
        if (newEmail.equalsIgnoreCase(user.email())) {
            throw ApiException.validation("newEmail", ErrorCode.VALIDATION_FAILED);
        }
        if (users.emailTaken(newEmail)) {
            mails.alreadyRegistered(newEmail, user.locale());
            return;
        }
        Instant now = time.now();
        String code = tokenHasher.randomCode();
        tokens.replace(userId, EmailToken.Purpose.EMAIL_CHANGE, tokenHasher.hmacCode(scope(userId), code), null,
                newEmail, now.plus(CODE_TTL), now);
        mails.emailChangeCode(newEmail, user.locale(), code);
    }

    /** Буруу/хугацаа дууссан код → 400 `CODE_INVALID` (+attemptsLeft), түгжээ → 423 `CODE_LOCKED`. */
    @Transactional(noRollbackFor = ApiException.class)
    public void confirm(UUID userId, String code) {
        String key = "email-change:" + userId;
        Optional<Duration> locked = limiter.lockedFor(key);
        if (locked.isPresent()) {
            throw ApiException.withRetryAfter(ErrorCode.CODE_LOCKED, HttpStatus.LOCKED, AttemptLimiter.seconds(locked.get()));
        }
        UserAccount user = users.findById(userId).orElseThrow(ApiException::notFound);
        Instant now = time.now();
        EmailToken token = tokens.latestOpen(userId, EmailToken.Purpose.EMAIL_CHANGE)
                .filter(t -> !t.expired(now))
                .orElseThrow(() -> codeInvalid(CONFIRM_LIMIT.max()));
        if (!TokenHasher.matches(token.codeHash(), tokenHasher.hmacCode(scope(userId), code))) {
            tokens.incrementAttempts(token.id());
            AttemptLimiter.State state = limiter.recordAttempt(key, CONFIRM_LIMIT);
            if (state.locked()) {
                throw ApiException.withRetryAfter(ErrorCode.CODE_LOCKED, HttpStatus.LOCKED, state.retryAfterSeconds());
            }
            throw codeInvalid(state.attemptsLeft());
        }
        if (users.emailTaken(token.newEmail()) || !tokens.consume(token.id(), now)) {
            throw codeInvalid(0);
        }
        String oldEmail = user.email();
        users.changeEmail(userId, token.newEmail(), now);
        limiter.reset(key);
        String notMe = tokenHasher.randomToken();
        tokens.replace(userId, EmailToken.Purpose.NOT_ME, null, tokenHasher.sha256(notMe), oldEmail,
                now.plus(NOT_ME_TTL), now);
        mails.emailChangedNotMe(oldEmail, user.locale(), notMe);
    }

    private static String scope(UUID userId) {
        return "EMAIL_CHANGE:" + userId;
    }

    private static ApiException codeInvalid(int attemptsLeft) {
        return new ApiException(ErrorCode.CODE_INVALID, HttpStatus.BAD_REQUEST, Map.of("attemptsLeft", attemptsLeft));
    }
}
