package mn.aura.couple.memory.api;

import java.util.List;
import java.util.UUID;
import mn.aura.couple.api.RecapsApi;
import mn.aura.couple.api.model.Recap;
import mn.aura.couple.api.model.RecapSummary;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.memory.app.MemoryRecapJob;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Recaps` tag (T-41, S-38). */
@RestController
public class RecapsController implements RecapsApi {

    private final SpaceAccessGuard guard;
    private final MemoryRecapJob recaps;

    public RecapsController(SpaceAccessGuard guard, MemoryRecapJob recaps) {
        this.guard = guard;
        this.recaps = recaps;
    }

    @Override
    public ResponseEntity<List<RecapSummary>> listRecaps() {
        return ResponseEntity.ok(recaps.list(guard.current()));
    }

    @Override
    public ResponseEntity<Recap> getRecap(UUID recapId) {
        return ResponseEntity.ok(recaps.get(guard.current(), recapId));
    }
}
