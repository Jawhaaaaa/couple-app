package mn.aura.couple.lists.api;

import java.util.List;
import java.util.UUID;
import mn.aura.couple.api.GoalsApi;
import mn.aura.couple.api.model.ContributionInput;
import mn.aura.couple.api.model.Goal;
import mn.aura.couple.api.model.GoalInput;
import mn.aura.couple.api.model.GoalStepInput;
import mn.aura.couple.api.model.GoalSummary;
import mn.aura.couple.api.model.GoalUpdate;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.lists.app.GoalService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Goals` tag (T-59, FR-9.3, 9.4, AC-42, AC-108). */
@RestController
public class GoalsController implements GoalsApi {

    private final SpaceAccessGuard guard;
    private final GoalService goals;

    public GoalsController(SpaceAccessGuard guard, GoalService goals) {
        this.guard = guard;
        this.goals = goals;
    }

    @Override
    public ResponseEntity<List<GoalSummary>> listGoals() {
        return ResponseEntity.ok(goals.list(guard.current()));
    }

    @Override
    public ResponseEntity<Goal> createGoal(GoalInput body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(goals.create(guard.requireWritable(), body));
    }

    @Override
    public ResponseEntity<Goal> getGoal(UUID goalId) {
        return ResponseEntity.ok(goals.get(guard.current(), goalId));
    }

    @Override
    public ResponseEntity<Goal> updateGoal(UUID goalId, GoalUpdate body) {
        return ResponseEntity.ok(goals.update(guard.requireWritable(), goalId, body));
    }

    @Override
    public ResponseEntity<Void> deleteGoal(UUID goalId) {
        goals.delete(guard.requireWritable(), goalId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Goal> addGoalStep(UUID goalId, GoalStepInput body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(goals.addStep(guard.requireWritable(), goalId, body));
    }

    @Override
    public ResponseEntity<Goal> updateGoalStep(UUID stepId, GoalStepInput body) {
        return ResponseEntity.ok(goals.updateStep(guard.requireWritable(), stepId, body));
    }

    @Override
    public ResponseEntity<Void> deleteGoalStep(UUID stepId) {
        goals.deleteStep(guard.requireWritable(), stepId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Goal> addContribution(UUID goalId, ContributionInput body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(goals.contribute(guard.requireWritable(), goalId,
                body.getAmountMnt()));
    }

    @Override
    public ResponseEntity<Void> deleteContribution(UUID contributionId) {
        goals.deleteContribution(guard.requireWritable(), contributionId);
        return ResponseEntity.noContent().build();
    }
}
