package mn.aura.couple.auth.app;

import java.util.Map;

/**
 * OIDC `id_token`-ийн гарын үсгийн шалгалт (DD-AURA-032). Стратеги солигдоно:
 * <ul>
 *   <li>`JwksIdTokenVerifier` — бодит Google/Apple, RS256, JWKS (Spring-ийн `NimbusJwtDecoder`).</li>
 *   <li>`HmacIdTokenVerifier` — E2E/IT-ийн stub IdP (GAP-18), HS256 client secret-ээр.</li>
 * </ul>
 * `iss`, `aud`, `exp`-ийг `OidcOAuthProvider` нэг газар шалгана.
 */
public interface IdTokenVerifier {

    /** Гарын үсэг зөв бол claim-ууд; үгүй бол `OAuthException`. */
    Map<String, Object> verify(String idToken);

    /** OAuth урсгалын алдаа — callback нь client руу `?error=<code>` болгож буцаана. */
    class OAuthException extends RuntimeException {

        private final String code;

        public OAuthException(String code) {
            super(code, null, false, false);
            this.code = code;
        }

        public String code() {
            return code;
        }
    }
}
