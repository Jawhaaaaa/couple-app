package mn.aura.couple.common.mail;

import mn.aura.couple.common.observability.LogRedaction;
import mn.aura.couple.common.observability.Sensitive;

/**
 * Илгээх имэйл. `code` ба `link` нь биед аль хэдийн орсон утга — зөвхөн `MailCapture` (E2E,
 * `/test/mail/last`) уншина. Лог руу `toString` нь код, холбоос, биеийг далдална (INV-11).
 */
public record MailMessage(
        String to,
        String subject,
        @Sensitive String text,
        @Sensitive String html,
        @Sensitive String code,
        @Sensitive String link) {

    @Override
    public String toString() {
        return LogRedaction.toString(this);
    }
}
