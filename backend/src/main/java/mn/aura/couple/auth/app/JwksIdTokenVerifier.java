package mn.aura.couple.auth.app;

import java.util.Map;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

/**
 * Бодит IdP-ийн RS256 `id_token` — JWKS (Google: `https://www.googleapis.com/oauth2/v3/certs`).
 * Түлхүүрийг Nimbus кэшилнэ. Цаг/issuer/audience-ийг `OidcOAuthProvider` шалгана.
 */
public class JwksIdTokenVerifier implements IdTokenVerifier {

    private final NimbusJwtDecoder decoder;

    public JwksIdTokenVerifier(String jwksUri) {
        this.decoder = NimbusJwtDecoder.withJwkSetUri(jwksUri).jwsAlgorithm(SignatureAlgorithm.RS256).build();
        this.decoder.setJwtValidator(jwt -> OAuth2TokenValidatorResult.success());
    }

    @Override
    public Map<String, Object> verify(String idToken) {
        try {
            return decoder.decode(idToken).getClaims();
        } catch (JwtException e) {
            throw new OAuthException("ID_TOKEN_INVALID");
        }
    }
}
