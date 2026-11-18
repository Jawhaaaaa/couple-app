package mn.aura.couple.plan.api;

import java.util.List;
import mn.aura.couple.api.DeckApi;
import mn.aura.couple.api.model.DeckCard;
import mn.aura.couple.api.model.DeckMatch;
import mn.aura.couple.api.model.DeckSwipe;
import mn.aura.couple.api.model.SwipeResult;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.plan.app.SecretDeckService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Deck` tag (T-53, FR-7.9, AC-36). */
@RestController
public class DeckController implements DeckApi {

    private final SpaceAccessGuard guard;
    private final SecretDeckService deck;

    public DeckController(SpaceAccessGuard guard, SecretDeckService deck) {
        this.guard = guard;
        this.deck = deck;
    }

    @Override
    public ResponseEntity<List<DeckCard>> getDeckCards(Integer limit) {
        return ResponseEntity.ok(deck.next(guard.current(), limit));
    }

    @Override
    public ResponseEntity<SwipeResult> swipeDeckCard(DeckSwipe body) {
        return ResponseEntity.ok(deck.swipe(guard.requireWritable(), body.getIdeaRef(), body.getLiked()));
    }

    @Override
    public ResponseEntity<List<DeckMatch>> listDeckMatches() {
        return ResponseEntity.ok(deck.matches(guard.current()));
    }
}
