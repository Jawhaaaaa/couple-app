package mn.aura.couple.auth.app;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import mn.aura.couple.common.config.AuraProperties;
import org.springframework.stereotype.Component;

/**
 * Нэг удаагийн нууц утга үүсгэх ба hash хийх (DD-AURA-006, LLD §3 `email_token`):
 * <ul>
 *   <li>Холбоос/refresh/exchange токен — 256 бит санамсаргүй, DB-д SHA-256.</li>
 *   <li>6 оронтой код — DB-д HMAC-SHA256 (`aura.jwt.secret`-ээс гаргасан түлхүүр, хэрэглэгч ба
 *       зорилгоор хүрээлсэн). Энгийн SHA-256 бол 10⁶ хувилбарыг DB алдагдмагц шууд тайлна.</li>
 * </ul>
 */
@Component
public class TokenHasher {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final HexFormat HEX = HexFormat.of();

    private final byte[] codeKey;

    public TokenHasher(AuraProperties properties) {
        this.codeKey = sha256Bytes(("aura-code-pepper:" + properties.jwt().secret()).getBytes(StandardCharsets.UTF_8));
    }

    /** 256 бит, base64url (43 тэмдэгт). */
    public String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** 000000–999999. */
    public String randomCode() {
        return String.format("%06d", RANDOM.nextInt(1_000_000));
    }

    public String sha256(String value) {
        return HEX.formatHex(sha256Bytes(value.getBytes(StandardCharsets.UTF_8)));
    }

    public String hmacCode(String scope, String code) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(codeKey, "HmacSHA256"));
            return HEX.formatHex(mac.doFinal((scope + ":" + code).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Тогтмол хугацааны харьцуулалт. */
    public static boolean matches(String expectedHex, String actualHex) {
        if (expectedHex == null || actualHex == null) {
            return false;
        }
        return MessageDigest.isEqual(expectedHex.getBytes(StandardCharsets.US_ASCII), actualHex.getBytes(StandardCharsets.US_ASCII));
    }

    private static byte[] sha256Bytes(byte[] input) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(input);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
