package mn.aura.couple.plan.app;

import java.security.SecureRandom;
import java.util.List;
import java.util.Optional;
import java.util.random.RandomGenerator;
import mn.aura.couple.api.model.IdeaCategory;
import mn.aura.couple.api.model.IdeaSetting;
import mn.aura.couple.api.model.RandomPickIdea;
import org.springframework.stereotype.Component;

/**
 * «Санамсаргүй сонго» (FR-7.8, AC-98): зөвхөн шүүлтэд тохирох санаанаас жигд санамсаргүй нэгийг сонгоно;
 * тохирох алга бол хоосон (API 204 → «Шүүлтэд тохирох санаа алга» + шүүлт сулруулах). Mobile
 * `src/domain/randomFilter.ts` ижил дүрэмтэй.
 * <ul>
 *   <li>Ангилал, гэр/гадаа — яг тэнцүү; санаанд гэр/гадаа заагаагүй бол тэр шүүлтэд тохирохгүй</li>
 *   <li>`maxBudget` — санааны төсөв (сангийнх зурвасын дээд хязгаар) ≤ шүүлт; төсөв заагаагүй хосын санаа
 *       нь «зардал тодорхойгүй» тул шүүлтэд тохирно</li>
 * </ul>
 */
@Component
public class RandomIdeaPicker {

    /** Шүүлт; null талбар = шүүхгүй. */
    public record Criteria(IdeaCategory category, IdeaSetting setting, Long maxBudget) {
    }

    /** Сонголтын нэр дэвшигч — `budgetMnt` нь хосын санааны төсөв эсвэл сангийн зурвасын дээд хязгаар. */
    public record Candidate(RandomPickIdea idea, IdeaCategory category, IdeaSetting setting, Long budgetMnt) {
    }

    public record Pick(RandomPickIdea idea, int candidates) {
    }

    private final RandomGenerator random;

    public RandomIdeaPicker() {
        this(new SecureRandom());
    }

    RandomIdeaPicker(RandomGenerator random) {
        this.random = random;
    }

    public static boolean matches(Candidate c, Criteria f) {
        return (f.category() == null || f.category() == c.category())
                && (f.setting() == null || f.setting() == c.setting())
                && (f.maxBudget() == null || c.budgetMnt() == null || c.budgetMnt() <= f.maxBudget());
    }

    public Optional<Pick> pick(List<Candidate> all, Criteria f) {
        List<Candidate> ok = all.stream().filter(c -> matches(c, f)).toList();
        if (ok.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(new Pick(ok.get(random.nextInt(ok.size())).idea(), ok.size()));
    }
}
