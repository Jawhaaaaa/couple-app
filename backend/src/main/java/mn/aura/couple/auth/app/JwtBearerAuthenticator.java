package mn.aura.couple.auth.app;

import java.util.Optional;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.security.ApiAuthenticationException;
import mn.aura.couple.common.security.AuraAuthentication;
import mn.aura.couple.common.security.BearerTokenAuthenticator;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

/**
 * `SecurityConfig`-ийн өргөтгөлийн цэг: access JWT → `AuraAuthentication`. Гарын үсэг/хугацааны
 * дараа session хаагдсан эсвэл `sv` нь `users.session_version`-тэй зөрвөл 401
 * `AUTH_SESSION_REVOKED` (DD-AURA-007, AC-03, AC-07).
 */
@Component
public class JwtBearerAuthenticator implements BearerTokenAuthenticator {

    private final JwtService jwt;
    private final SessionVersionCache sessions;

    public JwtBearerAuthenticator(JwtService jwt, SessionVersionCache sessions) {
        this.jwt = jwt;
        this.sessions = sessions;
    }

    @Override
    public Optional<Authentication> authenticate(String bearerToken) {
        JwtService.Claims claims = jwt.parse(bearerToken);
        SessionVersionCache.SessionState state = sessions.get(claims.sessionId())
                .orElseThrow(() -> new ApiAuthenticationException(ErrorCode.TOKEN_INVALID));
        if (!state.userId().equals(claims.userId())) {
            throw new ApiAuthenticationException(ErrorCode.TOKEN_INVALID);
        }
        if (state.sessionRevoked() || state.sessionVersion() != claims.sessionVersion()
                || "DELETED".equals(state.userStatus()) || "SUSPENDED".equals(state.userStatus())) {
            // Түдгэлзсэн (AC-186): session-ууд хаагдсан ч кэшийн 5 с-ийн цонхонд ч нэвтрүүлэхгүй
            throw new ApiAuthenticationException(ErrorCode.AUTH_SESSION_REVOKED);
        }
        return Optional.of(new AuraAuthentication(claims.userId(), claims.sessionId()));
    }
}
