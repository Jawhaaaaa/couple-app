package mn.aura.couple.notification.app;

import java.time.Instant;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.common.event.Notify;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.notification.domain.NotificationRepository;
import mn.aura.couple.notification.domain.NotificationRepository.NotificationRow;
import mn.aura.couple.notification.domain.NotificationRepository.SettingRow;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Мэдэгдлийн нэг цэг (DD-AURA-022). Домэйн service-ийн `Notify`-г ижил транзакцад:
 * <ol>
 *   <li>`notification` мөр — апп доторх жагсаалтад үргэлж (AC-119)</li>
 *   <li>Төрөл унтраастай эсвэл «Түр тайван байх» (FR-13.7) бол push алгасна</li>
 *   <li>«Бүү саад бол» цонхонд бол push-ийг цонх дуусах хүртэл хойшлуулна — дуусахад нэгтгэсэн нэг push (AC-48)</li>
 *   <li>Commit-ийн дараа `PushDeliveryService` push-ийг даруй илгээнэ; хоцорсон нь 30 с тутмын ажлаар</li>
 * </ol>
 */
@Component
public class NotificationDispatcher {

    /** Commit-ийн дараа тухайн хэрэглэгчийн хугацаа болсон push-ийг илгээх дохио. */
    public record PushDue(UUID userId) {
    }

    private final NotificationRepository repo;
    private final NotificationTexts texts;
    private final NotificationPreferenceService preferences;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;

    public NotificationDispatcher(NotificationRepository repo, NotificationTexts texts,
                                  NotificationPreferenceService preferences, ApplicationEventPublisher events,
                                  TimeProvider time) {
        this.repo = repo;
        this.texts = texts;
        this.preferences = preferences;
        this.events = events;
        this.time = time;
    }

    @EventListener
    public void onNotify(Notify n) {
        dispatch(n);
    }

    public UUID dispatch(Notify n) {
        Instant now = time.now();
        UUID id = Ids.newId();
        String variant = texts.pickVariant(n.type());
        repo.insert(new NotificationRow(id, n.recipientId(), n.spaceId(), n.type(), variant, n.params(), n.deepLink(),
                now, null));

        SettingRow settings = preferences.load(n.recipientId());
        boolean quiet = settings.quietUntil() != null && settings.quietUntil().isAfter(now);
        if (!settings.disabledTypes().contains(n.type()) && !quiet) {
            Instant dndEnd = NotificationPreferenceService.dndEndsAt(settings,
                    ZoneId.of(repo.timezone(n.recipientId())), now);
            repo.enqueuePush(Ids.newId(), n.recipientId(), id, dndEnd == null ? now : dndEnd, dndEnd != null);
            if (dndEnd == null) {
                events.publishEvent(new PushDue(n.recipientId()));
            }
        }

        NotificationTexts.Text text = texts.render(variant, repo.locale(n.recipientId()), n.params());
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", id);
        payload.put("type", n.type());
        payload.put("title", text.title());
        payload.put("deepLink", n.deepLink());
        events.publishEvent(RealtimeEvent.of("notification.created", n.actorId(), List.of(n.recipientId()), payload));
        return id;
    }
}
