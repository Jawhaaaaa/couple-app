package mn.aura.couple.lists.app;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.api.model.Contribution;
import mn.aura.couple.api.model.Goal;
import mn.aura.couple.api.model.GoalInput;
import mn.aura.couple.api.model.GoalStep;
import mn.aura.couple.api.model.GoalStepInput;
import mn.aura.couple.api.model.GoalSummary;
import mn.aura.couple.api.model.GoalTotalsInner;
import mn.aura.couple.api.model.GoalUpdate;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.CoupleMembers;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Хамтын зорилго (FR-9.3, 9.4, AC-42, AC-108).
 * <ul>
 *   <li>Мөнгөн зорилго (`targetAmountMnt`): явц = Σ хандив / зорилт (100%-иар хязгаарлана)</li>
 *   <li>Мөнгөгүй: явц = дууссан алхам / нийт алхам</li>
 *   <li>«Хэн хэд» — гишүүн бүрийн хандивын нийлбэр (`totals`); хандивыг оруулсан хүн л устгана (403)</li>
 *   <li>Явц 100% хүрэхэд `completedAt` тавигдана (буурвал арилна)</li>
 *   <li>Өөрчлөлт бүр `goal.updated`-аар хоёр талд бодит цагаар (ANIM-20)</li>
 * </ul>
 */
@Service
public class GoalService {

    static final int MAX_STEPS = 50;

    private final NamedParameterJdbcTemplate jdbc;
    private final CoupleMembers couples;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;

    public GoalService(NamedParameterJdbcTemplate jdbc, CoupleMembers couples, ApplicationEventPublisher events,
                       TimeProvider time) {
        this.jdbc = jdbc;
        this.couples = couples;
        this.events = events;
        this.time = time;
    }

    /** Явц (AC-108): мөнгөн бол хандив/зорилт, үгүй бол алхам; 0–100, 1 оронтой. */
    public static BigDecimal progress(Long targetAmount, long contributed, int stepsDone, int stepsTotal) {
        double pct;
        if (targetAmount != null && targetAmount > 0) {
            pct = contributed * 100.0 / targetAmount;
        } else if (stepsTotal > 0) {
            pct = stepsDone * 100.0 / stepsTotal;
        } else {
            pct = 0;
        }
        return BigDecimal.valueOf(Math.min(100.0, Math.max(0.0, pct))).setScale(1, RoundingMode.HALF_UP);
    }

    @Transactional(readOnly = true)
    public List<GoalSummary> list(SpaceContext ctx) {
        List<UUID> ids = jdbc.queryForList("SELECT id FROM goal WHERE space_id = :s ORDER BY completed_at NULLS FIRST, created_at, id",
                new MapSqlParameterSource("s", ctx.spaceId()), UUID.class);
        List<GoalSummary> out = new ArrayList<>();
        for (UUID id : ids) {
            Goal g = load(id);
            GoalSummary s = new GoalSummary(g.getId(), g.getTitle(), g.getStepsDone(), g.getSteps().size(), g.getProgressPercent());
            s.targetDate(g.getTargetDate());
            s.targetAmountMnt(g.getTargetAmountMnt());
            s.completedAt(g.getCompletedAt());
            out.add(s);
        }
        return out;
    }

    @Transactional(readOnly = true)
    public Goal get(SpaceContext ctx, UUID goalId) {
        requireGoal(ctx, goalId, false);
        return load(goalId);
    }

