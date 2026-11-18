package mn.aura.couple.notification.api;

import java.util.UUID;
import mn.aura.couple.api.PushApi;
import mn.aura.couple.api.model.IdResponse;
import mn.aura.couple.api.model.PushSubscriptionInput;
import mn.aura.couple.api.model.VapidKey;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.security.AuraAuthentication;
import mn.aura.couple.notification.app.PushSubscriptionService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Push` tag — VAPID түлхүүр, төхөөрөмжийн subscription (FR-19.3, AC-154). */
@RestController
public class PushController implements PushApi {

    private final PushSubscriptionService subscriptions;

    public PushController(PushSubscriptionService subscriptions) {
        this.subscriptions = subscriptions;
    }

    @Override
    public ResponseEntity<VapidKey> getVapidPublicKey() {
        return subscriptions.vapidPublicKey().map(k -> ResponseEntity.ok(new VapidKey(k)))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @Override
    public ResponseEntity<IdResponse> createPushSubscription(PushSubscriptionInput body) {
        AuraAuthentication auth = auth();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new IdResponse(subscriptions.subscribe(auth.userId(), auth.sessionId(), body)));
    }

    @Override
    public ResponseEntity<Void> deletePushSubscription(UUID subscriptionId) {
        subscriptions.unsubscribe(auth().userId(), subscriptionId);
        return ResponseEntity.noContent().build();
    }

    private static AuraAuthentication auth() {
        return AuraAuthentication.current()
                .orElseThrow(() -> new ApiException(ErrorCode.TOKEN_INVALID, HttpStatus.UNAUTHORIZED));
    }
}
