package mn.aura.couple.plan.api;

import java.util.List;
import java.util.UUID;
import mn.aura.couple.api.IdeasApi;
import mn.aura.couple.api.model.BudgetBand;
import mn.aura.couple.api.model.DateIdea;
import mn.aura.couple.api.model.DateIdeaInput;
import mn.aura.couple.api.model.DateIdeaUpdate;
import mn.aura.couple.api.model.IdeaCategory;
import mn.aura.couple.api.model.IdeaSetting;
import mn.aura.couple.api.model.LibraryIdea;
import mn.aura.couple.api.model.Locale;
import mn.aura.couple.api.model.RandomPick;
import mn.aura.couple.api.model.Season;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.plan.app.DateIdeaService;
import mn.aura.couple.plan.app.IdeaLibraryService;
import mn.aura.couple.plan.app.RandomIdeaPicker;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Ideas` tag (T-50, FR-7.1, 7.8, 7.11). */
@RestController
public class IdeasController implements IdeasApi {

    private final SpaceAccessGuard guard;
    private final DateIdeaService ideas;
    private final IdeaLibraryService library;
    private final RandomIdeaPicker picker;

    public IdeasController(SpaceAccessGuard guard, DateIdeaService ideas, IdeaLibraryService library,
                           RandomIdeaPicker picker) {
        this.guard = guard;
        this.ideas = ideas;
        this.library = library;
        this.picker = picker;
    }

    @Override
    public ResponseEntity<List<DateIdea>> listIdeas(IdeaCategory category, IdeaSetting setting, Long maxBudget, String q) {
        return ResponseEntity.ok(ideas.list(guard.current(), new DateIdeaService.Filter(category, setting, maxBudget, q)));
    }

    @Override
    public ResponseEntity<DateIdea> createIdea(DateIdeaInput body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ideas.create(guard.requireWritable(), body));
    }

    @Override
    public ResponseEntity<DateIdea> getIdea(UUID ideaId) {
        return ResponseEntity.ok(ideas.get(guard.current(), ideaId));
    }

    @Override
    public ResponseEntity<DateIdea> updateIdea(UUID ideaId, DateIdeaUpdate body) {
        return ResponseEntity.ok(ideas.update(guard.requireWritable(), ideaId, body));
    }

    @Override
    public ResponseEntity<Void> deleteIdea(UUID ideaId) {
        ideas.delete(guard.requireWritable(), ideaId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<RandomPick> pickRandomIdea(IdeaCategory category, IdeaSetting setting, Long maxBudget,
                                                     Boolean includeLibrary) {
        return ideas.random(guard.current(), new RandomIdeaPicker.Criteria(category, setting, maxBudget),
                        Boolean.TRUE.equals(includeLibrary), picker)
                .map(p -> ResponseEntity.ok(new RandomPick(p.idea(), p.candidates())))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @Override
    public ResponseEntity<List<LibraryIdea>> listLibraryIdeas(Season season, BudgetBand budget, IdeaSetting setting,
                                                              Boolean longDistance, IdeaCategory category, Locale locale) {
        String lang = locale != null ? locale.getValue() : ideas.locale(SpaceAccessGuard.currentUserId());
        return ResponseEntity.ok(library.list(new IdeaLibraryService.Filter(season, budget, setting, longDistance, category),
                lang));
    }

    @Override
    public ResponseEntity<DateIdea> adoptLibraryIdea(String libraryId) {
        SpaceContext ctx = guard.requireWritable();
        return ResponseEntity.status(HttpStatus.CREATED).body(ideas.adopt(ctx, libraryId, ideas.locale(ctx.userId())));
    }
}