    @Transactional
    public Goal create(SpaceContext ctx, GoalInput in) {
        List<String> steps = in.getSteps() == null ? List.of() : in.getSteps();
        if (steps.size() > MAX_STEPS) {
            throw ApiException.validation("steps", ErrorCode.VALIDATION_FAILED);
        }
        UUID id = Ids.newId();
        Timestamp now = Timestamp.from(time.now());
        jdbc.update("""
                INSERT INTO goal (id, space_id, title, target_date, target_amount_mnt, created_by, updated_by, created_at, updated_at)
                VALUES (:id, :s, :title, :date, :amount, :u, :u, :now, :now)
                """, new MapSqlParameterSource("id", id).addValue("s", ctx.spaceId()).addValue("title", in.getTitle().strip())
                .addValue("date", in.getTargetDate() == null ? null : Date.valueOf(in.getTargetDate()))
                .addValue("amount", in.getTargetAmountMnt()).addValue("u", ctx.userId()).addValue("now", now));
        int pos = 0;
        for (String title : steps) {
            insertStep(id, title, pos++);
        }
        return changed(ctx, id);
    }

    @Transactional
    public Goal update(SpaceContext ctx, UUID goalId, GoalUpdate in) {
        Map<String, Object> row = requireGoal(ctx, goalId, true);
        long version = ((Number) row.get("version")).longValue();
        if (in.getVersion() == null || in.getVersion() != version) {
            Goal current = load(goalId);
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("current", current);
            details.put("currentVersion", current.getVersion());
            details.put("updatedBy", row.get("updated_by") == null ? row.get("created_by") : row.get("updated_by"));
            throw new ApiException(ErrorCode.VERSION_CONFLICT, HttpStatus.CONFLICT, details);
        }
        List<String> sets = new ArrayList<>();
        MapSqlParameterSource p = new MapSqlParameterSource("id", goalId).addValue("u", ctx.userId())
                .addValue("now", Timestamp.from(time.now()));
        if (in.getTitle() != null) {
            sets.add("title = :title");
            p.addValue("title", in.getTitle().strip());
        }
        if (in.getTargetDate() != null) {
            sets.add("target_date = :date");
            p.addValue("date", Date.valueOf(in.getTargetDate()));
        }
        if (in.getTargetAmountMnt() != null) {
            if (in.getTargetAmountMnt() <= 0) {
                throw ApiException.validation("targetAmountMnt", ErrorCode.VALIDATION_FAILED);
            }
            sets.add("target_amount_mnt = :amount");
            p.addValue("amount", in.getTargetAmountMnt());
        }
        if (!sets.isEmpty()) {
            sets.add("updated_by = :u, updated_at = :now, version = version + 1");
            jdbc.update("UPDATE goal SET " + String.join(", ", sets) + " WHERE id = :id", p);
        }
        return changed(ctx, goalId);
    }

    @Transactional
    public void delete(SpaceContext ctx, UUID goalId) {
        requireGoal(ctx, goalId, true);
        jdbc.update("DELETE FROM goal WHERE id = :id", new MapSqlParameterSource("id", goalId));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", goalId);
        payload.put("removed", true);
        events.publishEvent(RealtimeEvent.of("goal.updated", ctx.userId(), couples.members(ctx.spaceId()), payload));
    }

    @Transactional
    public Goal addStep(SpaceContext ctx, UUID goalId, GoalStepInput in) {
        requireGoal(ctx, goalId, true);
        if (in.getTitle() == null || in.getTitle().isBlank()) {
            throw ApiException.validation("title", ErrorCode.VALIDATION_FAILED);
        }
        Integer count = jdbc.queryForObject("SELECT count(*) FROM goal_step WHERE goal_id = :g",
                new MapSqlParameterSource("g", goalId), Integer.class);
        if (count != null && count >= MAX_STEPS) {
            throw ApiException.validation("title", ErrorCode.VALIDATION_FAILED);
        }
        UUID stepId = insertStep(goalId, in.getTitle(), count == null ? 0 : count);
        if (Boolean.TRUE.equals(in.getDone())) {
            markStep(stepId, ctx.userId(), true);
        }
        return changed(ctx, goalId);
    }

