package mn.aura.couple.plan.api;

import java.util.UUID;
import mn.aura.couple.api.BudgetApi;
import mn.aura.couple.api.model.BudgetSummary;
import mn.aura.couple.api.model.Expense;
import mn.aura.couple.api.model.ExpenseInput;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.plan.app.BudgetSummaryService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Budget` tag (T-52, FR-7.7, AC-97). */
@RestController
public class BudgetController implements BudgetApi {

    private final SpaceAccessGuard guard;
    private final BudgetSummaryService budget;

    public BudgetController(SpaceAccessGuard guard, BudgetSummaryService budget) {
        this.guard = guard;
        this.budget = budget;
    }

    @Override
    public ResponseEntity<Expense> addExpense(UUID planId, ExpenseInput body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(budget.add(guard.requireWritable(), planId, body));
    }

    @Override
    public ResponseEntity<Void> deleteExpense(UUID expenseId) {
        budget.delete(guard.requireWritable(), expenseId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<BudgetSummary> getBudgetSummary(String month) {
        return ResponseEntity.ok(budget.summary(guard.current(), month));
    }
}
