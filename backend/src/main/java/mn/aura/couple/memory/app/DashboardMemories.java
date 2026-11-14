package mn.aura.couple.memory.app;

import java.util.ArrayList;
import java.util.List;
import mn.aura.couple.api.model.Dashboard;
import mn.aura.couple.api.model.MemorySummary;
import mn.aura.couple.api.model.OnThisDayGroup;
import mn.aura.couple.api.model.OnThisDaySummary;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.dashboard.app.DashboardContributor;
import org.springframework.stereotype.Component;

/**
 * Нүүрний дурсамжийн хэсгүүд (FR-3.4, FR-3.6): сүүлийн 5 дурсамж (AC-72) ба «Жилийн өмнөх өнөөдөр»
 * (AC-73 — хосын өнөөдрийн сар/өдөртэй тэнцүү өмнөх жилүүдийн дурсамж; байхгүй бол хэсэг нуугдана).
 */
@Component
public class DashboardMemories implements DashboardContributor {

    static final int RECENT = 5;

    private final MemorySearchService search;

    public DashboardMemories(MemorySearchService search) {
        this.search = search;
    }

    @Override
    public void contribute(Context ctx, Dashboard dashboard) {
        SpaceContext space = new SpaceContext(ctx.userId(), ctx.spaceId(),
                ctx.partnerId().isPresent() ? SpaceContext.Kind.COUPLE : SpaceContext.Kind.SOLO);
        MemorySearchService.Filter none = new MemorySearchService.Filter(null, null, null, null, null, null, null, null,
                null, null);
        dashboard.recentMemories(new ArrayList<>(search.search(space, none, null, RECENT).getItems()));

        List<OnThisDayGroup> groups = search.onThisDay(space, ctx.coupleToday());
        List<MemorySummary> all = groups.stream().flatMap(g -> g.getMemories().stream()).toList();
        if (!all.isEmpty()) {
            dashboard.onThisDay(new OnThisDaySummary(ctx.coupleToday(), all.size(),
                    new ArrayList<>(all.subList(0, Math.min(RECENT, all.size())))));
        }
    }
}