    @Transactional
    public Goal updateStep(SpaceContext ctx, UUID stepId, GoalStepInput in) {
        UUID goalId = requireStep(ctx, stepId);
        MapSqlParameterSource p = new MapSqlParameterSource("id", stepId);
        if (in.getTitle() != null) {
            if (in.getTitle().isBlank()) {
                throw ApiException.validation("title", ErrorCode.VALIDATION_FAILED);
            }
            jdbc.update("UPDATE goal_step SET title = :title WHERE id = :id", p.addValue("title", in.getTitle().strip()));
        }
        if (in.getDone() != null) {
            markStep(stepId, ctx.userId(), in.getDone());
        }
        return changed(ctx, goalId);
    }

    @Transactional
    public void deleteStep(SpaceContext ctx, UUID stepId) {
        UUID goalId = requireStep(ctx, stepId);
        jdbc.update("DELETE FROM goal_step WHERE id = :id", new MapSqlParameterSource("id", stepId));
        changed(ctx, goalId);
    }

    @Transactional
    public Goal contribute(SpaceContext ctx, UUID goalId, Long amount) {
        requireGoal(ctx, goalId, true);
        if (amount == null || amount <= 0) {
            throw ApiException.validation("amountMnt", ErrorCode.VALIDATION_FAILED);
        }
        jdbc.update("""
                INSERT INTO goal_contribution (id, goal_id, user_id, amount_mnt, created_at) VALUES (:id, :g, :u, :amount, :now)
                """, new MapSqlParameterSource("id", Ids.newId()).addValue("g", goalId).addValue("u", ctx.userId())
                .addValue("amount", amount).addValue("now", Timestamp.from(time.now())));
        return changed(ctx, goalId);
    }

