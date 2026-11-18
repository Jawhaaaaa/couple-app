package mn.aura.couple.auth.api;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.time.Duration;
import java.util.Arrays;
import mn.aura.couple.api.model.OAuthExchangeRequest;
import mn.aura.couple.api.model.OAuthExchangeResponse;
import mn.aura.couple.api.model.OAuthLinkRequest;
import mn.aura.couple.api.model.TokenResponse;
import mn.aura.couple.auth.app.OAuthAccountLinker;
import mn.aura.couple.auth.app.OAuthFlowService;
import mn.aura.couple.auth.app.OAuthStateCodec;
import mn.aura.couple.common.config.AuraProperties;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

/**
 * Google (ба ижил замаар Apple) OAuth-ийн HTTP давхарга (DD-AURA-032, AC-06, AC-167).
 *
 * <p>Гэрээний бүх `Auth` операц нэг үүсгэсэн интерфейс (`AuthApi`) тул HTTP mapping нь
 * `AuthController`-т; тэр `/auth/oauth/**`-ийг энд дамжуулна:
 * <ul>
 *   <li>`start?client=web|native` → 302 IdP; `state`-ийн nonce-ийг `aura_oauth` cookie-д
 *       (`HttpOnly; SameSite=Lax; Path=/api/v1/auth/oauth`, 10 мин) — өөр хөтчөөс эхлүүлсэн
 *       callback-ийг (login CSRF) хүлээн авахгүй.</li>
 *   <li>`callback` → 302 `{web}/oauth-callback?code=` эсвэл `aura://oauth-callback?code=` (алдаа бол `?error=`).</li>
 *   <li>`exchange` (60 с, нэг удаа) ба `link`.</li>
 * </ul>
 */
@Component
public class GoogleOAuthController {

    static final String STATE_COOKIE = "aura_oauth";
    static final String STATE_COOKIE_PATH = "/api/v1/auth/oauth";

    private final OAuthFlowService flow;
    private final OAuthAccountLinker linker;
    private final AuthHttp http;
    private final boolean secureCookie;

    public GoogleOAuthController(OAuthFlowService flow, OAuthAccountLinker linker, AuthHttp http,
                                 AuraProperties properties) {
        this.flow = flow;
        this.linker = linker;
        this.http = http;
        this.secureCookie = properties.cookie().secure();
    }

    ResponseEntity<Void> start(String provider, String client) {
        OAuthFlowService.Start start = flow.start(provider, client);
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(start.redirect())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header(HttpHeaders.SET_COOKIE, stateCookie(start.nonce(), OAuthStateCodec.TTL).toString())
                .build();
    }

    ResponseEntity<Void> callback(String provider, String code, String state, String error, HttpServletRequest request) {
        URI target = flow.callback(provider, code, state, error, cookie(request));
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(target)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header(HttpHeaders.SET_COOKIE, stateCookie("", Duration.ZERO).toString())
                .build();
    }

    ResponseEntity<OAuthExchangeResponse> exchange(OAuthExchangeRequest body, HttpServletRequest request) {
        OAuthAccountLinker.ExchangeResult result = linker.exchange(body.getCode(), AuthHttp.device(body.getDevice(), request));
        boolean web = AuthHttp.isWeb(request);
        OAuthExchangeResponse response = new OAuthExchangeResponse(result.linkRequired(), result.isNewUser());
        response.setLinkToken(result.linkToken());
        ResponseEntity.BodyBuilder builder = ResponseEntity.ok();
        if (result.tokens() != null) {
            response.setTokens(http.tokenBody(result.tokens(), web));
            if (web) {
                builder.header(HttpHeaders.SET_COOKIE,
                        http.refreshCookie(result.tokens().refreshToken(), mn.aura.couple.auth.app.RefreshTokenService.TTL).toString());
            }
        }
        return builder.body(response);
    }

    ResponseEntity<TokenResponse> link(OAuthLinkRequest body, HttpServletRequest request) {
        return http.tokens(linker.link(body.getLinkToken(), body.getPassword(), body.getEmailCode()), request);
    }

    private ResponseCookie stateCookie(String value, Duration maxAge) {
        return ResponseCookie.from(STATE_COOKIE, value)
                .httpOnly(true)
                .secure(secureCookie)
                .sameSite("Lax")
                .path(STATE_COOKIE_PATH)
                .maxAge(maxAge)
                .build();
    }

    private static String cookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        return Arrays.stream(cookies).filter(c -> STATE_COOKIE.equals(c.getName())).map(Cookie::getValue)
                .findFirst().orElse(null);
    }
}
