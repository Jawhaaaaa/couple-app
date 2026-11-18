package mn.aura.couple.realtime.app;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.time.TimeProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Домэйн service-ийн `RealtimeEvent`-ийг commit-ийн ДАРАА хүлээн авагч бүрийн `/user/queue/events`
 * руу илгээнэ (DD-AURA-008/009): commit болоогүй өгөгдөл түгэхгүй. Payload нь хүлээн авагч тутам
 * проекцлогдоно (INV-04). Транзакцгүй үед (`fallbackExecution`) шууд илгээнэ.
 */
@Component
public class RealtimePublisher {

    public static final String USER_QUEUE = "/queue/events";
    private static final Logger log = LoggerFactory.getLogger(RealtimePublisher.class);

    private final SimpMessagingTemplate messaging;
    private final TimeProvider time;

    public RealtimePublisher(SimpMessagingTemplate messaging, TimeProvider time) {
        this.messaging = messaging;
        this.time = time;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onEvent(RealtimeEvent event) {
        OffsetDateTime at = OffsetDateTime.ofInstant(time.now(), ZoneOffset.UTC);
        UUID id = Ids.newId();
        for (UUID recipient : event.recipients()) {
            Object payload = event.payloadFor().apply(recipient);
            if (payload == null) {
                continue; // проекц нь энэ хүлээн авагчид юу ч үзүүлэхгүй гэж шийдсэн
            }
            send(recipient, new RealtimeEnvelope(id, event.type(), at, event.actorId(), payload));
        }
    }

    public void send(UUID recipient, RealtimeEnvelope envelope) {
        try {
            messaging.convertAndSendToUser(recipient.toString(), USER_QUEUE, envelope);
        } catch (RuntimeException e) {
            // Realtime нь хамгийн сайн оролдлого — client дахин холбогдохдоо query-гээ шинэчилнэ (DD-AURA-009)
            log.warn("Realtime илгээлт амжилтгүй: type={} recipient={}", envelope.type(), recipient, e);
        }
    }
}
