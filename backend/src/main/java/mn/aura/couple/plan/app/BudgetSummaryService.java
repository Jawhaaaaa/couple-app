package mn.aura.couple.plan.app;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.api.model.BudgetLine;
import mn.aura.couple.api.model.BudgetSummary;
import mn.aura.couple.api.model.BudgetSummarySharesInner;
import mn.aura.couple.api.model.Expense;
import mn.aura.couple.api.model.ExpenseInput;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.CoupleMembers;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Болзооны төсөв (FR-7.7, AC-97): төлөвлөсөн ба бодит зардал, хэн хэд төлсөн, хувь, сарын нийт.
 * <ul>
 *   <li>Болзоо бүр: `overBy = max(0, бодит − төлөвлөсөн)` (төлөвлөөгүй бол 0)</li>
 *   <li>Сарын нийт бодит = тухайн сард (`spentOn`) гарсан бүх зардлын нийлбэр</li>
 *   <li>Хувь: төлөгч бүрийн дүн / нийт × 100, бүхэл тоогоор — нийлбэр нь яг 100 (их үлдэгдлийн арга)</li>
 * </ul>
 * Зардлыг нэмсэн хүн л устгана (403 `NOT_OWNER`).
 */
@Service
public class BudgetSummaryService {

    /** Нэг зардал (цэвэр тооцоололд). */
    public record Spend(UUID planId, UUID payerId, long amount) {
    }

    /** Нэг болзооны мөр (цэвэр тооцоололд). */
    public record PlanBudget(UUID planId, String title, Instant startsAt, Long planned) {
    }

    private final NamedParameterJdbcTemplate jdbc;
    private final CoupleMembers couples;
    private final DatePlanService plans;
    private final TimeProvider time;

    public BudgetSummaryService(NamedParameterJdbcTemplate jdbc, CoupleMembers couples, DatePlanService plans,
                                TimeProvider time) {
        this.jdbc = jdbc;
        this.couples = couples;
        this.plans = plans;
        this.time = time;
    }

    // --- Цэвэр тооцоолол (UT) ---

    public static BudgetLine line(PlanBudget plan, long actual) {
        BudgetLine l = new BudgetLine(plan.planId(), plan.title(), plan.planned(), actual,
                plan.planned() == null ? 0L : Math.max(0, actual - plan.planned()));
        l.startsAt(plan.startsAt() == null ? null : OffsetDateTime.ofInstant(plan.startsAt(), ZoneOffset.UTC));
        return l;
    }

    /** Сарын нэгтгэл: болзоо тус бүрийн мөр, төлөгчийн хувь (бүхэл, нийлбэр 100). */
    public static BudgetSummary summarize(YearMonth month, List<PlanBudget> planList, List<Spend> spends,
                                          List<UUID> members) {
        Map<UUID, Long> byPlan = new LinkedHashMap<>();
        Map<UUID, Long> byPayer = new LinkedHashMap<>();
        for (UUID m : members) {
            byPayer.put(m, 0L);
        }
        long actualTotal = 0;
        for (Spend s : spends) {
            byPlan.merge(s.planId(), s.amount(), Long::sum);
            byPayer.merge(s.payerId(), s.amount(), Long::sum);
            actualTotal += s.amount();
        }
        List<BudgetLine> lines = new ArrayList<>();
        long plannedTotal = 0;
        long overBy = 0;
        for (PlanBudget p : planList) {
            BudgetLine l = line(p, byPlan.getOrDefault(p.planId(), 0L));
            lines.add(l);
            plannedTotal += p.planned() == null ? 0 : p.planned();
            overBy += l.getOverBy();
        }
        List<UUID> payers = new ArrayList<>(byPayer.keySet());
        int[] percents = percents(payers.stream().mapToLong(byPayer::get).toArray());
        List<BudgetSummarySharesInner> shares = new ArrayList<>();
        for (int i = 0; i < payers.size(); i++) {
            shares.add(new BudgetSummarySharesInner(payers.get(i), byPayer.get(payers.get(i)), BigDecimal.valueOf(percents[i])));
        }
        return new BudgetSummary(month.toString(), plannedTotal, actualTotal, overBy, shares, lines);
    }

    /** Бүхэл хувь (их үлдэгдлийн арга): нийлбэр нь 100, бүгд 0 бол бүгд 0. */
    static int[] percents(long[] amounts) {
        long total = 0;
        for (long a : amounts) {
            total += a;
        }
        int[] out = new int[amounts.length];
        if (total == 0) {
            return out;
        }
        double[] rest = new double[amounts.length];
        int sum = 0;
        for (int i = 0; i < amounts.length; i++) {
            double exact = amounts[i] * 100.0 / total;
            out[i] = (int) Math.floor(exact);
            rest[i] = exact - out[i];
            sum += out[i];
        }
        while (sum < 100) {
            int best = 0;
            for (int i = 1; i < rest.length; i++) {
                if (rest[i] > rest[best]) {
                    best = i;
                }
            }
            out[best]++;
            rest[best] = -1;
            sum++;
        }
        return out;
    }

