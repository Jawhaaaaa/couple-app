package mn.aura.couple.chat.api;

import java.util.UUID;
import mn.aura.couple.api.PromisesApi;
import mn.aura.couple.api.model.PromiseCreate;
import mn.aura.couple.api.model.PromiseOutcome;
import mn.aura.couple.api.model.SharedPromise;
import mn.aura.couple.chat.app.SharedPromiseService;
import mn.aura.couple.common.space.SpaceAccessGuard;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Promises` tag (T-49, FR-6.11, AC-93). Бүгд хос шаардана (`x-aura-requires-couple`). */
@RestController
public class PromisesController implements PromisesApi {

    private final SpaceAccessGuard guard;
    private final SharedPromiseService promises;

    public PromisesController(SpaceAccessGuard guard, SharedPromiseService promises) {
        this.guard = guard;
        this.promises = promises;
    }

    @Override
    public ResponseEntity<SharedPromise> getCurrentPromise() {
        return promises.current(guard.requireCouple()).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @Override
    public ResponseEntity<SharedPromise> proposePromise(PromiseCreate body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(promises.propose(guard.requireWritableCouple(), body.getText()));
    }

    @Override
    public ResponseEntity<SharedPromise> acceptPromise(UUID promiseId) {
        return ResponseEntity.ok(promises.accept(guard.requireWritableCouple(), promiseId));
    }

    @Override
    public ResponseEntity<SharedPromise> declinePromise(UUID promiseId) {
        return ResponseEntity.ok(promises.decline(guard.requireWritableCouple(), promiseId));
    }

    @Override
    public ResponseEntity<SharedPromise> recordPromiseOutcome(UUID promiseId, PromiseOutcome body) {
        return ResponseEntity.ok(promises.outcome(guard.requireWritableCouple(), promiseId, body.getKept()));
    }
}
