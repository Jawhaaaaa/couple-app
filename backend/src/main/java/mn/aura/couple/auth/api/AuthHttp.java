package mn.aura.couple.auth.api;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.time.ZoneOffset;
import java.util.Locale;
import mn.aura.couple.api.model.DeviceInfo;
import mn.aura.couple.api.model.TokenResponse;
import mn.aura.couple.auth.app.Device;
import mn.aura.couple.auth.app.MeAssembler;
import mn.aura.couple.auth.app.RefreshTokenService;
import mn.aura.couple.auth.app.TokenIssuer;
import mn.aura.couple.auth.domain.DeviceSession;
import mn.aura.couple.common.config.AuraProperties;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

/**
 * Токены HTTP хэлбэр (DD-AURA-006): `X-Aura-Client: web` бол refresh нь зөвхөн
 * `aura_rt` cookie-д (`HttpOnly; SameSite=Strict; Path=/api/v1/auth`, `Secure` = `aura.cookie.secure`),
 * биед ОРОХГҮЙ; native-д биед (`refreshToken`).
 */
@Component
public class AuthHttp {

    public static final String CLIENT_HEADER = "X-Aura-Client";
    public static final String REFRESH_COOKIE = "aura_rt";
    public static final String REFRESH_COOKIE_PATH = "/api/v1/auth";

    private final MeAssembler me;
    private final boolean secureCookie;

    public AuthHttp(MeAssembler me, AuraProperties properties) {
        this.me = me;
        this.secureCookie = properties.cookie().secure();
    }

    public static boolean isWeb(HttpServletRequest request) {
        return "web".equalsIgnoreCase(request.getHeader(CLIENT_HEADER));
    }

    public ResponseEntity<TokenResponse> tokens(TokenIssuer.IssuedTokens tokens, HttpServletRequest request) {
        TokenResponse body = new TokenResponse(tokens.accessToken(),
                tokens.accessExpiresAt().atOffset(ZoneOffset.UTC), me.load(tokens.userId()));
        ResponseEntity.BodyBuilder response = ResponseEntity.ok();
        if (isWeb(request)) {
            response.header(HttpHeaders.SET_COOKIE, refreshCookie(tokens.refreshToken(), RefreshTokenService.TTL).toString());
        } else {
            body.setRefreshToken(tokens.refreshToken());
        }
        return response.body(body);
    }

    public TokenResponse tokenBody(TokenIssuer.IssuedTokens tokens, boolean web) {
        TokenResponse body = new TokenResponse(tokens.accessToken(),
                tokens.accessExpiresAt().atOffset(ZoneOffset.UTC), me.load(tokens.userId()));
        if (!web) {
            body.setRefreshToken(tokens.refreshToken());
        }
        return body;
    }

    public ResponseCookie refreshCookie(String value, Duration maxAge) {
        return ResponseCookie.from(REFRESH_COOKIE, value == null ? "" : value)
                .httpOnly(true)
                .secure(secureCookie)
                .sameSite("Strict")
                .path(REFRESH_COOKIE_PATH)
                .maxAge(maxAge)
                .build();
    }

    public ResponseEntity<Void> noContentClearingCookie() {
        return ResponseEntity.status(HttpStatus.NO_CONTENT)
                .header(HttpHeaders.SET_COOKIE, refreshCookie("", Duration.ZERO).toString())
                .build();
    }

    /** `DeviceInfo` байхгүй замд (имэйлийн код/холбоос) толгойноос таамаглана. */
    public static Device device(DeviceInfo info, HttpServletRequest request) {
        if (info != null && info.getPlatform() != null) {
            return new Device(info.getName(), DeviceSession.Platform.valueOf(info.getPlatform().getValue()));
        }
        if (isWeb(request)) {
            return new Device(null, DeviceSession.Platform.WEB);
        }
        String ua = request.getHeader(HttpHeaders.USER_AGENT);
        String lower = ua == null ? "" : ua.toLowerCase(Locale.ROOT);
        if (lower.contains("iphone") || lower.contains("ipad") || lower.contains("ios")) {
            return new Device(null, DeviceSession.Platform.IOS);
        }
        if (lower.contains("android") || lower.contains("okhttp")) {
            return new Device(null, DeviceSession.Platform.ANDROID);
        }
        return new Device(null, DeviceSession.Platform.WEB);
    }
}
