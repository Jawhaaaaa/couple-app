package mn.aura.couple.auth.app;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * Нууц үгийн дүрэм (FR-1.1, AC-164, AC-189): ≥ 8 тэмдэгт (≤ 128), нийтлэг/алдагдсан жагсаалтад
 * (`security/common-passwords.txt`, жижиг үсгээр харьцуулна) байхгүй, имэйлтэйгээ ижил биш.
 */
@Component
public class PasswordPolicy {

    public static final int MIN_LENGTH = 8;
    public static final int MAX_LENGTH = 128;
    static final String RESOURCE = "security/common-passwords.txt";

    private final Set<String> common;

    public PasswordPolicy() {
        this.common = load();
    }

    /** Зөрчил бол 400 `PASSWORD_WEAK` / `PASSWORD_COMMON` (`fieldErrors[field]`). */
    public void check(String password, String email, String field) {
        if (password == null || password.codePointCount(0, password.length()) < MIN_LENGTH
                || password.length() > MAX_LENGTH || password.isBlank()) {
            throw ApiException.badRequest(ErrorCode.PASSWORD_WEAK, field);
        }
        String lower = password.toLowerCase(Locale.ROOT);
        if (common.contains(lower)) {
            throw ApiException.badRequest(ErrorCode.PASSWORD_COMMON, field);
        }
        if (email != null) {
            String e = email.toLowerCase(Locale.ROOT);
            int at = e.indexOf('@');
            if (lower.equals(e) || (at > 0 && lower.equals(e.substring(0, at)))) {
                throw ApiException.badRequest(ErrorCode.PASSWORD_WEAK, field);
            }
        }
    }

    public boolean isCommon(String password) {
        return password != null && common.contains(password.toLowerCase(Locale.ROOT));
    }

    int size() {
        return common.size();
    }

    private static Set<String> load() {
        Set<String> out = new HashSet<>(16_384);
        try (BufferedReader r = new BufferedReader(new InputStreamReader(
                new ClassPathResource(RESOURCE).getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) {
                String p = line.strip();
                if (!p.isEmpty() && !p.startsWith("#")) {
                    out.add(p.toLowerCase(Locale.ROOT));
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Нийтлэг нууц үгийн жагсаалт уншигдсангүй: " + RESOURCE, e);
        }
        return Set.copyOf(out);
    }
}
