package mn.aura.couple.anniversary.api;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.anniversary.app.AnniversaryService;
import mn.aura.couple.api.AnniversariesApi;
import mn.aura.couple.api.model.Anniversary;
import mn.aura.couple.api.model.AnniversaryInput;
import mn.aura.couple.api.model.AnniversaryUpdate;
import mn.aura.couple.api.model.Occasion;
import mn.aura.couple.api.model.OccasionDetail;
import mn.aura.couple.api.model.OccasionNoteInput;
import mn.aura.couple.common.space.SpaceAccessGuard;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Anniversaries` tag (T-56, FR-8.1…8.5). Хосгүй (SOLO) үед өөрийн ой, төрсөн өдөр л. */
@RestController
public class AnniversariesController implements AnniversariesApi {

    private final SpaceAccessGuard guard;
    private final AnniversaryService anniversaries;

    public AnniversariesController(SpaceAccessGuard guard, AnniversaryService anniversaries) {
        this.guard = guard;
        this.anniversaries = anniversaries;
    }

    @Override
    public ResponseEntity<List<Occasion>> listOccasions(LocalDate from, LocalDate to, String tz) {
        return ResponseEntity.ok(anniversaries.list(guard.current(), from, to, tz));
    }

    @Override
    public ResponseEntity<Anniversary> createAnniversary(AnniversaryInput body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(anniversaries.create(guard.requireWritable(), body));
    }

    @Override
    public ResponseEntity<Anniversary> getAnniversary(UUID anniversaryId) {
        return ResponseEntity.ok(anniversaries.get(guard.current(), anniversaryId));
    }

    @Override
    public ResponseEntity<Anniversary> updateAnniversary(UUID anniversaryId, AnniversaryUpdate body) {
        return ResponseEntity.ok(anniversaries.update(guard.requireWritable(), anniversaryId, body));
    }

    @Override
    public ResponseEntity<Void> deleteAnniversary(UUID anniversaryId) {
        anniversaries.delete(guard.requireWritable(), anniversaryId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<OccasionDetail> getOccasion(String occasionKey) {
        return ResponseEntity.ok(anniversaries.detail(guard.current(), occasionKey));
    }

    @Override
    public ResponseEntity<OccasionDetail> putOccasionNote(String occasionKey, OccasionNoteInput body) {
        return ResponseEntity.ok(anniversaries.putNote(guard.requireWritable(), occasionKey, body));
    }
}
