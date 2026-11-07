package mn.aura.couple.auth.app;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import mn.aura.couple.auth.domain.OAuthLoginRepository;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.config.AuraProperties;
import mn.aura.couple.common.time.TimeProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Backend дамжсан OAuth (DD-AURA-032): `start` → IdP-ийн authorize URL (гарын үсэгтэй `state`),
 * `callback` → кодыг солиж `id_token` шалгаад нэг удаагийн exchange код (60 с) үүсгэнэ →
 * web `{aura.web.base-url}/oauth-callback?code=…`, native `aura://oauth-callback?code=…`.
 * Алдаа бүр client руу `?error=<код>` болж буцна (гэрээ: «302 `?error=`»).
 */
@Service
public class OAuthFlowService {

    public static final Duration EXCHANGE_TTL = Duration.ofSeconds(60);
    public static final String NATIVE_CALLBACK = "aura://oauth-callback";
    private static final Logger log = LoggerFactory.getLogger(OAuthFlowService.class);

    public record Start(URI redirect, String nonce) {
    }

    private final List<OAuthProvider> providers;
    private final OAuthStateCodec stateCodec;
    private final OAuthLoginRepository logins;
    private final TokenHasher hasher;
    private final TimeProvider time;
    private final String redirectBase;
    private final String webCallback;

    public OAuthFlowService(List<OAuthProvider> providers, OAuthStateCodec stateCodec, OAuthLoginRepository logins,
                            TokenHasher hasher, TimeProvider time, AuraProperties properties) {
        this.providers = List.copyOf(providers);
        this.stateCodec = stateCodec;
        this.logins = logins;
        this.hasher = hasher;
        this.time = time;
        this.redirectBase = trimSlash(properties.oauth().redirectBase());
        this.webCallback = trimSlash(properties.web().baseUrl()) + "/oauth-callback";
    }

    /** 404 `PROVIDER_DISABLED` — тохируулаагүй эсвэл `enabled=false` (Apple). */
    public OAuthProvider provider(String id) {
        return providers.stream().filter(p -> p.id().equals(id) && p.enabled()).findFirst()
                .orElseThrow(() -> new ApiException(ErrorCode.PROVIDER_DISABLED, HttpStatus.NOT_FOUND));
    }

    public Start start(String providerId, String client) {
        OAuthProvider provider = provider(providerId);
        if (!"web".equals(client) && !"native".equals(client)) {
            throw ApiException.validation("client", ErrorCode.VALIDATION_FAILED);
        }
        String nonce = hasher.randomToken();
        String state = stateCodec.encode(provider.id(), client, nonce);
        return new Start(provider.authorizationUri(state, callbackUri(provider.id())), nonce);
    }

    /** Буцах хаяг (`Location`). `cookieNonce` нь start-ийн үед тавьсан cookie. */
    @Transactional
    public URI callback(String providerId, String code, String state, String error, String cookieNonce) {
        Optional<OAuthStateCodec.State> decoded = stateCodec.decode(state)
                .filter(s -> s.provider().equals(providerId));
        if (decoded.isEmpty()) {
            return target("web", "error", "STATE_INVALID");
        }
        String client = decoded.get().client();
        if (cookieNonce == null || !TokenHasher.matches(hasher.sha256(decoded.get().nonce()), hasher.sha256(cookieNonce))) {
            return target(client, "error", "STATE_INVALID");
        }
        if (error != null && !error.isBlank()) {
            return target(client, "error", error.length() > 64 ? "ACCESS_DENIED" : error);
        }
        if (code == null || code.isBlank()) {
            return target(client, "error", "CODE_MISSING");
        }
        OAuthProvider provider;
        try {
            provider = provider(providerId);
        } catch (ApiException e) {
            return target(client, "error", ErrorCode.PROVIDER_DISABLED.name());
        }
        OAuthProvider.OAuthUser user;
        try {
            user = provider.exchange(code, callbackUri(provider.id()));
        } catch (IdTokenVerifier.OAuthException e) {
            log.warn("OAuth callback амжилтгүй ({}): {}", providerId, e.code());
            return target(client, "error", e.code());
        }
        if (!user.emailVerified()) {
            return target(client, "error", ErrorCode.AUTH_EMAIL_NOT_VERIFIED.name());
        }
        Instant now = time.now();
        String exchange = hasher.randomToken();
        logins.insert(user.provider(), user.subject(), RegistrationService.normalizeEmail(user.email()), user.name(),
                client, hasher.sha256(exchange), now.plus(EXCHANGE_TTL), now);
        return target(client, "code", exchange);
    }

    public String callbackUri(String providerId) {
        return redirectBase + "/api/v1/auth/oauth/" + providerId + "/callback";
    }

    private URI target(String client, String param, String value) {
        String base = "native".equals(client) ? NATIVE_CALLBACK : webCallback;
        return URI.create(base + "?" + param + "=" + URLEncoder.encode(value, StandardCharsets.UTF_8));
    }

    private static String trimSlash(String s) {
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }
}
