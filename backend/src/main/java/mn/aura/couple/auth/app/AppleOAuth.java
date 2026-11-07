package mn.aura.couple.auth.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import mn.aura.couple.common.config.AuraProperties;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.stereotype.Component;

/**
 * Sign in with Apple — код бэлэн, гэхдээ энэ гаргалтад идэвхгүй (`aura.oauth.apple.enabled=false`,
 * GAP-02: native iOS build байхгүй) → `start` нь 404 `PROVIDER_DISABLED`.
 *
 * <p>Идэвхжүүлэхэд: `client-secret` нь Apple-ийн ES256-аар гарын үсэг зурсан client secret JWT
 * (6 сар хүчинтэй, deploy үед үүсгэнэ). Энд `response_mode=query` (scope-гүй) — гэрээний callback
 * GET тул; имэйлийн scope (`form_post`) хэрэгтэй бол POST callback нэмэх шаардлагатай.
 */
@Component
public class AppleOAuth extends OidcOAuthProvider {

    public static final String ISSUER = "https://appleid.apple.com";

    public AppleOAuth(AuraProperties properties, ObjectMapper mapper, TimeProvider time) {
        super(properties.oauth().apple(), ISSUER,
                "https://appleid.apple.com/auth/authorize",
                "https://appleid.apple.com/auth/token",
                "https://appleid.apple.com/auth/keys",
                mapper, time);
    }

    @Override
    public String id() {
        return "apple";
    }

    @Override
    public String code() {
        return "APPLE";
    }

    @Override
    protected Map<String, String> authorizeParams() {
        return Map.of("response_mode", "query");
    }
}
