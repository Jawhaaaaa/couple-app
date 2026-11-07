package mn.aura.couple.auth.app;

import java.time.Instant;
import java.util.UUID;
import mn.aura.couple.auth.domain.DeviceSession;
import mn.aura.couple.auth.domain.UserAccount;
import mn.aura.couple.auth.domain.UserAccountRepository;
import mn.aura.couple.common.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Нэвтрэлтийн бүх замын (нууц үг, имэйлийн код/холбоос, OAuth) нийтлэг төгсгөл: session + токен. */
@Service
public class TokenIssuer {

    /** Access + refresh. `refreshToken`-ийг native-д биед, web-д зөвхөн cookie-д (DD-AURA-006). */
    public record IssuedTokens(UUID userId, UUID sessionId, String accessToken, Instant accessExpiresAt,
                               String refreshToken) {
        @Override
        public String toString() {
            return "IssuedTokens[userId=" + userId + ", sessionId=" + sessionId + ", accessToken=***, refreshToken=***]";
        }
    }

    private final DeviceSessionService sessions;
    private final RefreshTokenService refreshTokens;
    private final JwtService jwt;
    private final UserAccountRepository users;

    public TokenIssuer(DeviceSessionService sessions, RefreshTokenService refreshTokens, JwtService jwt,
                       UserAccountRepository users) {
        this.sessions = sessions;
        this.refreshTokens = refreshTokens;
        this.jwt = jwt;
        this.users = users;
    }

    @Transactional
    public IssuedTokens newSession(UUID userId, String deviceName, DeviceSession.Platform platform) {
        DeviceSession session = sessions.create(userId, deviceName, platform);
        String refresh = refreshTokens.issue(session.id());
        return forSession(userId, session.id(), refresh);
    }

    /** Rotation-ий дараах шинэ access (одоогийн `sv`-тэй). */
    public IssuedTokens forSession(UUID userId, UUID sessionId, String refreshToken) {
        UserAccount user = users.findById(userId).orElseThrow(ApiException::notFound);
        JwtService.AccessToken access = jwt.issue(userId, sessionId, user.sessionVersion());
        return new IssuedTokens(userId, sessionId, access.token(), access.expiresAt(), refreshToken);
    }
}
