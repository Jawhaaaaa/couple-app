package mn.aura.couple.auth.app;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.auth.domain.DeviceSession;
import mn.aura.couple.auth.domain.EmailToken;
import mn.aura.couple.auth.domain.EmailTokenRepository;
import mn.aura.couple.auth.domain.OAuthIdentityRepository;
import mn.aura.couple.auth.domain.OAuthLogin;
import mn.aura.couple.auth.domain.OAuthLoginRepository;
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
 * OAuth exchange ба акаунт холболт (DD-AURA-032, AC-06, AC-167).
 * <ul>
 *   <li>Холбогдсон identity → нэвтэрнэ.</li>
 *   <li>Ижил имэйлтэй акаунт байгаа → шинэ акаунт ҮҮСГЭХГҮЙ: `linkRequired=true` + `linkToken`
 *       (10 мин); акаунтын нууц үг эсвэл тэр хаягт очсон 6 оронтой кодоор `POST /auth/oauth/link`.</li>
 *   <li>Шинэ → хэрэглэгч (имэйл IdP-ээр баталгаажсан), SOLO space, identity; `isNewUser=true` (S-07).</li>
 * </ul>
 * «Би биш»-ийн дараа (`require_password`) OAuth нь шууд нэвтрүүлэхгүй — холболтоор нууц үг/код шаардана.
 */
@Service
public class OAuthAccountLinker {

    public static final Duration LINK_TTL = Duration.ofMinutes(10);
    public static final Duration LINK_CODE_TTL = Duration.ofMinutes(15);
    static final AttemptLimiter.Limit LINK_LIMIT =
            AttemptLimiter.Limit.lockAfter(5, Duration.ofMinutes(15), Duration.ofMinutes(15));

    public record ExchangeResult(TokenIssuer.IssuedTokens tokens, boolean linkRequired, String linkToken,
                                 boolean isNewUser) {
        @Override
        public String toString() {
            return "ExchangeResult[linkRequired=" + linkRequired + ", isNewUser=" + isNewUser + "]";
        }
    }

    private final OAuthLoginRepository logins;
    private final OAuthIdentityRepository identities;
    private final UserAccountRepository users;
    private final EmailTokenRepository emailTokens;
    private final TokenHasher hasher;
    private final PasswordHasher passwordHasher;
    private final AttemptLimiter limiter;
    private final TokenIssuer issuer;
    private final AuthMails mails;
    private final TimeProvider time;

    public OAuthAccountLinker(OAuthLoginRepository logins, OAuthIdentityRepository identities,
                              UserAccountRepository users, EmailTokenRepository emailTokens, TokenHasher hasher,
                              PasswordHasher passwordHasher, AttemptLimiter limiter, TokenIssuer issuer,
                              AuthMails mails, TimeProvider time) {
        this.logins = logins;
        this.identities = identities;
        this.users = users;
        this.emailTokens = emailTokens;
        this.hasher = hasher;
        this.passwordHasher = passwordHasher;
        this.limiter = limiter;
        this.issuer = issuer;
        this.mails = mails;
        this.time = time;
    }

    /** Нэг удаагийн 60 с-ийн код. Буруу/ашигласан → 400 `CODE_INVALID`, хугацаа дууссан → 410 `CODE_EXPIRED`. */
    @Transactional(noRollbackFor = ApiException.class)
    public ExchangeResult exchange(String code, Device device) {
        Instant now = time.now();
        OAuthLogin login = logins.findByExchangeHash(hasher.sha256(code.strip()))
                .filter(l -> l.exchangedAt() == null)
                .orElseThrow(() -> new ApiException(ErrorCode.CODE_INVALID, HttpStatus.BAD_REQUEST));
        logins.markExchanged(login.id(), device.name(), device.platform().name(), now);
        if (!login.exchangeExpiresAt().isAfter(now)) {
            throw new ApiException(ErrorCode.CODE_EXPIRED, HttpStatus.GONE);
        }
        Optional<UserAccount> linked = identities.findUser(login.provider(), login.subject()).flatMap(users::findById)
                .filter(u -> !"DELETED".equals(u.status()));
        if (linked.isPresent()) {
            UserAccount user = linked.get();
            if (user.requirePassword()) {
                return requireLink(login, user, now);
            }
            requireActive(user);
            return new ExchangeResult(issuer.newSession(user.id(), device.name(), device.platform()), false, null, false);
        }
        Optional<UserAccount> sameEmail = users.findByEmail(login.email());
        if (sameEmail.isPresent()) {
            return requireLink(login, sameEmail.get(), now);
        }
        String name = displayName(login);
        UUID userId = users.insert(new UserAccountRepository.NewUser(login.email(), null, name, null,
                        "Asia/Ulaanbaatar", "mn", now, null), now)
                .orElseThrow(() -> new ApiException(ErrorCode.CODE_INVALID, HttpStatus.BAD_REQUEST));
        identities.link(userId, login.provider(), login.subject(), login.email());
        return new ExchangeResult(issuer.newSession(userId, device.name(), device.platform()), false, null, true);
    }

