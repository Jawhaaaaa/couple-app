package mn.aura.couple.plan;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.api.model.BudgetSummary;
import mn.aura.couple.plan.app.BudgetSummaryService;
import mn.aura.couple.plan.app.BudgetSummaryService.PlanBudget;
import mn.aura.couple.plan.app.BudgetSummaryService.Spend;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class BudgetSummaryServiceTest {

    private static final UUID A = UUID.fromString("00000000-0000-7000-8000-00000000000a");
    private static final UUID B = UUID.fromString("00000000-0000-7000-8000-00000000000b");

    @Test
    @DisplayName("AC-97 төлөвлөсөн 200 000, бодит 230 000 (A 150 000, B 80 000) → 30 000 хэтэрсэн, A 65% · B 35%")
    void overBudgetShares() {
        UUID plan = UUID.randomUUID();
        BudgetSummary s = BudgetSummaryService.summarize(YearMonth.of(2026, 11),
                List.of(new PlanBudget(plan, "Тэрэлж", Instant.parse("2026-11-14T02:00:00Z"), 200_000L)),
                List.of(new Spend(plan, A, 100_000), new Spend(plan, B, 80_000), new Spend(plan, A, 50_000)), List.of(A, B));
        assertThat(s.getMonth()).isEqualTo("2026-11");
        assertThat(s.getPlannedTotal()).isEqualTo(200_000L);
        assertThat(s.getActualTotal()).isEqualTo(230_000L);
        assertThat(s.getOverBy()).isEqualTo(30_000L);
        assertThat(s.getPlans()).singleElement().satisfies(l -> {
            assertThat(l.getActualMnt()).isEqualTo(230_000L);
            assertThat(l.getOverBy()).isEqualTo(30_000L);
        });
        assertThat(s.getShares()).hasSize(2);
        assertThat(s.getShares().get(0).getUserId()).isEqualTo(A);
        assertThat(s.getShares().get(0).getAmount()).isEqualTo(150_000L);
        assertThat(s.getShares().get(0).getPercent().intValue()).isEqualTo(65);
        assertThat(s.getShares().get(1).getAmount()).isEqualTo(80_000L);
        assertThat(s.getShares().get(1).getPercent().intValue()).isEqualTo(35);
    }

    @Test
    @DisplayName("AC-97 сарын нийт = тухайн сарын бодит зардлын нийлбэр; төсөвгүй болзоо хэтрэлтгүй; хувь нийлбэр 100")
    void monthTotals() {
        UUID p1 = UUID.randomUUID();
        UUID p2 = UUID.randomUUID();
        BudgetSummary s = BudgetSummaryService.summarize(YearMonth.of(2026, 11),
                List.of(new PlanBudget(p1, "Кино", null, 50_000L), new PlanBudget(p2, "Алхалт", null, null)),
                List.of(new Spend(p1, A, 10_000), new Spend(p1, B, 10_000), new Spend(p2, B, 10_000)), List.of(A, B));
        assertThat(s.getActualTotal()).isEqualTo(30_000L);
        assertThat(s.getPlannedTotal()).isEqualTo(50_000L);
        assertThat(s.getOverBy()).isZero();
        assertThat(s.getShares().stream().mapToInt(x -> x.getPercent().intValue()).sum()).isEqualTo(100);
        BudgetSummary empty = BudgetSummaryService.summarize(YearMonth.of(2026, 12), List.of(), List.of(), List.of(A, B));
        assertThat(empty.getShares()).allMatch(x -> x.getPercent().intValue() == 0 && x.getAmount() == 0);
    }
}
