package mn.aura.couple.anniversary.api;

import java.util.List;
import java.util.UUID;
import mn.aura.couple.anniversary.app.GiftIdeaService;
import mn.aura.couple.api.GiftIdeasApi;
import mn.aura.couple.api.model.GiftIdea;
import mn.aura.couple.api.model.GiftIdeaInput;
import mn.aura.couple.api.model.GiftIdeaUpdate;
import mn.aura.couple.common.space.SpaceAccessGuard;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `GiftIdeas` tag (T-56, FR-8.7) — зөвхөн эзэндээ (AC-40). */
@RestController
public class GiftIdeasController implements GiftIdeasApi {

    private final SpaceAccessGuard guard;
    private final GiftIdeaService gifts;

    public GiftIdeasController(SpaceAccessGuard guard, GiftIdeaService gifts) {
        this.guard = guard;
        this.gifts = gifts;
    }

    @Override
    public ResponseEntity<List<GiftIdea>> listGiftIdeas(String occasionKey) {
        return ResponseEntity.ok(gifts.list(guard.current(), occasionKey));
    }

    @Override
    public ResponseEntity<GiftIdea> createGiftIdea(GiftIdeaInput body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(gifts.create(guard.requireWritable(), body));
    }

    @Override
    public ResponseEntity<GiftIdea> updateGiftIdea(UUID giftIdeaId, GiftIdeaUpdate body) {
        return ResponseEntity.ok(gifts.update(guard.requireWritable(), giftIdeaId, body));
    }

    @Override
    public ResponseEntity<Void> deleteGiftIdea(UUID giftIdeaId) {
        gifts.delete(guard.requireWritable(), giftIdeaId);
        return ResponseEntity.noContent().build();
    }
}
