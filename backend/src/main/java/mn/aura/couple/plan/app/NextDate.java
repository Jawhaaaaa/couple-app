package mn.aura.couple.plan.app;

import mn.aura.couple.api.model.Dashboard;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.dashboard.app.DashboardContributor;
import org.springframework.stereotype.Component;

/**
 * Нүүрний «Дараагийн болзоо» (FR-3.4, AC-72): одооноос хойшхи хамгийн ойрын идэвхтэй болзоо
 * (батлагдсан эсвэл хариу хүлээж буй — S-50-ийн «Удахгүй»-тэй ижил).
 */
@Component
public class NextDate implements DashboardContributor {

    private final DatePlanService plans;

    public NextDate(DatePlanService plans) {
        this.plans = plans;
    }

    @Override
    public void contribute(Context ctx, Dashboard dashboard) {
        if (ctx.partnerId().isEmpty()) {
            return;
        }
        SpaceContext space = new SpaceContext(ctx.userId(), ctx.spaceId(), SpaceContext.Kind.COUPLE);
        plans.list(space, null, null, null, "upcoming").stream().findFirst().ifPresent(dashboard::nextDate);
    }
}
