package mn.aura.couple.notification.app;

import java.util.UUID;
import mn.aura.couple.notification.domain.PushSubscriptionRepository.SubscriptionRow;

/** Push дамжуулах суваг — төхөөрөмжийн төрлөөр (DD-AURA-022): `WEB` → Web Push, `EXPO` → Expo. */
public interface PushChannel {

    /** Push-ийн агуулга (мессеж/захидлын текст хэзээ ч орохгүй — NFR-06). */
    record PushMessage(UUID notificationId, String type, String title, String body, String deepLink) {
    }

    enum Result { SENT, GONE, FAILED, SKIPPED }

    String kind();

    Result send(SubscriptionRow subscription, PushMessage message);
}