    // --- API ---

    @Transactional(readOnly = true)
    public BudgetSummary summary(SpaceContext ctx, String month) {
        YearMonth ym;
        try {
            ym = YearMonth.parse(month);
        } catch (DateTimeParseException | NullPointerException e) {
            throw ApiException.validation("month", ErrorCode.VALIDATION_FAILED);
        }
        MapSqlParameterSource p = new MapSqlParameterSource("s", ctx.spaceId())
                .addValue("from", Date.valueOf(ym.atDay(1))).addValue("to", Date.valueOf(ym.atEndOfMonth()));
        List<Spend> spends = jdbc.query("""
                SELECT plan_id, payer_id, amount_mnt FROM expense
                 WHERE space_id = :s AND spent_on BETWEEN :from AND :to ORDER BY spent_on, created_at
                """, p, (rs, i) -> new Spend(rs.getObject("plan_id", UUID.class), rs.getObject("payer_id", UUID.class),
                rs.getLong("amount_mnt")));
        // Тухайн сард болох (болзооны бүсээр) эсвэл тухайн сард зардалтай болзоо
        List<PlanBudget> planList = jdbc.query("""
                SELECT p.id, p.title, p.starts_at, p.planned_budget_mnt FROM date_plan p
                 WHERE p.space_id = :s AND p.series_id IS NULL AND p.status NOT IN ('DECLINED', 'CANCELLED')
                   AND ((p.starts_at AT TIME ZONE p.timezone)::date BETWEEN :from AND :to
                        OR EXISTS (SELECT 1 FROM expense e WHERE e.plan_id = p.id AND e.spent_on BETWEEN :from AND :to))
                 ORDER BY p.starts_at, p.id
                """, p, (rs, i) -> {
            Object planned = rs.getObject("planned_budget_mnt");
            return new PlanBudget(rs.getObject("id", UUID.class), rs.getString("title"),
                    rs.getTimestamp("starts_at").toInstant(), planned == null ? null : ((Number) planned).longValue());
        });
        return summarize(ym, planList, spends, couples.members(ctx.spaceId()));
    }

    @Transactional
    public Expense add(SpaceContext ctx, UUID planId, ExpenseInput in) {
        List<UUID> series = jdbc.queryForList("""
                SELECT coalesce(series_id, id) FROM date_plan WHERE id = :id AND space_id = :s
                """, new MapSqlParameterSource("id", planId).addValue("s", ctx.spaceId()), UUID.class);
        if (series.isEmpty()) {
            throw ApiException.notFound();
        }
        if (in.getAmountMnt() == null || in.getAmountMnt() <= 0) {
            throw ApiException.validation("amountMnt", ErrorCode.VALIDATION_FAILED);
        }
        if (in.getPayerId() == null || !couples.members(ctx.spaceId()).contains(in.getPayerId())) {
            throw ApiException.validation("payerId", ErrorCode.VALIDATION_FAILED);
        }
        LocalDate spentOn = in.getSpentOn();
        if (spentOn == null) {
            throw ApiException.validation("spentOn", ErrorCode.VALIDATION_FAILED);
        }
        UUID id = Ids.newId();
        String note = in.getNote() == null || in.getNote().isBlank() ? null : in.getNote().strip();
        jdbc.update("""
                INSERT INTO expense (id, plan_id, space_id, payer_id, created_by, amount_mnt, note, spent_on, created_at)
                VALUES (:id, :p, :s, :payer, :u, :amount, :note, :on, :now)
                """, new MapSqlParameterSource("id", id).addValue("p", series.get(0)).addValue("s", ctx.spaceId())
                .addValue("payer", in.getPayerId()).addValue("u", ctx.userId()).addValue("amount", in.getAmountMnt())
                .addValue("note", note).addValue("on", Date.valueOf(spentOn)).addValue("now", Timestamp.from(time.now())));
        plans.touched(ctx, series.get(0));
        Expense e = new Expense(id, series.get(0), in.getAmountMnt(), in.getPayerId(), spentOn);
        e.note(note);
        return e;
    }

    @Transactional
    public void delete(SpaceContext ctx, UUID expenseId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT plan_id, created_by FROM expense WHERE id = :id AND space_id = :s FOR UPDATE",
                new MapSqlParameterSource("id", expenseId).addValue("s", ctx.spaceId()));
        if (rows.isEmpty()) {
            throw ApiException.notFound();
        }
        if (!ctx.userId().equals(rows.get(0).get("created_by"))) {
            throw new ApiException(ErrorCode.NOT_OWNER, HttpStatus.FORBIDDEN);
        }
        jdbc.update("DELETE FROM expense WHERE id = :id", new MapSqlParameterSource("id", expenseId));
        plans.touched(ctx, (UUID) rows.get(0).get("plan_id"));
    }
}
