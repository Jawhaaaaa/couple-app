package mn.aura.couple.export.app;

import java.util.Map;
import java.util.UUID;
import mn.aura.couple.common.config.AuraProperties;
import mn.aura.couple.common.mail.MailMessage;
import mn.aura.couple.common.mail.MailSender;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

/**
 * Экспорт бэлэн болсны имэйл (FR-14.5, AC-126). Файлын шууд холбоос биш — апп-ын «Өгөгдөл» хуудас руу (нэвтэрсэн
 * хүн л татна); 7 хоногийн хугацааг дурдана.
 */
@Component
public class ExportMails {

    private final MailSender sender;
    private final JdbcTemplate jdbc;
    private final String webBase;

    public ExportMails(MailSender sender, JdbcTemplate jdbc, AuraProperties properties) {
        this.sender = sender;
        this.jdbc = jdbc;
        String base = properties.web().baseUrl();
        this.webBase = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
    }

    public void ready(UUID userId) {
        Map<String, Object> u = jdbc.queryForMap("SELECT email::text AS email, locale FROM users WHERE id = ?", userId);
        String to = (String) u.get("email");
        String link = webBase + "/settings/data";
        boolean en = "en".equals(u.get("locale"));
        String subject = en ? "Aura — your export is ready" : "Aura — таны хуулбар бэлэн боллоо";
        String text = en
                ? "Your Aura data export is ready. Open the app to download it:\n" + link
                        + "\n\nThe download link expires in 7 days."
                : "Таны Aura-гийн өгөгдлийн хуулбар бэлэн боллоо. Апп-аас татаж авна уу:\n" + link
                        + "\n\nТатах холбоос 7 хоногийн дараа хүчингүй болно.";
        String html = "<!doctype html><html><body style=\"font-family:sans-serif\"><p>"
                + HtmlUtils.htmlEscape(text).replace("\n", "<br>") + "</p></body></html>";
        sender.sendAsync(new MailMessage(to, subject, text, html, null, link));
    }
}
