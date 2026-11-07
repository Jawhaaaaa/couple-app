package mn.aura.couple.signal.api;

import mn.aura.couple.api.SignalsApi;
import mn.aura.couple.api.model.Signal;
import mn.aura.couple.api.model.SignalRequest;
import mn.aura.couple.api.model.SignalSummary;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.signal.app.HeartSignalService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Signals` tag (T-30, FR-4.1…4.5). */
@RestController
public class SignalsController implements SignalsApi {

    private final SpaceAccessGuard guard;
    private final HeartSignalService signals;

    public SignalsController(SpaceAccessGuard guard, HeartSignalService signals) {
        this.guard = guard;
        this.signals = signals;
    }

    @Override
    public ResponseEntity<Signal> sendSignal(SignalRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(signals.send(guard.requireWritableCouple(), body.getKind(),
                body.getText(), body.getClientId()));
    }

    @Override
    public ResponseEntity<SignalSummary> getUnseenSignals() {
        return ResponseEntity.ok(signals.unseen(guard.requireCouple()));
    }

    @Override
    public ResponseEntity<Void> markSignalsSeen() {
        signals.markSeen(guard.requireWritableCouple());
        return ResponseEntity.noContent().build();
    }
}
