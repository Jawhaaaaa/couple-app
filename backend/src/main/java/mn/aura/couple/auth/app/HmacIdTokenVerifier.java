package mn.aura.couple.auth.app;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jwt.SignedJWT;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.text.ParseException;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Stub IdP-ийн HS256 `id_token` (client secret-ээр гарын үсэг — E2E `mocks/oauthIdp.ts`, GAP-18).
 * Nimbus-ийн `MACVerifier` нь ≥ 256 бит түлхүүр шаарддаг тул (stub-ийн secret богино) HMAC-ийг
 * шууд тооцож тогтмол хугацаагаар харьцуулна. Зөвхөн `aura.oauth.*.id-token-alg=HS256` үед.
 */
public class HmacIdTokenVerifier implements IdTokenVerifier {

    private final byte[] secret;

    public HmacIdTokenVerifier(String secret) {
        this.secret = secret == null ? new byte[0] : secret.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    public Map<String, Object> verify(String idToken) {
        try {
            SignedJWT jwt = SignedJWT.parse(idToken);
            if (!JWSAlgorithm.HS256.equals(jwt.getHeader().getAlgorithm()) || secret.length == 0) {
                throw new OAuthException("ID_TOKEN_INVALID");
            }
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            byte[] expected = mac.doFinal(jwt.getSigningInput());
            if (!MessageDigest.isEqual(expected, jwt.getSignature().decode())) {
                throw new OAuthException("ID_TOKEN_INVALID");
            }
            return jwt.getJWTClaimsSet().toJSONObject();
        } catch (ParseException | GeneralSecurityException e) {
            throw new OAuthException("ID_TOKEN_INVALID");
        }
    }
}
