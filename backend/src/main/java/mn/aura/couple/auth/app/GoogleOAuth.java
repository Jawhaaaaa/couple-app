package mn.aura.couple.auth.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import mn.aura.couple.common.config.AuraProperties;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.stereotype.Component;

/**
 * Google OIDC (DD-AURA-032, AC-06). `aura.oauth.google.client-id` хоосон бол идэвхгүй (PAR-AURA-005).
 * Бодит Google: issuer `https://accounts.google.com`, JWKS RS256. E2E: `issuer` = stub IdP, HS256.
 */
@Component
public class GoogleOAuth extends OidcOAuthProvider {

    public static final String ISSUER = "https://accounts.google.com";

    public GoogleOAuth(AuraProperties properties, ObjectMapper mapper, TimeProvider time) {
        super(properties.oauth().google(), ISSUER,
                "https://accounts.google.com/o/oauth2/v2/auth",
                "https://oauth2.googleapis.com/token",
                "https://www.googleapis.com/oauth2/v3/certs",
                mapper, time);
    }

    @Override
    public String id() {
        return "google";
    }

    @Override
    public String code() {
        return "GOOGLE";
    }

    @Override
    protected Map<String, String> authorizeParams() {
        return Map.of("scope", "openid email profile", "prompt", "select_account");
    }

    @Override
    protected boolean issuerMatches(String iss) {
        // Google нь `iss`-д `https://`-гүй хувилбарыг ч өгдөг (зөвхөн бодит Google issuer үед)
        return super.issuerMatches(iss) || (super.issuerMatches(ISSUER) && "accounts.google.com".equals(iss));
    }
}
