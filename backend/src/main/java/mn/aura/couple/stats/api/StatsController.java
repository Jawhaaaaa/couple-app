package mn.aura.couple.stats.api;

import mn.aura.couple.api.StatsApi;
import mn.aura.couple.api.model.Stats;
import mn.aura.couple.api.model.YearInReview;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.stats.app.StatsService;
import mn.aura.couple.stats.app.YearInReviewService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Stats` tag (T-65, FR-12.2…12.4, AC-47, AC-117, AC-118). */
@RestController
public class StatsController implements StatsApi {

    private final SpaceAccessGuard guard;
    private final StatsService stats;
    private final YearInReviewService years;

    public StatsController(SpaceAccessGuard guard, StatsService stats, YearInReviewService years) {
        this.guard = guard;
        this.stats = stats;
        this.years = years;
    }

    @Override
    public ResponseEntity<Stats> getStats() {
        return ResponseEntity.ok(stats.stats(guard.current()));
    }

    @Override
    public ResponseEntity<YearInReview> getYearInReview(Integer year) {
        return ResponseEntity.ok(years.year(guard.current(), year));
    }
}
