package mn.aura.couple.plan.api;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.api.PlansApi;
import mn.aura.couple.api.model.ChecklistInput;
import mn.aura.couple.api.model.ChecklistItem;
import mn.aura.couple.api.model.ChecklistUpdate;
import mn.aura.couple.api.model.ChooseOption;
import mn.aura.couple.api.model.DatePlan;
import mn.aura.couple.api.model.DatePlanCreate;
import mn.aura.couple.api.model.DatePlanSummary;
import mn.aura.couple.api.model.DatePlanUpdate;
import mn.aura.couple.api.model.LinkMemory;
import mn.aura.couple.api.model.PlanResponse;
import mn.aura.couple.api.model.PlanStatus;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.plan.app.DatePlanService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Plans` tag (T-51, T-52, FR-7.2…7.6, 7.10, 7.13). Унших нь `current`, бичих нь `requireWritable` (423). */
@RestController
public class PlansController implements PlansApi {

    private final SpaceAccessGuard guard;
    private final DatePlanService plans;

    public PlansController(SpaceAccessGuard guard, DatePlanService plans) {
        this.guard = guard;
        this.plans = plans;
    }

    @Override
    public ResponseEntity<List<DatePlanSummary>> listPlans(OffsetDateTime from, OffsetDateTime to, PlanStatus status,
                                                           String view) {
        return ResponseEntity.ok(plans.list(guard.current(), from, to, status, view));
    }

    @Override
    public ResponseEntity<DatePlan> createPlan(DatePlanCreate body) {
        DatePlanService.Created c = plans.create(guard.requireWritable(), body);
        return ResponseEntity.status(c.created() ? HttpStatus.CREATED : HttpStatus.OK).body(c.plan());
    }

    @Override
    public ResponseEntity<DatePlan> getPlan(UUID planId, LocalDate occurrenceOn) {
        return ResponseEntity.ok(plans.get(guard.current(), planId, occurrenceOn));
    }

    @Override
    public ResponseEntity<DatePlan> updatePlan(UUID planId, DatePlanUpdate body) {
        return ResponseEntity.ok(plans.update(guard.requireWritable(), planId, body));
    }

    @Override
    public ResponseEntity<Void> cancelPlan(UUID planId, String scope, LocalDate occurrenceOn) {
        plans.cancel(guard.requireWritable(), planId, scope, occurrenceOn);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<DatePlan> respondToPlan(UUID planId, PlanResponse body) {
        return ResponseEntity.ok(plans.respond(guard.requireWritable(), planId, body));
    }

    @Override
    public ResponseEntity<DatePlan> chooseCounterOption(UUID planId, ChooseOption body) {
        return ResponseEntity.ok(plans.chooseOption(guard.requireWritable(), planId, body.getOptionId()));
    }

    @Override
    public ResponseEntity<ChecklistItem> addChecklistItem(UUID planId, ChecklistInput body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(plans.addChecklist(guard.requireWritable(), planId,
                body.getText()));
    }

    @Override
    public ResponseEntity<ChecklistItem> updateChecklistItem(UUID itemId, ChecklistUpdate body) {
        return ResponseEntity.ok(plans.updateChecklist(guard.requireWritable(), itemId, body));
    }

    @Override
    public ResponseEntity<Void> deleteChecklistItem(UUID itemId) {
        plans.deleteChecklist(guard.requireWritable(), itemId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<DatePlan> linkPlanMemory(UUID planId, LinkMemory body) {
        return ResponseEntity.ok(plans.linkMemory(guard.requireWritable(), planId, body.getMemoryId()));
    }

    @Override
    public ResponseEntity<String> exportPlanIcs(UUID planId, LocalDate occurrenceOn) {
        String ics = plans.ics(guard.current(), planId, occurrenceOn);
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "calendar", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename("aura-date.ics").build().toString())
                .body(ics);
    }
}
