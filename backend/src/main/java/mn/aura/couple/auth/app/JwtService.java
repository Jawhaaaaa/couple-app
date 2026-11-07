package mn.aura.couple.auth.app;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.nio.charset.StandardCharsets;
import java.text.ParseException;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.config.AuraProperties;
import mn.aura.couple.common.security.ApiAuthenticationException;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.stereotype.Component;

/**
 * Access JWT (DD-AURA-006): HS256, 15 мин, claim `sub` (хэрэглэгч), `sid` (`device_session`),
 * `sv` (`users.session_version`). Нууц `aura.jwt.secret` ≥ 32 байт — үгүй бол апп асахгүй (INV-10).
 * Хугацааг `TimeProvider`-ээр шалгана (E2E-д `MutableClock`, AC-168).
 */
@Component
public class JwtService {

    public static final Duration ACCESS_TTL = Duration.ofMinutes(15);
    static final String ISSUER = "aura";

    public record Claims(UUID userId, UUID sessionId, int sessionVersion, Instant expiresAt) {
    }

    public record AccessToken(String token, Instant expiresAt) {
        @Override
        public String toString() {
            return "AccessToken[token=***, expiresAt=" + expiresAt + "]";
        }
    }

    private final MACSigner signer;
    private final MACVerifier verifier;
    private final TimeProvider time;

    public JwtService(AuraProperties properties, TimeProvider time) {
        byte[] secret = properties.jwt().secret() == null ? new byte[0]
                : properties.jwt().secret().getBytes(StandardCharsets.UTF_8);
        if (secret.length < 32) {
            throw new IllegalStateException("aura.jwt.secret (AURA_JWT_SECRET) дор хаяж 32 байт байх ёстой");
        }
        try {
            this.signer = new MACSigner(secret);
            this.verifier = new MACVerifier(secret);
        } catch (JOSEException e) {
            throw new IllegalStateException("JWT түлхүүр буруу", e);
        }
        this.time = time;
    }

    public AccessToken issue(UUID userId, UUID sessionId, int sessionVersion) {
        Instant now = time.now();
        Instant exp = now.plus(ACCESS_TTL);
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .issuer(ISSUER)
                .subject(userId.toString())
                .claim("sid", sessionId.toString())
                .claim("sv", sessionVersion)
                .issueTime(Date.from(now))
                .expirationTime(Date.from(exp))
                .build();
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.HS256).type(JOSEObjectType.JWT).build(), claims);
        try {
            jwt.sign(signer);
        } catch (JOSEException e) {
            throw new IllegalStateException(e);
        }
        return new AccessToken(jwt.serialize(), exp);
    }

    /** Гарын үсэг, хугацаа, бүтэц. Хугацаа дууссан → `TOKEN_EXPIRED`, бусад → `TOKEN_INVALID`. */
    public Claims parse(String token) {
        try {
            SignedJWT jwt = SignedJWT.parse(token);
            if (!JWSAlgorithm.HS256.equals(jwt.getHeader().getAlgorithm()) || !jwt.verify(verifier)) {
                throw invalid();
            }
            JWTClaimsSet c = jwt.getJWTClaimsSet();
            if (!ISSUER.equals(c.getIssuer()) || c.getExpirationTime() == null || c.getSubject() == null) {
                throw invalid();
            }
            Instant exp = c.getExpirationTime().toInstant();
            if (!exp.isAfter(time.now())) {
                throw new ApiAuthenticationException(ErrorCode.TOKEN_EXPIRED);
            }
            Object sv = c.getClaim("sv");
            if (!(sv instanceof Number n)) {
                throw invalid();
            }
            return new Claims(UUID.fromString(c.getSubject()), UUID.fromString(c.getStringClaim("sid")), n.intValue(), exp);
        } catch (ParseException | JOSEException | IllegalArgumentException | NullPointerException e) {
            throw invalid();
        }
    }

    private static ApiAuthenticationException invalid() {
        return new ApiAuthenticationException(ErrorCode.TOKEN_INVALID);
    }
}
