package mn.aura.couple.letter.api;

import java.util.List;
import java.util.UUID;
import mn.aura.couple.api.CapsulesApi;
import mn.aura.couple.api.LettersApi;
import mn.aura.couple.api.model.Capsule;
import mn.aura.couple.api.model.CapsuleCreate;
import mn.aura.couple.api.model.CapsulePartInput;
import mn.aura.couple.api.model.CapsuleSummary;
import mn.aura.couple.api.model.Letter;
import mn.aura.couple.api.model.LetterInput;
import mn.aura.couple.api.model.LetterUpdate;
import mn.aura.couple.api.model.ListLetters200ResponseInner;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.letter.app.LetterService;
import mn.aura.couple.letter.app.TimeCapsuleService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Letters` ба `Capsules` tag (T-61, FR-10.1…10.5). Бүгд хос шаардана. */
@RestController
public class LettersController implements LettersApi, CapsulesApi {

    private final SpaceAccessGuard guard;
    private final LetterService letters;
    private final TimeCapsuleService capsules;

    public LettersController(SpaceAccessGuard guard, LetterService letters, TimeCapsuleService capsules) {
        this.guard = guard;
        this.letters = letters;
        this.capsules = capsules;
    }

    @Override
    public ResponseEntity<List<ListLetters200ResponseInner>> listLetters(String box) {
        return ResponseEntity.ok(letters.list(guard.requireCouple(), box));
    }

    @Override
    public ResponseEntity<Letter> createLetter(LetterInput body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(letters.create(guard.requireWritableCouple(), body));
    }

    @Override
    public ResponseEntity<Letter> getLetter(UUID letterId) {
        return ResponseEntity.ok(letters.get(guard.requireCouple(), letterId));
    }

    @Override
    public ResponseEntity<Letter> updateLetter(UUID letterId, LetterUpdate body) {
        return ResponseEntity.ok(letters.update(guard.requireWritableCouple(), letterId, body));
    }

    @Override
    public ResponseEntity<Void> cancelLetter(UUID letterId) {
        letters.cancel(guard.requireWritableCouple(), letterId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Letter> markLetterRead(UUID letterId) {
        return ResponseEntity.ok(letters.markRead(guard.requireWritableCouple(), letterId));
    }

    @Override
    public ResponseEntity<List<CapsuleSummary>> listCapsules() {
        return ResponseEntity.ok(capsules.list(guard.requireCouple()));
    }

    @Override
    public ResponseEntity<Capsule> createCapsule(CapsuleCreate body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(capsules.create(guard.requireWritableCouple(),
                body.getTitle(), body.getOpenOn()));
    }

    @Override
    public ResponseEntity<Capsule> getCapsule(UUID capsuleId) {
        return ResponseEntity.ok(capsules.get(guard.requireCouple(), capsuleId));
    }

    @Override
    public ResponseEntity<Capsule> putMyCapsulePart(UUID capsuleId, CapsulePartInput body) {
        return ResponseEntity.ok(capsules.putMyPart(guard.requireWritableCouple(), capsuleId, body.getBody(),
                body.getMediaIds()));
    }

    @Override
    public ResponseEntity<Capsule> sealCapsule(UUID capsuleId) {
        return ResponseEntity.ok(capsules.seal(guard.requireWritableCouple(), capsuleId));
    }
}
