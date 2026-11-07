package mn.aura.couple.auth.app;

import java.util.Optional;
import mn.aura.couple.auth.domain.UserAccount;
import mn.aura.couple.auth.domain.UserAccountRepository;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Имэйл + нууц үгээр нэвтрэх (FR-1.1). Хэрэглэгч олдоогүй ч Argon2 шалгалт хийнэ (хугацаагаар
 * бүртгэлтэй эсэх ил гарахгүй). Нууц үг зөв ч баталгаажаагүй бол 403 `AUTH_EMAIL_NOT_VERIFIED`.
 */
@Service
public class LoginService {

    private final UserAccountRepository users;
    private final PasswordHasher hasher;
    private final LoginRateLimiter rateLimiter;
    private final TokenIssuer issuer;

    public LoginService(UserAccountRepository users, PasswordHasher hasher, LoginRateLimiter rateLimiter,
                        TokenIssuer issuer) {
        this.users = users;
        this.hasher = hasher;
        this.rateLimiter = rateLimiter;
        this.issuer = issuer;
    }

    @Transactional(noRollbackFor = ApiException.class)
    public TokenIssuer.IssuedTokens login(String rawEmail, String password, Device device, String ip) {
        String email = RegistrationService.normalizeEmail(rawEmail);
        rateLimiter.check(ip, email);
        Optional<UserAccount> user = users.findByEmail(email);
        boolean ok;
        if (user.isPresent()) {
            ok = hasher.matches(password, user.get().passwordHash());
        } else {
            hasher.matchesDummy(password);
            ok = false;
        }
        if (!ok || !"ACTIVE".equals(user.get().status()) && !"SUSPENDED".equals(user.get().status())) {
            rateLimiter.recordFailure(ip, email);
            throw new ApiException(ErrorCode.AUTH_INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
        }
        UserAccount u = user.get();
        rateLimiter.recordSuccess(ip, email);
        if ("SUSPENDED".equals(u.status())) {
            throw new ApiException(ErrorCode.ACCOUNT_SUSPENDED, HttpStatus.FORBIDDEN);
        }
        if (!u.emailVerified()) {
            throw new ApiException(ErrorCode.AUTH_EMAIL_NOT_VERIFIED, HttpStatus.FORBIDDEN);
        }
        users.clearRequirePassword(u.id());
        return issuer.newSession(u.id(), device.name(), device.platform());
    }
}
