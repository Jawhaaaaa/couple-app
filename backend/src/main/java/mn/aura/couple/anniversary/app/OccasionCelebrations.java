package mn.aura.couple.anniversary.app;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.account.app.CelebrationSource;
import mn.aura.couple.anniversary.app.AnniversaryService.OccasionRow;
import mn.aura.couple.anniversary.app.AutoMilestoneCalculator.Source;
import mn.aura.couple.api.model.Celebration;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.CoupleMembers;
import mn.aura.couple.couple.app.UserRefs;
import mn.aura.couple.couple.app.UserRefs.UserRow;
import org.springframework.stereotype.Component;

/**
 * Ойн өдрийн баяр (FR-8.6, S-25 ANIM-05): хэрэглэгчийн бүсээр өнөөдөр болж буй ой. `eventKey` —
 * автомат ойд `milestone:days:1000` (SD-06), давтагдах ойд жилтэй (`anniversary:custom:<id>:2026`) тул ирэх
 * жил дахин гарна. Хэрэглэгч тутамд нэг удаа (GAP-23) — шүүлтийг `CelebrationSeenService` хийнэ.
 */
@Component
public class OccasionCelebrations implements CelebrationSource {

    private final AnniversaryService anniversaries;
    private final CoupleMembers couples;
    private final UserRefs users;
    private final TimeProvider time;

    public OccasionCelebrations(AnniversaryService anniversaries, CoupleMembers couples, UserRefs users, TimeProvider time) {
        this.anniversaries = anniversaries;
        this.couples = couples;
        this.users = users;
        this.time = time;
    }

    @Override
    public List<Celebration> current(UUID userId) {
        List<Celebration> out = new ArrayList<>();
        Optional<UUID> space = couples.coupleSpaceOf(userId);
        Optional<UserRow> me = users.row(userId);
        if (space.isEmpty() || me.isEmpty()) {
            return out;
        }
        LocalDate today = time.today(AnniversaryService.zoneOf(me.get().timezone()));
        for (OccasionRow row : anniversaries.rows(space.get())) {
            LocalDate next = AutoMilestoneCalculator.nextOn(row.date(), row.recurring(), today);
            if (!next.equals(today)) {
                continue;
            }
            String title = anniversaries.title(row, me.get().locale());
            if (row.source() == Source.AUTO_DAYS || row.source() == Source.AUTO_YEARS) {
                Celebration c = new Celebration("milestone:" + row.key(), Celebration.KindEnum.MILESTONE, title);
                c.days(row.source() == Source.AUTO_DAYS ? row.auto().n() : null);
                out.add(c);
            } else {
                String key = "anniversary:" + row.key() + (row.recurring() ? ":" + today.getYear() : "");
                out.add(new Celebration(key, Celebration.KindEnum.ANNIVERSARY, title));
            }
        }
        return out;
    }
}
