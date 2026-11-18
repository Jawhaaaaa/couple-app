package mn.aura.couple.anniversary.app;

import java.time.LocalDate;
import java.util.Comparator;
import mn.aura.couple.anniversary.app.AnniversaryService.OccasionRow;
import mn.aura.couple.api.model.Dashboard;
import mn.aura.couple.api.model.OccasionSource;
import mn.aura.couple.api.model.OccasionSummary;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.UserRefs;
import mn.aura.couple.couple.app.UserRefs.UserRow;
import mn.aura.couple.dashboard.app.DashboardContributor;
import org.springframework.stereotype.Component;

/**
 * Нүүрний «Удахгүй болох ой» (FR-3.4, AC-103): харагчийн бүсээр ирэх 60 хоногийн ой, хамгийн ойрын 3.
 * «N хоног үлдлээ» тоо нь `Occasion.daysUntil`-тай ижил дүрмээр.
 */
@Component
public class UpcomingOccasions implements DashboardContributor {

    static final int HORIZON_DAYS = 60;
    static final int LIMIT = 3;

    private record Next(OccasionRow row, LocalDate on) {
    }

    private final AnniversaryService anniversaries;
    private final UserRefs users;
    private final TimeProvider time;

    public UpcomingOccasions(AnniversaryService anniversaries, UserRefs users, TimeProvider time) {
        this.anniversaries = anniversaries;
        this.users = users;
        this.time = time;
    }

    @Override
    public void contribute(Context ctx, Dashboard dashboard) {
        String locale = users.row(ctx.userId()).map(UserRow::locale).orElse("mn");
        LocalDate today = time.today(ctx.viewerZone());
        LocalDate horizon = today.plusDays(HORIZON_DAYS);
        anniversaries.rows(ctx.spaceId()).stream()
                .map(row -> new Next(row, AutoMilestoneCalculator.nextOn(row.date(), row.recurring(), today)))
                .filter(n -> !n.on().isBefore(today) && !n.on().isAfter(horizon))
                .sorted(Comparator.comparing(Next::on))
                .limit(LIMIT)
                .forEach(n -> {
                    OccasionSummary s = new OccasionSummary(n.row().key(), OccasionSource.fromValue(n.row().source().name()),
                            anniversaries.title(n.row(), locale), n.on(), AutoMilestoneCalculator.daysUntil(n.on(), today));
                    s.kind(AnniversaryService.kind(n.row()));
                    dashboard.addUpcomingItem(s);
                });
    }
}
