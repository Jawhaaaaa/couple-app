package mn.aura.couple.auth.app;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import mn.aura.couple.common.config.AuraProperties;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.stereotype.Component;

/**
 * OAuth `state` — HMAC гарын үсэгтэй, 10 мин (DB-гүй). Агуулга: provider, client (web|native),
 * nonce, дуусах хугацаа. Nonce нь хөтчийн `aura_oauth` cookie-той таарах ёстой (login CSRF).
 */
@Component
public class OAuthStateCodec {

    public static final Duration TTL = Duration.ofMinutes(10);
    private static final Base64.Encoder ENC = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DEC = Base64.getUrlDecoder();

    public record State(String provider, String client, String nonce, Instant expiresAt) {
    }

    private final byte[] key;
    private final TimeProvider time;

    public OAuthStateCodec(AuraProperties properties, TimeProvider time) {
        this.key = ("aura-oauth-state:" + properties.jwt().secret()).getBytes(StandardCharsets.UTF_8);
        this.time = time;
    }

    public String encode(String provider, String client, String nonce) {
        Instant exp = time.now().plus(TTL);
        String payload = ENC.encodeToString((provider + "|" + client + "|" + nonce + "|" + exp.getEpochSecond())
                .getBytes(StandardCharsets.UTF_8));
        return payload + "." + ENC.encodeToString(mac(payload));
    }

    /** Гарын үсэг ба хугацаа зөв бол. */
    public Optional<State> decode(String state) {
        if (state == null) {
            return Optional.empty();
        }
        int dot = state.indexOf('.');
        if (dot <= 0) {
            return Optional.empty();
        }
        try {
            String payload = state.substring(0, dot);
            if (!MessageDigest.isEqual(mac(payload), DEC.decode(state.substring(dot + 1)))) {
                return Optional.empty();
            }
            String[] parts = new String(DEC.decode(payload), StandardCharsets.UTF_8).split("\\|");
            if (parts.length != 4) {
                return Optional.empty();
            }
            Instant exp = Instant.ofEpochSecond(Long.parseLong(parts[3]));
            if (!exp.isAfter(time.now())) {
                return Optional.empty();
            }
            return Optional.of(new State(parts[0], parts[1], parts[2], exp));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    private byte[] mac(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