    @Transactional
    public void deleteContribution(SpaceContext ctx, UUID contributionId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT c.goal_id, c.user_id FROM goal_contribution c JOIN goal g ON g.id = c.goal_id
                 WHERE c.id = :id AND g.space_id = :s FOR UPDATE OF c
                """, new MapSqlParameterSource("id", contributionId).addValue("s", ctx.spaceId()));
        if (rows.isEmpty()) {
            throw ApiException.notFound();
        }
        if (!ctx.userId().equals(rows.get(0).get("user_id"))) {
            throw new ApiException(ErrorCode.NOT_OWNER, HttpStatus.FORBIDDEN);
        }
        jdbc.update("DELETE FROM goal_contribution WHERE id = :id", new MapSqlParameterSource("id", contributionId));
        changed(ctx, (UUID) rows.get(0).get("goal_id"));
    }

    // --- Дотоод ---

    /** Явцыг дахин тооцож `completed_at`-ийг шинэчлээд хоёр талд `goal.updated`. */
    private Goal changed(SpaceContext ctx, UUID goalId) {
        Goal g = load(goalId);
        boolean complete = g.getProgressPercent().compareTo(BigDecimal.valueOf(100)) >= 0;
        if (complete != (g.getCompletedAt() != null)) {
            jdbc.update("UPDATE goal SET completed_at = :at WHERE id = :id", new MapSqlParameterSource("id", goalId)
                    .addValue("at", complete ? Timestamp.from(time.now()) : null));
            g = load(goalId);
        }
        events.publishEvent(RealtimeEvent.of("goal.updated", ctx.userId(), couples.members(ctx.spaceId()), g));
        return g;
    }

    private Goal load(UUID goalId) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM goal WHERE id = :id",
                new MapSqlParameterSource("id", goalId));
        if (rows.isEmpty()) {
            throw ApiException.notFound();
        }
        Map<String, Object> r = rows.get(0);
        MapSqlParameterSource p = new MapSqlParameterSource("g", goalId);
        List<GoalStep> steps = jdbc.query("SELECT * FROM goal_step WHERE goal_id = :g ORDER BY position, created_at, id", p,
                (rs, i) -> {
                    Timestamp doneAt = rs.getTimestamp("done_at");
                    GoalStep s = new GoalStep(rs.getObject("id", UUID.class), rs.getString("title"), rs.getInt("position"),
                            doneAt != null);
                    s.doneBy(rs.getObject("done_by", UUID.class));
                    s.doneAt(utc(doneAt == null ? null : doneAt.toInstant()));
                    return s;
                });
        List<Contribution> contributions = jdbc.query(
                "SELECT * FROM goal_contribution WHERE goal_id = :g ORDER BY created_at, id", p,
                (rs, i) -> new Contribution(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                        rs.getLong("amount_mnt"), utc(rs.getTimestamp("created_at").toInstant())));
        Map<UUID, Long> byUser = new LinkedHashMap<>();
        UUID spaceId = (UUID) r.get("space_id");
        for (UUID m : couples.members(spaceId)) {
            byUser.put(m, 0L);
        }
        long total = 0;
        for (Contribution c : contributions) {
            byUser.merge(c.getUserId(), c.getAmountMnt(), Long::sum);
            total += c.getAmountMnt();
        }
        List<GoalTotalsInner> totals = new ArrayList<>();
        byUser.forEach((u, a) -> totals.add(new GoalTotalsInner(u, a)));
        int done = (int) steps.stream().filter(GoalStep::getDone).count();
        Long target = r.get("target_amount_mnt") == null ? null : ((Number) r.get("target_amount_mnt")).longValue();
        Goal g = new Goal(goalId, (String) r.get("title"), (UUID) r.get("created_by"), steps, done, contributions, totals,
                progress(target, total, done, steps.size()), ((Number) r.get("version")).longValue());
        g.targetDate(r.get("target_date") == null ? null : ((Date) r.get("target_date")).toLocalDate());
        g.targetAmountMnt(target);
        g.completedAt(r.get("completed_at") == null ? null : utc(((Timestamp) r.get("completed_at")).toInstant()));
        return g;
    }

    private Map<String, Object> requireGoal(SpaceContext ctx, UUID goalId, boolean lock) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, version, created_by, updated_by FROM goal WHERE id = :id AND space_id = :s" + (lock ? " FOR UPDATE" : ""),
                new MapSqlParameterSource("id", goalId).addValue("s", ctx.spaceId()));
        if (rows.isEmpty()) {
            throw ApiException.notFound();
        }
        return rows.get(0);
    }

    private UUID requireStep(SpaceContext ctx, UUID stepId) {
        List<UUID> goal = jdbc.queryForList("""
                SELECT s.goal_id FROM goal_step s JOIN goal g ON g.id = s.goal_id WHERE s.id = :id AND g.space_id = :sp
                """, new MapSqlParameterSource("id", stepId).addValue("sp", ctx.spaceId()), UUID.class);
        if (goal.isEmpty()) {
            throw ApiException.notFound();
        }
        requireGoal(ctx, goal.get(0), true);
        return goal.get(0);
    }

    private UUID insertStep(UUID goalId, String title, int position) {
        String clean = title == null ? "" : title.strip();
        if (clean.isEmpty() || clean.length() > 120) {
            throw ApiException.validation("steps", ErrorCode.VALIDATION_FAILED);
        }
        UUID id = Ids.newId();
        jdbc.update("INSERT INTO goal_step (id, goal_id, title, position, created_at) VALUES (:id, :g, :t, :p, :now)",
                new MapSqlParameterSource("id", id).addValue("g", goalId).addValue("t", clean).addValue("p", position)
                        .addValue("now", Timestamp.from(time.now())));
        return id;
    }

    private void markStep(UUID stepId, UUID userId, boolean done) {
        jdbc.update(done
                        ? "UPDATE goal_step SET done_by = :u, done_at = :now WHERE id = :id AND done_at IS NULL"
                        : "UPDATE goal_step SET done_by = NULL, done_at = NULL WHERE id = :id",
                new MapSqlParameterSource("id", stepId).addValue("u", userId).addValue("now", Timestamp.from(time.now())));
    }

    private static OffsetDateTime utc(Instant i) {
        return i == null ? null : OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }
}
