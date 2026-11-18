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
 * Имэйл баталгаажуулалт (FR-1.2, AC-01, AC-165): 6 оронтой код ба нэг удаагийн холбоос, 15 мин.
 * Буруу код 5 удаа → `verify:{userId}` 15 мин түгжээ (DD-AURA-029): түгжээний үед зөв код ч
 * 423 `CODE_LOCKED` + `retryAfterSeconds`. Дахин илгээх нь имэйл тутам 60 с-д нэг (429).
 * Баталгаажаагүй акаунт хос үүсгэх/нэгдэх боломжгүй — `requireVerified` (AC-165, T-22 дуудна).
 */
@Service
public class EmailVerificationService {

    public static final Duration CODE_TTL = Duration.ofMinutes(15);
    public static final AttemptLimiter.Limit VERIFY_LIMIT =
            AttemptLimiter.Limit.lockAfter(5, Duration.ofMinutes(15), Duration.ofMinutes(15));
    public static final AttemptLimiter.Limit RESEND_LIMIT = AttemptLimiter.Limit.perWindow(1, Duration.ofSeconds(60));

    private final UserAccountRepository users;
    private final EmailTokenRepository tokens;
    private final TokenHasher hasher;
    private final AttemptLimiter limiter;
    private final AuthMails mails;
    private final TokenIssuer issuer;
    private final TimeProvider time;

    public EmailVerificationService(UserAccountRepository users, EmailTokenRepository tokens, TokenHasher hasher,
                                    AttemptLimiter limiter, AuthMails mails, TokenIssuer issuer, TimeProvider time) {
        this.users = users;
        this.tokens = tokens;
        this.hasher = hasher;
        this.limiter = limiter;
        this.mails = mails;
        this.issuer = issuer;
        this.time = time;
    }

    /** Шинэ код + холбоос (өмнөх нь хүчингүй), имэйл async. */
    @Transactional
    public void issueAndSend(UUID userId, String email, String locale) {
        Instant now = time.now();
        String code = hasher.randomCode();
        String link = hasher.randomToken();
        tokens.replace(userId, EmailToken.Purpose.VERIFY, hasher.hmacCode(scope(userId), code), hasher.sha256(link),
                null, now.plus(CODE_TTL), now);
        mails.verification(email, locale, code, link);
    }

    /** Кодоор баталгаажуулж нэвтрүүлнэ. Түгжээ/буруу кодын тоолуур алдааны хариутай хамт хадгалагдана. */
    @Transactional(noRollbackFor = ApiException.class)
    public TokenIssuer.IssuedTokens verifyCode(String email, String code, Device device) {
        UserAccount user = users.findByEmail(RegistrationService.normalizeEmail(email))
                .filter(u -> !u.emailVerified())
                .orElseThrow(() -> codeInvalid(VERIFY_LIMIT.max()));
        String key = limiterKey(user.id());
        Optional<Duration> locked = limiter.lockedFor(key);
        if (locked.isPresent()) {
            throw codeLocked(locked.get());
        }
        EmailToken token = tokens.latestOpen(user.id(), EmailToken.Purpose.VERIFY)
                .orElseThrow(() -> new ApiException(ErrorCode.CODE_EXPIRED, HttpStatus.GONE));
        if (!TokenHasher.matches(token.codeHash(), hasher.hmacCode(scope(user.id()), code))) {
            tokens.incrementAttempts(token.id());
            AttemptLimiter.State state = limiter.recordAttempt(key, VERIFY_LIMIT);
            if (state.locked()) {
                throw ApiException.withRetryAfter(ErrorCode.CODE_LOCKED, HttpStatus.LOCKED, state.retryAfterSeconds());
            }
            throw codeInvalid(state.attemptsLeft());
        }
        if (token.expired(time.now())) {
            throw new ApiException(ErrorCode.CODE_EXPIRED, HttpStatus.GONE);
        }
        return complete(user, token, device);
    }

    /** Имэйлийн холбоосоор (AC-165). Байхгүй/ашигласан → 400 `TOKEN_INVALID`, хугацаа дууссан → 410 `TOKEN_EXPIRED`. */
    @Transactional
    public TokenIssuer.IssuedTokens verifyLink(String linkToken, Device device) {
        EmailToken token = tokens.findByLinkHash(hasher.sha256(linkToken.strip()), EmailToken.Purpose.VERIFY)
                .filter(t -> !t.consumed())
                .orElseThrow(() -> new ApiException(ErrorCode.TOKEN_INVALID, HttpStatus.BAD_REQUEST));
        if (token.expired(time.now())) {
            throw new ApiException(ErrorCode.TOKEN_EXPIRED, HttpStatus.GONE);
        }
        UserAccount user = users.findById(token.userId())
                .orElseThrow(() -> new ApiException(ErrorCode.TOKEN_INVALID, HttpStatus.BAD_REQUEST));
        return complete(user, token, device);
    }

    /** 202 үргэлж (имэйл бүртгэлтэй эсэхийг ил гаргахгүй); имэйл тутам 60 с-д нэг. */
    @Transactional(noRollbackFor = ApiException.class)
    public void resend(String rawEmail) {
        String email = RegistrationService.normalizeEmail(rawEmail);
        String key = "resend:" + email;
        Optional<Duration> locked = limiter.lockedFor(key);
        if (locked.isPresent()) {
            throw ApiException.rateLimited(AttemptLimiter.seconds(locked.get()));
        }
        limiter.recordAttempt(key, RESEND_LIMIT);
        users.findByEmail(email).filter(u -> !u.emailVerified())
                .ifPresent(u -> issueAndSend(u.id(), u.email(), u.locale()));
    }

    /** AC-165: баталгаажаагүй бол 403 `AUTH_EMAIL_NOT_VERIFIED` (урилга, хос холболт — T-22). */
    public void requireVerified(UUID userId) {
        UserAccount user = users.findById(userId).orElseThrow(ApiException::notFound);
        if (!user.emailVerified()) {
            throw new ApiException(ErrorCode.AUTH_EMAIL_NOT_VERIFIED, HttpStatus.FORBIDDEN);
        }
    }

    private TokenIssuer.IssuedTokens complete(UserAccount user, EmailToken token, Device device) {
        Instant now = time.now();
        if (!tokens.consume(token.id(), now)) {
            throw new ApiException(ErrorCode.TOKEN_INVALID, HttpStatus.BAD_REQUEST);
        }
        users.markEmailVerified(user.id(), now);
        limiter.reset(limiterKey(user.id()));
        return issuer.newSession(user.id(), device.name(), device.platform());
    }

    static String limiterKey(UUID userId) {
        return "verify:" + userId;
    }

    private static String scope(UUID userId) {
        return "VERIFY:" + userId;
    }

    private static ApiException codeInvalid(int attemptsLeft) {
        return new ApiException(ErrorCode.CODE_INVALID, HttpStatus.BAD_REQUEST, Map.of("attemptsLeft", attemptsLeft));
    }

    private static ApiException codeLocked(Duration remaining) {
        return ApiException.withRetryAfter(ErrorCode.CODE_LOCKED, HttpStatus.LOCKED,
                AttemptLimiter.seconds(remaining));
    }
}
