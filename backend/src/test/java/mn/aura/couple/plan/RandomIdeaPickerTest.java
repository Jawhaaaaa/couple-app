package mn.aura.couple.plan;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import mn.aura.couple.api.model.DateIdea;
import mn.aura.couple.api.model.IdeaCategory;
import mn.aura.couple.api.model.IdeaSetting;
import mn.aura.couple.api.model.LibraryIdea;
import mn.aura.couple.api.model.UserRef;
import mn.aura.couple.plan.app.IdeaLibraryService;
import mn.aura.couple.plan.app.RandomIdeaPicker;
import mn.aura.couple.plan.app.RandomIdeaPicker.Candidate;
import mn.aura.couple.plan.app.RandomIdeaPicker.Criteria;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RandomIdeaPickerTest {

    private final RandomIdeaPicker picker = new RandomIdeaPicker();

    private static Candidate idea(String title, IdeaCategory c, IdeaSetting s, Long budget) {
        DateIdea d = new DateIdea(UUID.randomUUID(), title, c, new UserRef(UUID.randomUUID(), "A"),
                OffsetDateTime.parse("2026-11-07T00:00:00Z"), 0L);
        d.setting(s);
        d.budgetMnt(budget);
        return new Candidate(d, c, s, budget);
    }

    @Test
    @DisplayName("AC-98 «гэртээ, ≤ 50 000₮» шүүлтээр 100 удаа — зөвхөн тохирох санаа, бүгд сонгогдох боломжтой")
    void onlyMatchingIdeas() {
        List<Candidate> all = List.of(
                idea("Кино үдэш", IdeaCategory.HOME, IdeaSetting.HOME, 20_000L),
                idea("Хамтдаа хоол", IdeaCategory.FOOD, IdeaSetting.HOME, 50_000L),
                idea("Үнэгүй тоглоом", IdeaCategory.HOME, IdeaSetting.HOME, null),
                idea("Ресторан", IdeaCategory.FOOD, IdeaSetting.OUTDOOR, 30_000L),
                idea("Гэрийн спа", IdeaCategory.HOME, IdeaSetting.HOME, 80_000L),
                idea("Тодорхойгүй газар", IdeaCategory.OTHER, null, 0L));
        Criteria f = new Criteria(null, IdeaSetting.HOME, 50_000L);
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 100; i++) {
            RandomIdeaPicker.Pick p = picker.pick(all, f).orElseThrow();
            DateIdea d = (DateIdea) p.idea();
            assertThat(d.getSetting()).isEqualTo(IdeaSetting.HOME);
            assertThat(d.getBudgetMnt() == null || d.getBudgetMnt() <= 50_000L).isTrue();
            assertThat(p.candidates()).isEqualTo(3);
            seen.add(d.getTitle());
        }
        assertThat(seen).containsExactlyInAnyOrder("Кино үдэш", "Хамтдаа хоол", "Үнэгүй тоглоом");
    }

    @Test
    @DisplayName("AC-98 тохирох санаагүй шүүлт → хоосон (API 204, «Шүүлтэд тохирох санаа алга»)")
    void noMatch() {
        List<Candidate> all = List.of(idea("Ресторан", IdeaCategory.FOOD, IdeaSetting.OUTDOOR, 300_000L));
        assertThat(picker.pick(all, new Criteria(IdeaCategory.SPORT, null, null))).isEmpty();
        assertThat(picker.pick(all, new Criteria(null, IdeaSetting.OUTDOOR, 50_000L))).isEmpty();
        assertThat(picker.pick(List.of(), new Criteria(null, null, null))).isEmpty();
    }

    @Test
    @DisplayName("AC-98 сангийн санаа: зурвасын дээд хязгаараар төсөв шүүгдэнэ (OVER_150K хэзээ ч ≤ шүүлтэд орохгүй)")
    void libraryBudgetBands() {
        IdeaLibraryService library = new IdeaLibraryService(new ObjectMapper());
        List<Candidate> all = new ArrayList<>();
        for (IdeaLibraryService.Item i : library.items()) {
            all.add(new Candidate(library.toDto(i, "mn"), i.category(), i.setting(), IdeaLibraryService.upperBound(i.band())));
        }
        Criteria f = new Criteria(null, IdeaSetting.HOME, 50_000L);
        for (int n = 0; n < 100; n++) {
            LibraryIdea l = (LibraryIdea) picker.pick(all, f).orElseThrow().idea();
            assertThat(l.getSetting()).isEqualTo(IdeaSetting.HOME);
            assertThat(l.getBudgetBand().getValue()).isIn("FREE", "UPTO_50K");
        }
    }
}
