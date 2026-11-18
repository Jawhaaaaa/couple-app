package mn.aura.couple.letter.app;

import java.util.ArrayList;
import mn.aura.couple.api.model.Dashboard;
import mn.aura.couple.dashboard.app.DashboardContributor;
import org.springframework.stereotype.Component;

/** Нүүрний «💌 Чамд … захидал ирнэ» тэмдэг (FR-10.2, AC-182) — агуулгагүй teaser (INV-04). */
@Component
public class IncomingLetters implements DashboardContributor {

    private final LetterService letters;

    public IncomingLetters(LetterService letters) {
        this.letters = letters;
    }

    @Override
    public void contribute(Context ctx, Dashboard dashboard) {
        if (ctx.partnerId().isEmpty()) {
            return;
        }
        dashboard.incomingLetters(new ArrayList<>(letters.incoming(ctx.spaceId(), ctx.userId())));
    }
}
