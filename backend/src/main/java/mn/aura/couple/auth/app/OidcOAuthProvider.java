package mn.aura.couple.auth.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;
import mn.aura.couple.common.config.AuraProperties;
import mn.aura.couple.common.time.TimeProvider;

/**
 * Authorization code урсгалтай OIDC provider-ийн нийтлэг хэрэгжүүлэлт: authorize URL, token endpoint
 * (`client_secret_post`), `id_token`-ийн гарын үсэг (`IdTokenVerifier`), `iss`/`aud`/`exp`.
 *
 * <p>`issuer` нь provider-ийн жинхэнэ issuer биш бол (E2E stub) endpoint-ууд `{issuer}/authorize`,
 * `{issuer}/token`, `{issuer}/jwks`. `idTokenAlg=HS256` → `HmacIdTokenVerifier`, бусад → JWKS RS256.
 */
public abstract class OidcOAuthProvider implements OAuthProvider {

    static final Duration CLOCK_SKEW = Duration.ofSeconds(60);
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    private final AuraProperties.Provider config;
    private final String issuer;
    private final String authorizeUri;
    private final String tokenUri;
    private final IdTokenVerifier verifier;
    private final ObjectMapper mapper;
    private final TimeProvider time;

    protected OidcOAuthProvider(AuraProperties.Provider config, String defaultIssuer, String defaultAuthorizeUri,
                                String defaultTokenUri, String defaultJwksUri, ObjectMapper mapper, TimeProvider time) {
        this.config = config;
        this.mapper = mapper;
        this.time = time;
        this.issuer = blank(config.issuer()) ? defaultIssuer : strip(config.issuer());
        boolean real = issuer.equals(defaultIssuer);
        this.authorizeUri = !blank(config.authorizeUri()) ? config.authorizeUri() : real ? defaultAuthorizeUri : issuer + "/authorize";
        this.tokenUri = !blank(config.tokenUri()) ? config.tokenUri() : real ? defaultTokenUri : issuer + "/token";
        String jwksUri = !blank(config.jwksUri()) ? config.jwksUri() : real ? defaultJwksUri : issuer + "/jwks";
        this.verifier = "HS256".equalsIgnoreCase(config.idTokenAlg())
                ? new HmacIdTokenVerifier(config.clientSecret())
                : new JwksIdTokenVerifier(jwksUri);
    }

    @Override
    public boolean enabled() {
        return config.configured();
    }

    /** Provider-ийн нэмэлт authorize параметр (scope г.м.). */
    protected Map<String, String> authorizeParams() {
        return Map.of("scope", "openid email profile");
    }

    /** Issuer-ийн хүлээн зөвшөөрөх хувилбарууд (Google нь `https://`-гүйг ч өгдөг). */
    protected boolean issuerMatches(String iss) {
        return issuer.equals(iss);
    }

    @Override
    public URI authorizationUri(String state, String redirectUri) {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("response_type", "code");
        params.put("client_id", config.clientId());
        params.put("redirect_uri", redirectUri);
        params.put("state", state);
        params.putAll(authorizeParams());
        return URI.create(authorizeUri + (authorizeUri.contains("?") ? "&" : "?") + form(params));
    }

    @Override
    public OAuthUser exchange(String code, String redirectUri) {
        Map<String, String> form = new LinkedHashMap<>();
        form.put("grant_type", "authorization_code");
        form.put("code", code);
        form.put("redirect_uri", redirectUri);
        form.put("client_id", config.clientId());
        form.put("client_secret", config.clientSecret() == null ? "" : config.clientSecret());
        HttpRequest request = HttpRequest.newBuilder(URI.create(tokenUri))
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(form(form)))
                .build();
        JsonNode body;
        try {
            HttpResponse<String> response = HTTP.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                throw new IdTokenVerifier.OAuthException("TOKEN_EXCHANGE_FAILED");
            }
            body = mapper.readTree(response.body());
        } catch (IOException e) {
            throw new IdTokenVerifier.OAuthException("UPSTREAM_UNAVAILABLE");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IdTokenVerifier.OAuthException("UPSTREAM_UNAVAILABLE");
        }
        String idToken = body.path("id_token").asText(null);
        if (idToken == null) {
            throw new IdTokenVerifier.OAuthException("ID_TOKEN_MISSING");
        }
        return validate(verifier.verify(idToken));
    }

    OAuthUser validate(Map<String, Object> claims) {
        if (!issuerMatches(String.valueOf(claims.get("iss")))) {
            throw new IdTokenVerifier.OAuthException("ID_TOKEN_INVALID");
        }
        Object aud = claims.get("aud");
        boolean audOk = aud instanceof Collection<?> c ? c.contains(config.clientId()) : config.clientId().equals(aud);
        if (!audOk) {
            throw new IdTokenVerifier.OAuthException("ID_TOKEN_INVALID");
        }
        Instant exp = instant(claims.get("exp"));
        if (exp == null || !exp.plus(CLOCK_SKEW).isAfter(time.now())) {
            throw new IdTokenVerifier.OAuthException("ID_TOKEN_EXPIRED");
        }
        String subject = (String) claims.get("sub");
        String email = (String) claims.get("email");
        if (blank(subject) || blank(email)) {
            throw new IdTokenVerifier.OAuthException("ID_TOKEN_INVALID");
        }
        Object verified = claims.get("email_verified");
        boolean emailVerified = Boolean.TRUE.equals(verified) || "true".equals(verified);
        Object name = claims.get("name");
        return new OAuthUser(code(), subject, email, emailVerified, name == null ? null : name.toString());
    }

    private static Instant instant(Object value) {
        if (value instanceof Instant i) {
            return i;
        }
        if (value instanceof Date d) {
            return d.toInstant();
        }
        if (value instanceof Number n) {
            return Instant.ofEpochSecond(n.longValue());
        }
        return null;
    }

    private static String form(Map<String, String> params) {
        return params.entrySet().stream()
                .map(e -> URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8) + "="
                        + URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8))
                .collect(Collectors.joining("&"));
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    private static String strip(String s) {
        String t = s.strip();
        return t.endsWith("/") ? t.substring(0, t.length() - 1) : t;
    }
}
