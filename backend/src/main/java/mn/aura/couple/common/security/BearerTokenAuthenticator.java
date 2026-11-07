package mn.aura.couple.common.security;

import java.util.Optional;
import org.springframework.security.core.Authentication;

/**
 * JWT-ийн өргөтгөлийн цэг (T-18 `JwtService` хэрэгжүүлнэ). Bean байхгүй үед бүх хамгаалагдсан
 * хүсэлт 401 `TOKEN_INVALID`. Хугацаа дууссан токенд `ApiAuthenticationException(TOKEN_EXPIRED)` шид.
 * `Authentication.getName()` нь хэрэглэгчийн UUID байх ёстой (`SpaceAccessGuard` уншина).
 */
public interface BearerTokenAuthenticator {

    Optional<Authentication> authenticate(String bearerToken);
}
