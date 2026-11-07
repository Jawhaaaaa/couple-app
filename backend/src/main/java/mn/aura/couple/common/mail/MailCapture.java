package mn.aura.couple.common.mail;

import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Хүлээн авагч бүрийн сүүлийн имэйл — санах ойд, зөвхөн `e2e` profile (INV-10).
 * `GET /test/mail/last?to=` үүнийг уншина; SMTP руу илгээлт хэвээр (Mailpit-д ч очно).
 */
@Component
@Profile("e2e")
public class MailCapture {

    private final Map<String, MailMessage> last = new ConcurrentHashMap<>();

    void record(MailMessage message) {
        last.put(key(message.to()), message);
    }

    public Optional<MailMessage> last(String to) {
        return Optional.ofNullable(last.get(key(to)));
    }

    private static String key(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }
}