    /** AC-167: нууц үг эсвэл имэйлийн кодоор холбоно. Буруу → 401, токен дууссан/ашигласан → 410. */
    @Transactional(noRollbackFor = ApiException.class)
    public TokenIssuer.IssuedTokens link(String linkToken, String password, String emailCode) {
        Instant now = time.now();
        OAuthLogin login = logins.findByLinkHash(hasher.sha256(linkToken.strip()))
                .filter(l -> l.linkedAt() == null && l.linkUserId() != null && l.linkExpiresAt().isAfter(now))
                .orElseThrow(() -> new ApiException(ErrorCode.TOKEN_EXPIRED, HttpStatus.GONE));
        UserAccount user = users.findById(login.linkUserId())
                .orElseThrow(() -> new ApiException(ErrorCode.TOKEN_EXPIRED, HttpStatus.GONE));
        if (password != null && !password.isEmpty()) {
            PasswordChangeService.verifyPassword(user, password, "password-check:" + user.id(), limiter, passwordHasher);
        } else if (emailCode != null && !emailCode.isEmpty()) {
            verifyEmailCode(user, emailCode, now);
        } else {
            throw ApiException.validation("password", ErrorCode.VALIDATION_FAILED);
        }
        requireActive(user);
        identities.link(user.id(), login.provider(), login.subject(), login.email());
        logins.markLinked(login.id(), now);
        users.markEmailVerified(user.id(), now);
        users.clearRequirePassword(user.id());
        DeviceSession.Platform platform = login.devicePlatform() == null
                ? DeviceSession.Platform.WEB : DeviceSession.Platform.valueOf(login.devicePlatform());
        return issuer.newSession(user.id(), login.deviceName(), platform);
    }

    private ExchangeResult requireLink(OAuthLogin login, UserAccount user, Instant now) {
        String link = hasher.randomToken();
        logins.requireLink(login.id(), user.id(), hasher.sha256(link), now.plus(LINK_TTL));
        String code = hasher.randomCode();
        emailTokens.replace(user.id(), EmailToken.Purpose.OAUTH_LINK, hasher.hmacCode(scope(user.id()), code), null,
                null, now.plus(LINK_CODE_TTL), now);
        mails.oauthLinkCode(user.email(), user.locale(), code, "GOOGLE".equals(login.provider()) ? "Google" : "Apple");
        return new ExchangeResult(null, true, link, false);
    }

    private void verifyEmailCode(UserAccount user, String code, Instant now) {
        String key = "oauth-link:" + user.id();
        Optional<Duration> locked = limiter.lockedFor(key);
        if (locked.isPresent()) {
            throw ApiException.rateLimited(AttemptLimiter.seconds(locked.get()));
        }
        Optional<EmailToken> token = emailTokens.latestOpen(user.id(), EmailToken.Purpose.OAUTH_LINK)
                .filter(t -> !t.expired(now));
        if (token.isEmpty() || !TokenHasher.matches(token.get().codeHash(), hasher.hmacCode(scope(user.id()), code))) {
            limiter.recordAttempt(key, LINK_LIMIT);
            throw new ApiException(ErrorCode.AUTH_INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
        }
        emailTokens.consume(token.get().id(), now);
        limiter.reset(key);
    }

    private static void requireActive(UserAccount user) {
        if ("SUSPENDED".equals(user.status())) {
            throw new ApiException(ErrorCode.ACCOUNT_SUSPENDED, HttpStatus.FORBIDDEN);
        }
    }

    private static String displayName(OAuthLogin login) {
        String name = login.displayName();
        if (name == null || name.isBlank()) {
            String email = login.email();
            name = email.substring(0, Math.max(1, email.indexOf('@')));
        }
        name = name.strip();
        return name.length() > 50 ? name.substring(0, 50) : name;
    }

    private static String scope(UUID userId) {
        return "OAUTH_LINK:" + userId;
    }
}
