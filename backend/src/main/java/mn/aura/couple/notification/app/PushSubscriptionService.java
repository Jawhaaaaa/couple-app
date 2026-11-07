package mn.aura.couple.notification.app;

import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.api.model.PushSubscriptionInput;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.notification.domain.PushSubscriptionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Төхөөрөмжийн push бүртгэл (FR-19.3): `WEB` — endpoint + p256dh/auth (зөвшөөрөгдсөн push service-ийн
 * хост л), `EXPO` — Expo токен. `localReminders` = native локал сануулгатай (DD-AURA-023).
 */
@Service
public class PushSubscriptionService {

    private final PushSubscriptionRepository repo;
    private final WebPushSender webPush;
    private final PushProperties properties;
    private final TimeProvider time;

    public PushSubscriptionService(PushSubscriptionRepository repo, WebPushSender webPush, PushProperties properties,
                                   TimeProvider time) {
        this.repo = repo;
        this.webPush = webPush;
        this.properties = properties;
        this.time = time;
    }

    /** VAPID нийтийн түлхүүр — тохиргоо хоосон бол хоосон (`204`). */
    public Optional<String> vapidPublicKey() {
        return properties.webPushEnabled() ? Optional.of(properties.vapidPublicKey()) : Optional.empty();
    }

    @Transactional
    public UUID subscribe(UUID userId, UUID sessionId, PushSubscriptionInput in) {
        boolean local = Boolean.TRUE.equals(in.getLocalReminders());
        if (in.getKind() == PushSubscriptionInput.KindEnum.WEB) {
            String endpoint = in.getEndpoint() == null ? null : in.getEndpoint().toString();
            if (endpoint == null || in.getKeys() == null) {
                throw ApiException.validation("endpoint", ErrorCode.VALIDATION_FAILED);
            }
            if (!webPush.endpointAllowed(endpoint)) {
                throw ApiException.validation("endpoint", ErrorCode.VALIDATION_FAILED);
            }
            try {
                WebPushCrypto.publicKey(WebPushCrypto.unb64(in.getKeys().getP256dh()));
                if (WebPushCrypto.unb64(in.getKeys().getAuth()).length != 16) {
                    throw new IllegalArgumentException("auth");
                }
            } catch (java.security.GeneralSecurityException | IllegalArgumentException e) {
                throw ApiException.validation("keys", ErrorCode.VALIDATION_FAILED);
            }
            return repo.upsert(Ids.newId(), userId, sessionId, "WEB", endpoint, in.getKeys().getP256dh(),
                    in.getKeys().getAuth(), null, local, time.now());
        }
        if (in.getExpoToken() == null || in.getExpoToken().isBlank()) {
            throw ApiException.validation("expoToken", ErrorCode.VALIDATION_FAILED);
        }
        return repo.upsert(Ids.newId(), userId, sessionId, "EXPO", null, null, null, in.getExpoToken().strip(), local,
                time.now());
    }

    @Transactional
    public void unsubscribe(UUID userId, UUID subscriptionId) {
        if (repo.delete(subscriptionId, userId) == 0) {
            throw ApiException.notFound();
        }
    }
}
