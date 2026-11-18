package mn.aura.couple.couple.app;

import java.security.SecureRandom;
import java.util.Locale;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Урилгын код (DD-AURA-039, AC-169): тогтмол угтвар `AURA` + 4 санамсаргүй тэмдэгт
 * (`SecureRandom`), харагдац `AURA-7K3M`. Алфавит нь 0/O, 1/I-г агуулахгүй — гараар оруулахад андуурахгүй.
 */
@Component
public class InviteCodeGenerator {

    public static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    public static final String PREFIX = "AURA-";
    public static final Pattern FORMAT = Pattern.compile("^AURA-[" + ALPHABET + "]{4}$");

    private final SecureRandom random = new SecureRandom();

    public String next() {
        StringBuilder sb = new StringBuilder(PREFIX);
        for (int i = 0; i < 4; i++) {
            sb.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }

    /**
     * Хэрэглэгчийн оруулсан кодыг хэвшүүлнэ: зай, жижиг үсэг, зураасгүй «aura7k3m», угтваргүй «7K3M».
     * Хэлбэрт таарахгүй бол null.
     */
    public static String normalize(String raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.strip().toUpperCase(Locale.ROOT).replaceAll("[\\s-]", "");
        if (s.startsWith("AURA")) {
            s = s.substring(4);
        }
        String code = PREFIX + s;
        return FORMAT.matcher(code).matches() ? code : null;
    }
}
