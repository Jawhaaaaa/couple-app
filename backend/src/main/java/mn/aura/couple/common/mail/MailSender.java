package mn.aura.couple.common.mail;

import jakarta.annotation.PreDestroy;
import jakarta.mail.internet.MimeMessage;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import mn.aura.couple.common.config.AuraProperties;
import mn.aura.couple.common.observability.ErrorReporter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * SMTP илгээгч (DEV/E2E-д Mailpit, prod-д PAR-AURA-003). Илгээлт үргэлж async — хариуны хугацаа
 * SMTP-ээс хамаарахгүй (DD-AURA-031 timing-safe бүртгэл). Транзакц идэвхтэй бол commit-ийн дараа л
 * дараалалд орно: rollback болсон бүртгэлийн код хэзээ ч илгээгдэхгүй.
 *
 * <p>Илгээгч `aura.mail.from`. Хүлээн авагчийн хаяг, биеийг логлохгүй (INV-11). Bean-ий нэр
 * `auraMailSender` — Spring Boot-ийн `mailSender` (JavaMailSender)-тэй давхцахгүй.
 */
@Component("auraMailSender")
public class MailSender {

    private static final Logger log = LoggerFactory.getLogger(MailSender.class);

    private final JavaMailSender mailSender;
    private final String from;
    private final ObjectProvider<MailCapture> capture;
    private final ErrorReporter errorReporter;
    private final ExecutorService executor = Executors.newThreadPerTaskExecutor(
            Thread.ofVirtual().name("mail-", 0).factory());

    public MailSender(JavaMailSender mailSender, AuraProperties properties, ObjectProvider<MailCapture> capture,
                      ErrorReporter errorReporter) {
        this.mailSender = mailSender;
        this.from = properties.mail().from();
        this.capture = capture;
        this.errorReporter = errorReporter;
    }

    public void sendAsync(MailMessage message) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    enqueue(message);
                }
            });
        } else {
            enqueue(message);
        }
    }

    private void enqueue(MailMessage message) {
        MailCapture c = capture.getIfAvailable();
        if (c != null) {
            c.record(message);
        }
        executor.execute(() -> send(message));
    }

    private void send(MailMessage message) {
        try {
            MimeMessage mime = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mime, message.html() != null, StandardCharsets.UTF_8.name());
            helper.setFrom(from);
            helper.setTo(message.to());
            helper.setSubject(message.subject());
            if (message.html() != null) {
                helper.setText(message.text(), message.html());
            } else {
                helper.setText(message.text());
            }
            mailSender.send(mime);
        } catch (Exception e) {
            log.warn("Имэйл илгээж чадсангүй: {}", e.getClass().getSimpleName());
            errorReporter.report(e);
        }
    }

    @PreDestroy
    void shutdown() throws InterruptedException {
        executor.shutdown();
        executor.awaitTermination(5, TimeUnit.SECONDS);
    }
}
