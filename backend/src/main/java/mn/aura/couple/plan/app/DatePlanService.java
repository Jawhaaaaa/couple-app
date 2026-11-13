package mn.aura.couple.plan.app;

import java.math.BigDecimal;
import java.sql.Array;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.DateTimeException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.api.model.BudgetLine;
import mn.aura.couple.api.model.ChecklistItem;
import mn.aura.couple.api.model.ChecklistUpdate;
import mn.aura.couple.api.model.CounterOption;
import mn.aura.couple.api.model.DatePlan;
import mn.aura.couple.api.model.DatePlanAllOfChecklistProgress;
import mn.aura.couple.api.model.DatePlanCreate;
import mn.aura.couple.api.model.DatePlanSummary;
import mn.aura.couple.api.model.DatePlanUpdate;
import mn.aura.couple.api.model.Expense;
import mn.aura.couple.api.model.IdeaCategory;
import mn.aura.couple.api.model.NullablePlace;
import mn.aura.couple.api.model.PlanResponse;
import mn.aura.couple.api.model.PlanStatus;
import mn.aura.couple.api.model.Recurrence;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.event.Notify;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.CoupleMembers;
import mn.aura.couple.couple.app.UserRefs;
import mn.aura.couple.notification.app.ReminderRegistry;
import mn.aura.couple.notification.app.ReminderRegistry.Reminder;
import mn.aura.couple.notification.app.ReminderRegistry.SourceType;
import mn.aura.couple.weather.app.WeatherService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Болзоо (FR-7.2…7.7, 7.10, 7.12, 7.13).
 * <ul>
 *   <li>Санал (`PENDING`) → хамтрагч зөвшөөрөх (`CONFIRMED`) / татгалзах (`DECLINED`) / «Өөр цаг» 1–3 хувилбар
 *       (`COUNTER_PROPOSED`) → санал болгогч нэгийг сонгоход `CONFIRMED` (AC-33). Ганцаараа space-д шууд `CONFIRMED`</li>
 *   <li>Цаг UTC-ээр хадгалагдана, `timezone` нь харагдах бүс (AC-34)</li>
 *   <li>Батлагдсан болзооны сануулга `ReminderRegistry`-д: цаг, сануулга өөрчлөгдөхөд хуучныг цуцалж шинийг товлоно,
 *       цуцлахад бүгд цуцлагдана (AC-35, AC-180)</li>
 *   <li>Давталт (`DateRecurrence`, AC-37): нэг удаагийн өөрчлөлт/цуцлалт нь `series_id` + `occurrence_on`-той мөр;
 *       API-д давталт бүр цувааны `id` + `occurrenceOn`-оор хаяглагдана</li>
 *   <li>Checklist бодит цагаар (`checklist.updated`, хэн тэмдэглэсэн — AC-96); болзоо ↔ дурсамж холбоос (AC-95)</li>
 *   <li>Засварт `version` заавал — зөрвөл 409 `VERSION_CONFLICT` + одоогийн хувилбар (AC-131)</li>
 * </ul>
 */
@Service
public class DatePlanService {

    public enum View { UPCOMING, PAST, PENDING }

    /** `createPlan` — idempotent давтан ирэлт эсэх (201/200). */
    public record Created(DatePlan plan, boolean created) {
    }

    /** Сануулгыг хэдэн давталтад урьдчилж товлох. */
    static final int REMINDER_OCCURRENCES = 8;
    static final int MAX_CHECKLIST = 50;

    private static final String COLUMNS = """
            p.id, p.space_id, p.proposer_id, p.idea_id, p.title, p.description, p.category, p.starts_at, p.timezone,
            p.place_name, p.lat, p.lon, p.status, p.recurrence, p.recurrence_until, p.series_id, p.occurrence_on,
            p.planned_budget_mnt, p.reminder_offsets, p.memory_id, p.responder_id, p.updated_by, p.proposer_id AS created_by,
            p.version
            """;

    /** Нэг мөр (цуваа, энгийн болзоо эсвэл давталтын нэг удаагийн өөрчлөлт). */
    record Row(UUID id, UUID spaceId, UUID proposerId, UUID ideaId, String title, String description, String category,
               Instant startsAt, String timezone, String placeName, BigDecimal lat, BigDecimal lon, String status,
               DateRecurrence.Kind recurrence, LocalDate recurrenceUntil, UUID seriesId, LocalDate occurrenceOn,
               Long plannedBudget, List<Integer> reminderOffsets, UUID memoryId, UUID responderId, UUID updatedBy,
               long version) {

        ZoneId zone() {
            return zoneOf(timezone);
        }

        LocalDate firstDate() {
            return DateRecurrence.localDate(startsAt, zone());
        }

        boolean recurring() {
            return recurrence != DateRecurrence.Kind.NONE;
        }
    }

    /** Нэг давталт (эсвэл энгийн болзоо): харагдах мөр + цувааны мөр. */
    record Occurrence(Row series, Row shown, LocalDate on, Instant startsAt) {
    }

    private final NamedParameterJdbcTemplate jdbc;
    private final CoupleMembers couples;
    private final UserRefs users;
    private final ReminderRegistry reminders;
    private final WeatherService weather;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;

    public DatePlanService(NamedParameterJdbcTemplate jdbc, CoupleMembers couples, UserRefs users,
                           ReminderRegistry reminders, WeatherService weather, ApplicationEventPublisher events,
                           TimeProvider time) {
        this.jdbc = jdbc;
        this.couples = couples;
        this.users = users;
        this.reminders = reminders;
        this.weather = weather;
        this.events = events;
        this.time = time;
    }

    // --- Унших ---

    /**
     * Жагсаалт (AC-94). Давталтыг мужид задална. `view`: `upcoming` — одооноос хойш идэвхтэй (өсөхөөр),
     * `past` — өнгөрсөн батлагдсан (буурахаар), `pending` — хариу хүлээж буй. `from`/`to` нь календарийн муж.
     */
    @Transactional(readOnly = true)
    public List<DatePlanSummary> list(SpaceContext ctx, OffsetDateTime from, OffsetDateTime to, PlanStatus status,
                                      String view) {
        View v = parseView(view);
        Instant now = time.now();
        Instant lo = from != null ? from.toInstant()
                : v == View.UPCOMING ? now : now.minus(Duration.ofDays(v == View.PAST ? 3650 : 30));
        Instant hi = to != null ? to.toInstant()
                : v == View.PAST ? now : now.plus(Duration.ofDays(v == View.PENDING ? 3650 : 366));
        List<Row> series = query("WHERE p.space_id = :s AND p.series_id IS NULL ORDER BY p.starts_at, p.id",
                new MapSqlParameterSource("s", ctx.spaceId()));
        Map<UUID, Map<LocalDate, Row>> exceptions = exceptionsOf(ctx.spaceId());
        List<Occurrence> out = new ArrayList<>();
        for (Row r : series) {
            for (Occurrence o : expand(r, exceptions.getOrDefault(r.id(), Map.of()), lo, hi)) {
                String st = o.shown().status();
                if (status != null) {
                    if (!status.getValue().equals(st)) {
                        continue;
                    }
                } else if ("CANCELLED".equals(st) || "DECLINED".equals(st)) {
                    continue;
                }
                if (v == View.UPCOMING && (o.startsAt().isBefore(now) || !isActive(st))) {
                    continue;
                }
                if (v == View.PAST && (!o.startsAt().isBefore(now) || !"CONFIRMED".equals(st))) {
                    continue;
                }
                if (v == View.PENDING && !("PENDING".equals(st) || "COUNTER_PROPOSED".equals(st))) {
                    continue;
                }
                out.add(o);
            }
        }
        Comparator<Occurrence> order = Comparator.comparing(Occurrence::startsAt);
        out.sort(v == View.PAST ? order.reversed() : order);
        Map<UUID, mn.aura.couple.api.model.UserRef> refs = users.refs(out.stream().map(o -> o.series().proposerId()).toList());
        return out.stream().map(o -> summary(o, refs.get(o.series().proposerId()))).toList();
    }

    @Transactional(readOnly = true)
    public DatePlan get(SpaceContext ctx, UUID planId, LocalDate occurrenceOn) {
        Occurrence o = resolve(ctx, planId, occurrenceOn);
        return assemble(o, true);
    }

    /** Дурсамжийн `datePlan` (AC-95) — тухайн space-ийн болзоо л. */
    @Transactional(readOnly = true)
    public Optional<DatePlanSummary> summaryOf(UUID spaceId, UUID planId) {
        if (planId == null) {
            return Optional.empty();
        }
        List<Row> rows = query("WHERE p.id = :id AND p.space_id = :s", new MapSqlParameterSource("id", planId)
                .addValue("s", spaceId));
        if (rows.isEmpty()) {
            return Optional.empty();
        }
        Row r = rows.get(0);
        Row series = r.seriesId() == null ? r : loadById(r.seriesId());
        Occurrence o = new Occurrence(series, r, r.seriesId() == null ? null : r.occurrenceOn(), r.startsAt());
        return Optional.of(summary(o, users.ref(series.proposerId())));
    }

    /** Энэ space-д ийм болзоо бий эсэх (дурсамж үүсгэхэд `datePlanId` шалгах). */
    @Transactional(readOnly = true)
    public boolean exists(UUID spaceId, UUID planId) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM date_plan WHERE id = :id AND space_id = :s",
                new MapSqlParameterSource("id", planId).addValue("s", spaceId), Integer.class);
        return n != null && n > 0;
    }

    // --- Үүсгэх, хариулах ---

    @Transactional
    public Created create(SpaceContext ctx, DatePlanCreate in) {
        MapSqlParameterSource key = new MapSqlParameterSource("u", ctx.userId()).addValue("c", in.getClientId());
        List<UUID> existing = jdbc.queryForList("SELECT id FROM date_plan WHERE proposer_id = :u AND client_id = :c",
                key, UUID.class);
        if (!existing.isEmpty()) {
            return new Created(get(ctx, existing.get(0), null), false); // outbox-оос давтан (DD-AURA-017)
        }
        ZoneId zone = requireZone(in.getTimezone());
        DateRecurrence.Kind recurrence = kindOf(in.getRecurrence());
        List<Integer> offsets = offsets(in.getReminderOffsets());
        if (in.getChecklist() != null && in.getChecklist().size() > MAX_CHECKLIST) {
            throw ApiException.validation("checklist", ErrorCode.VALIDATION_FAILED);
        }
        LocalDate until = recurrence == DateRecurrence.Kind.NONE ? null : in.getRecurrenceUntil();
        if (until != null && until.isBefore(DateRecurrence.localDate(in.getStartsAt().toInstant(), zone))) {
            throw ApiException.validation("recurrenceUntil", ErrorCode.VALIDATION_FAILED);
        }
        UUID ideaId = in.getIdeaId();
        if (ideaId != null && !ideaInSpace(ctx.spaceId(), ideaId)) {
            throw ApiException.notFound();
        }
        boolean solo = !ctx.isCouple() || couples.partnerIn(ctx.spaceId(), ctx.userId()).isEmpty();
        UUID id = Ids.newId();
        Timestamp now = Timestamp.from(time.now());
        MapSqlParameterSource p = key.addValue("id", id).addValue("s", ctx.spaceId()).addValue("idea", ideaId)
                .addValue("title", in.getTitle().strip()).addValue("description", blankToNull(in.getDescription()))
                .addValue("category", in.getCategory() == null ? null : in.getCategory().getValue())
                .addValue("starts", Timestamp.from(in.getStartsAt().toInstant())).addValue("tz", zone.getId())
                .addValue("placeName", in.getPlace() == null ? null : in.getPlace().getName())
                .addValue("lat", in.getPlace() == null ? null : in.getPlace().getLat())
                .addValue("lon", in.getPlace() == null ? null : in.getPlace().getLon())
                .addValue("status", solo ? "CONFIRMED" : "PENDING").addValue("rec", recurrence.name())
                .addValue("until", until == null ? null : Date.valueOf(until))
                .addValue("budget", in.getPlannedBudgetMnt()).addValue("now", now);
        jdbc.update("""
                INSERT INTO date_plan (id, space_id, proposer_id, client_id, idea_id, title, description, category, starts_at,
                    timezone, place_name, lat, lon, status, recurrence, recurrence_until, planned_budget_mnt, reminder_offsets,
                    updated_by, created_at, updated_at)
                VALUES (:id, :s, :u, :c, :idea, :title, :description, :category, :starts, :tz, :placeName, :lat, :lon, :status,
                    :rec, :until, :budget, string_to_array(:offsets, ',')::int[], :u, :now, :now)
                """, p.addValue("offsets", joinOffsets(offsets)));
        if (in.getChecklist() != null) {
            int pos = 0;
            for (var item : in.getChecklist()) {
                insertChecklist(id, ctx.userId(), item.getText(), pos++);
            }
        }
        Row row = loadById(id);
        syncReminders(row);
        if (!solo) {
            couples.partnerIn(ctx.spaceId(), ctx.userId()).ifPresent(partner -> events.publishEvent(new Notify(partner,
                    ctx.spaceId(), ctx.userId(), "DATE_PROPOSED", Map.of("partner", name(ctx.userId()), "title", row.title()),
                    "/plans/" + id)));
        }
        publish(ctx, row);
        return new Created(get(ctx, id, null), true);
    }

    /** Хамтрагчийн хариу (AC-33): зөвхөн санал болгогч биш нь, зөвхөн `PENDING` үед. */
    @Transactional
    public DatePlan respond(SpaceContext ctx, UUID planId, PlanResponse in) {
        Row row = lockSeries(ctx, planId);
        if (row.proposerId().equals(ctx.userId())) {
            throw new ApiException(ErrorCode.NOT_OWNER, HttpStatus.FORBIDDEN);
        }
        if (!"PENDING".equals(row.status())) {
            throw new ApiException(ErrorCode.PLAN_NOT_PENDING, HttpStatus.CONFLICT);
        }
        MapSqlParameterSource p = new MapSqlParameterSource("id", row.id()).addValue("u", ctx.userId())
                .addValue("now", Timestamp.from(time.now()));
        switch (in.getAction()) {
            case ACCEPT -> setStatus(p, "CONFIRMED");
            case DECLINE -> setStatus(p, "DECLINED");
            case COUNTER -> {
                List<OffsetDateTime> options = in.getOptions();
                if (options == null || options.isEmpty() || options.size() > 3) {
                    throw ApiException.validation("options", ErrorCode.VALIDATION_FAILED);
                }
                jdbc.update("DELETE FROM plan_counter_option WHERE plan_id = :id", p);
                for (OffsetDateTime at : options) {
                    jdbc.update("""
                            INSERT INTO plan_counter_option (id, plan_id, proposer_id, starts_at, created_at)
                            VALUES (:oid, :id, :u, :at, :now)
                            """, new MapSqlParameterSource(p.getValues()).addValue("oid", Ids.newId())
                            .addValue("at", Timestamp.from(at.toInstant())));
                }
                setStatus(p, "COUNTER_PROPOSED");
            }
        }
        Row updated = loadById(row.id());
        syncReminders(updated);
        events.publishEvent(new Notify(row.proposerId(), ctx.spaceId(), ctx.userId(), "DATE_RESPONDED",
                Map.of("partner", name(ctx.userId()), "title", row.title()), "/plans/" + row.id()));
        publish(ctx, updated);
        return get(ctx, row.id(), null);
    }

    /** «Өөр цаг»-аас нэгийг сонгох (AC-33): хувилбар санал болгосон хүн биш нь, `COUNTER_PROPOSED` үед. */
    @Transactional
    public DatePlan chooseOption(SpaceContext ctx, UUID planId, UUID optionId) {
        Row row = lockSeries(ctx, planId);
        if (!"COUNTER_PROPOSED".equals(row.status())) {
            throw new ApiException(ErrorCode.PLAN_NOT_PENDING, HttpStatus.CONFLICT);
        }
        List<Map<String, Object>> options = jdbc.queryForList(
                "SELECT proposer_id, starts_at FROM plan_counter_option WHERE id = :o AND plan_id = :id",
                new MapSqlParameterSource("o", optionId).addValue("id", row.id()));
        if (options.isEmpty()) {
            throw ApiException.validation("optionId", ErrorCode.VALIDATION_FAILED);
        }
        UUID optionBy = (UUID) options.get(0).get("proposer_id");
        if (optionBy.equals(ctx.userId())) {
            throw new ApiException(ErrorCode.NOT_OWNER, HttpStatus.FORBIDDEN);
        }
        MapSqlParameterSource p = new MapSqlParameterSource("id", row.id()).addValue("u", ctx.userId())
                .addValue("o", optionId).addValue("at", options.get(0).get("starts_at"))
                .addValue("now", Timestamp.from(time.now()));
        jdbc.update("UPDATE plan_counter_option SET chosen = (id = :o) WHERE plan_id = :id", p);
        jdbc.update("""
                UPDATE date_plan SET starts_at = :at, status = 'CONFIRMED', updated_by = :u, updated_at = :now,
                       version = version + 1 WHERE id = :id
                """, p);
        Row updated = loadById(row.id());
        syncReminders(updated);
        events.publishEvent(new Notify(optionBy, ctx.spaceId(), ctx.userId(), "DATE_RESPONDED",
                Map.of("partner", name(ctx.userId()), "title", row.title()), "/plans/" + row.id()));
        publish(ctx, updated);
        return get(ctx, row.id(), null);
    }

    // --- Засах, цуцлах ---

    @Transactional
    public DatePlan update(SpaceContext ctx, UUID planId, DatePlanUpdate in) {
        Row series = lockSeries(ctx, planId);
        boolean occurrence = in.getScope() == DatePlanUpdate.ScopeEnum.OCCURRENCE && series.recurring();
        Row target = series;
        if (occurrence) {
            LocalDate on = requireOccurrence(series, in.getOccurrenceOn());
            target = exception(series, on).orElse(null);
            long current = target == null ? series.version() : target.version();
            if (in.getVersion() == null || in.getVersion() != current) {
                throw conflict(ctx, series, on, target == null ? series : target);
            }
            if (target == null) {
                target = createException(series, on, series.status(), ctx.userId());
            }
        } else if (in.getVersion() == null || in.getVersion() != series.version()) {
            throw conflict(ctx, series, null, series);
        }
        List<String> sets = new ArrayList<>();
        MapSqlParameterSource p = new MapSqlParameterSource("id", target.id()).addValue("u", ctx.userId())
                .addValue("now", Timestamp.from(time.now()));
        if (in.getTitle() != null) {
            sets.add("title = :title");
            p.addValue("title", in.getTitle().strip());
        }
        if (in.getDescription() != null) {
            sets.add("description = :description");
            p.addValue("description", blankToNull(in.getDescription()));
        }
        if (in.getCategory() != null) {
            sets.add("category = :category");
            p.addValue("category", in.getCategory().getValue());
        }
        if (in.getTimezone() != null) {
            sets.add("timezone = :tz");
            p.addValue("tz", requireZone(in.getTimezone()).getId());
        }
        if (in.getStartsAt() != null) {
            sets.add("starts_at = :starts");
            p.addValue("starts", Timestamp.from(in.getStartsAt().toInstant()));
        }
        if (in.getPlace() != null) {
            NullablePlace place = in.getPlace();
            sets.add("place_name = :placeName, lat = :lat, lon = :lon");
            p.addValue("placeName", place.getName()).addValue("lat", place.getLat()).addValue("lon", place.getLon());
        }
        if (in.getPlannedBudgetMnt() != null) {
            sets.add("planned_budget_mnt = :budget");
            p.addValue("budget", in.getPlannedBudgetMnt());
        }
        if (!occurrence) {
            if (in.getReminderOffsets() != null) {
                sets.add("reminder_offsets = string_to_array(:offsets, ',')::int[]");
                p.addValue("offsets", joinOffsets(offsets(in.getReminderOffsets())));
            }
            if (in.getRecurrence() != null) {
                sets.add("recurrence = :rec");
                p.addValue("rec", kindOf(in.getRecurrence()).name());
            }
            if (in.getRecurrenceUntil() != null) {
                sets.add("recurrence_until = :until");
                p.addValue("until", Date.valueOf(in.getRecurrenceUntil()));
            }
        }
        if (!sets.isEmpty()) {
            sets.add("updated_by = :u");
            sets.add("updated_at = :now");
            sets.add("version = version + 1");
            jdbc.update("UPDATE date_plan SET " + String.join(", ", sets) + " WHERE id = :id", p);
        }
        Row updated = loadById(series.id());
        syncReminders(updated);
        publish(ctx, updated);
        return get(ctx, series.id(), occurrence ? in.getOccurrenceOn() : null);
    }

    /** Цуцлах (AC-35, AC-37): бүх цуваа эсвэл нэг удаа; сануулга цуцлагдана. */
    @Transactional
    public void cancel(SpaceContext ctx, UUID planId, String scope, LocalDate occurrenceOn) {
        Row series = lockSeries(ctx, planId);
        Timestamp now = Timestamp.from(time.now());
        if ("OCCURRENCE".equals(scope) && series.recurring()) {
            LocalDate on = requireOccurrence(series, occurrenceOn);
            Row ex = exception(series, on).orElseGet(() -> createException(series, on, series.status(), ctx.userId()));
            jdbc.update("""
                    UPDATE date_plan SET status = 'CANCELLED', updated_by = :u, updated_at = :now, version = version + 1
                     WHERE id = :id
                    """, new MapSqlParameterSource("id", ex.id()).addValue("u", ctx.userId()).addValue("now", now));
        } else {
            jdbc.update("""
                    UPDATE date_plan SET status = 'CANCELLED', updated_by = :u, updated_at = :now, version = version + 1
                     WHERE id = :id
                    """, new MapSqlParameterSource("id", series.id()).addValue("u", ctx.userId()).addValue("now", now));
        }
        Row updated = loadById(series.id());
        syncReminders(updated);
        publish(ctx, updated);
    }

    // --- Checklist (AC-96) ---

    @Transactional
    public ChecklistItem addChecklist(SpaceContext ctx, UUID planId, String text) {
        Row series = lockSeries(ctx, planId);
        Integer count = jdbc.queryForObject("SELECT count(*) FROM checklist_item WHERE plan_id = :p",
                new MapSqlParameterSource("p", series.id()), Integer.class);
        if (count != null && count >= MAX_CHECKLIST) {
            throw ApiException.validation("text", ErrorCode.VALIDATION_FAILED);
        }
        UUID id = insertChecklist(series.id(), ctx.userId(), text, count == null ? 0 : count);
        ChecklistItem item = checklistItem(id);
        publishChecklist(ctx, series.id(), item, false);
        return item;
    }

    @Transactional
    public ChecklistItem updateChecklist(SpaceContext ctx, UUID itemId, ChecklistUpdate in) {
        Map<String, Object> row = lockChecklist(ctx, itemId);
        UUID planId = (UUID) row.get("plan_id");
        long version = ((Number) row.get("version")).longValue();
        if (in.getVersion() == null || in.getVersion() != version) {
            ChecklistItem current = checklistItem(itemId);
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("current", current);
            details.put("currentVersion", current.getVersion());
            details.put("updatedBy", row.get("updated_by") == null ? row.get("created_by") : row.get("updated_by"));
            throw new ApiException(ErrorCode.VERSION_CONFLICT, HttpStatus.CONFLICT, details);
        }
        List<String> sets = new ArrayList<>();
        MapSqlParameterSource p = new MapSqlParameterSource("id", itemId).addValue("u", ctx.userId())
                .addValue("now", Timestamp.from(time.now()));
        if (in.getText() != null) {
            String text = in.getText().strip();
            if (text.isEmpty()) {
                throw ApiException.validation("text", ErrorCode.VALIDATION_FAILED);
            }
            sets.add("text = :text");
            p.addValue("text", text);
        }
        boolean done = row.get("done_at") != null;
        if (in.getDone() != null && in.getDone() != done) {
            sets.add(in.getDone() ? "done_by = :u, done_at = :now" : "done_by = NULL, done_at = NULL");
        }
        ChecklistItem item;
        if (!sets.isEmpty()) {
            sets.add("updated_by = :u, updated_at = :now, version = version + 1");
            jdbc.update("UPDATE checklist_item SET " + String.join(", ", sets) + " WHERE id = :id", p);
            item = checklistItem(itemId);
            publishChecklist(ctx, planId, item, false);
        } else {
            item = checklistItem(itemId);
        }
        return item;
    }

    @Transactional
    public void deleteChecklist(SpaceContext ctx, UUID itemId) {
        Map<String, Object> row = lockChecklist(ctx, itemId);
        ChecklistItem last = checklistItem(itemId);
        jdbc.update("DELETE FROM checklist_item WHERE id = :id", new MapSqlParameterSource("id", itemId));
        publishChecklist(ctx, (UUID) row.get("plan_id"), last, true);
    }

    // --- Дурсамж (AC-95), ICS (AC-101) ---

    @Transactional
    public DatePlan linkMemory(SpaceContext ctx, UUID planId, UUID memoryId) {
        Row series = lockSeries(ctx, planId);
        Integer visible = jdbc.queryForObject("""
                SELECT count(*) FROM memory WHERE id = :m AND space_id = :s AND deleted_at IS NULL
                """, new MapSqlParameterSource("m", memoryId).addValue("s", ctx.spaceId()), Integer.class);
        if (visible == null || visible == 0) {
            throw ApiException.notFound();
        }
        UUID linked = linkedMemory(series);
        if (linked != null && !linked.equals(memoryId)) {
            throw new ApiException(ErrorCode.ALREADY_DECIDED, HttpStatus.CONFLICT, Map.of("memoryId", linked));
        }
        MapSqlParameterSource p = new MapSqlParameterSource("id", series.id()).addValue("m", memoryId)
                .addValue("u", ctx.userId()).addValue("now", Timestamp.from(time.now()));
        jdbc.update("UPDATE date_plan SET memory_id = :m, updated_by = :u, updated_at = :now WHERE id = :id", p);
        jdbc.update("UPDATE memory SET date_plan_id = :id WHERE id = :m AND date_plan_id IS NULL", p);
        Row updated = loadById(series.id());
        publish(ctx, updated);
        return get(ctx, series.id(), null);
    }

    /** iCalendar (RFC 5545) — UTC цагтай, газар, `TZID`-ийн оронд `Z` (бүх календарь зөв уншина). */
    @Transactional(readOnly = true)
    public String ics(SpaceContext ctx, UUID planId, LocalDate occurrenceOn) {
        Occurrence o = resolve(ctx, planId, occurrenceOn);
        Row shown = o.shown();
        DateTimeFormatter f = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'", Locale.ROOT).withZone(ZoneOffset.UTC);
        String uid = o.series().id() + (o.on() == null ? "" : "-" + o.on()) + "@aura";
        StringBuilder b = new StringBuilder();
        b.append("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Aura//Date plan//MN\r\nCALSCALE:GREGORIAN\r\n");
        b.append("BEGIN:VEVENT\r\n");
        b.append("UID:").append(uid).append("\r\n");
        b.append("DTSTAMP:").append(f.format(time.now())).append("\r\n");
        b.append("DTSTART:").append(f.format(o.startsAt())).append("\r\n");
        b.append("DTEND:").append(f.format(o.startsAt().plus(Duration.ofHours(2)))).append("\r\n");
        b.append("SUMMARY:").append(icsText(shown.title())).append("\r\n");
        if (shown.description() != null) {
            b.append("DESCRIPTION:").append(icsText(shown.description())).append("\r\n");
        }
        if (shown.placeName() != null) {
            b.append("LOCATION:").append(icsText(shown.placeName())).append("\r\n");
            if (shown.lat() != null && shown.lon() != null) {
                b.append("GEO:").append(shown.lat().toPlainString()).append(";").append(shown.lon().toPlainString())
                        .append("\r\n");
            }
        }
        for (Integer m : o.series().reminderOffsets()) {
            b.append("BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:").append(icsText(shown.title()))
                    .append("\r\nTRIGGER:-PT").append(m).append("M\r\nEND:VALARM\r\n");
        }
        b.append("END:VEVENT\r\nEND:VCALENDAR\r\n");
        return b.toString();
    }

    /** Илгээгдсэн сануулгын дараа дараагийн давталтуудыг нөхөж товлох (ReminderScheduler, T-68). */
    @Transactional
    public void refreshReminders(UUID planId) {
        List<Row> rows = query("WHERE p.id = :id AND p.series_id IS NULL", new MapSqlParameterSource("id", planId));
        if (!rows.isEmpty()) {
            syncReminders(rows.get(0));
        }
    }

    // --- Дотоод: давталт ---

    private Occurrence resolve(SpaceContext ctx, UUID planId, LocalDate occurrenceOn) {
        List<Row> rows = query("WHERE p.id = :id AND p.space_id = :s",
                new MapSqlParameterSource("id", planId).addValue("s", ctx.spaceId()));
        if (rows.isEmpty()) {
            throw ApiException.notFound();
        }
        Row r = rows.get(0);
        if (r.seriesId() != null) { // нэг удаагийн мөрийн ID-аар шууд
            Row series = loadById(r.seriesId());
            return new Occurrence(series, r, r.occurrenceOn(), r.startsAt());
        }
        if (!r.recurring()) {
            return new Occurrence(r, r, null, r.startsAt());
        }
        LocalDate on = occurrenceOn != null ? requireOccurrence(r, occurrenceOn) : nextOccurrence(r);
        Optional<Row> ex = exception(r, on);
        return ex.map(e -> new Occurrence(r, e, on, e.startsAt()))
                .orElseGet(() -> new Occurrence(r, r, on, DateRecurrence.startOf(r.startsAt(), r.zone(), on)));
    }

    /** Одоогоос хойших эхний давталт (байхгүй бол сүүлийнх, эсвэл эхнийх). */
    private LocalDate nextOccurrence(Row r) {
        LocalDate today = time.today(r.zone());
        LocalDate from = today.isAfter(r.firstDate()) ? today : r.firstDate();
        List<LocalDate> next = DateRecurrence.between(r.firstDate(), r.recurrence(), r.recurrenceUntil(), from,
                from.plusYears(2));
        if (!next.isEmpty()) {
            return next.get(0);
        }
        List<LocalDate> all = DateRecurrence.between(r.firstDate(), r.recurrence(), r.recurrenceUntil(), r.firstDate(),
                today);
        return all.isEmpty() ? r.firstDate() : all.get(all.size() - 1);
    }

    private LocalDate requireOccurrence(Row series, LocalDate on) {
        if (on == null) {
            throw ApiException.validation("occurrenceOn", ErrorCode.VALIDATION_FAILED);
        }
        if (!DateRecurrence.isOccurrence(series.firstDate(), series.recurrence(), series.recurrenceUntil(), on)) {
            throw ApiException.notFound();
        }
        return on;
    }

    private List<Occurrence> expand(Row r, Map<LocalDate, Row> exceptions, Instant lo, Instant hi) {
        List<Occurrence> out = new ArrayList<>();
        if (!r.recurring()) {
            if (!r.startsAt().isBefore(lo) && !r.startsAt().isAfter(hi)) {
                out.add(new Occurrence(r, r, null, r.startsAt()));
            }
            return out;
        }
        ZoneId zone = r.zone();
        // Нэг удаагийн өөрчлөлт өдрөөс гадуур шилжсэн байж болох тул мужийг 1 өдрөөр тэлж задлаад цагаар шүүнэ
        LocalDate from = DateRecurrence.localDate(lo, zone).minusDays(1);
        LocalDate to = DateRecurrence.localDate(hi, zone).plusDays(1);
        for (LocalDate on : DateRecurrence.between(r.firstDate(), r.recurrence(), r.recurrenceUntil(), from, to)) {
            Row ex = exceptions.get(on);
            Instant at = ex != null ? ex.startsAt() : DateRecurrence.startOf(r.startsAt(), zone, on);
            if (at.isBefore(lo) || at.isAfter(hi)) {
                continue;
            }
            out.add(new Occurrence(r, ex != null ? ex : r, on, at));
        }
        return out;
    }

    private Map<UUID, Map<LocalDate, Row>> exceptionsOf(UUID spaceId) {
        Map<UUID, Map<LocalDate, Row>> map = new HashMap<>();
        for (Row e : query("WHERE p.space_id = :s AND p.series_id IS NOT NULL", new MapSqlParameterSource("s", spaceId))) {
            map.computeIfAbsent(e.seriesId(), k -> new HashMap<>()).put(e.occurrenceOn(), e);
        }
        return map;
    }

    private Optional<Row> exception(Row series, LocalDate on) {
        return query("WHERE p.series_id = :id AND p.occurrence_on = :on",
                new MapSqlParameterSource("id", series.id()).addValue("on", Date.valueOf(on))).stream().findFirst();
    }

    /** Цувааны тухайн давталтын хуулбар мөр (нэг удаа өөрчлөх/цуцлахад). */
    private Row createException(Row series, LocalDate on, String status, UUID userId) {
        UUID id = Ids.newId();
        Instant at = DateRecurrence.startOf(series.startsAt(), series.zone(), on);
        jdbc.update("""
                INSERT INTO date_plan (id, space_id, proposer_id, idea_id, title, description, category, starts_at, timezone,
                    place_name, lat, lon, status, recurrence, series_id, occurrence_on, planned_budget_mnt, reminder_offsets,
                    updated_by, created_at, updated_at)
                SELECT :id, space_id, proposer_id, idea_id, title, description, category, :at, timezone, place_name, lat, lon,
                       :status, 'NONE', id, :on, planned_budget_mnt, reminder_offsets, :u, :now, :now
                  FROM date_plan WHERE id = :series
                """, new MapSqlParameterSource("id", id).addValue("at", Timestamp.from(at)).addValue("status", status)
                .addValue("on", Date.valueOf(on)).addValue("series", series.id()).addValue("u", userId)
                .addValue("now", Timestamp.from(time.now())));
        return loadById(id);
    }

    // --- Дотоод: сануулга (AC-35, AC-180) ---

    /**
     * Батлагдсан болзооны (давталттай бол ойрын {@value #REMINDER_OCCURRENCES} удаагийн) сануулгыг хоёр гишүүнд
     * дахин товлоно; бусад төлөвт бүгдийг цуцална. Өнгөрсөн агшинтай сануулга бичигдэхгүй (`ReminderRegistry`).
     */
    private void syncReminders(Row series) {
        String source = series.id().toString();
        if (!"CONFIRMED".equals(series.status()) || series.reminderOffsets().isEmpty()) {
            reminders.cancel(SourceType.DATE_PLAN, source);
            return;
        }
        Instant now = time.now();
        List<Occurrence> upcoming = expand(series, exceptionsOf(series.spaceId()).getOrDefault(series.id(), Map.of()),
                now, now.plus(Duration.ofDays(400))).stream()
                .filter(o -> "CONFIRMED".equals(o.shown().status()))
                .limit(REMINDER_OCCURRENCES).toList();
        List<UUID> members = couples.members(series.spaceId());
        Map<UUID, String> names = new HashMap<>();
        for (UUID m : members) {
            names.put(m, name(m));
        }
        List<Reminder> list = new ArrayList<>();
        for (Occurrence o : upcoming) {
            String link = "/plans/" + series.id() + (o.on() == null ? "" : "?occurrenceOn=" + o.on());
            for (UUID member : members) {
                String partner = members.stream().filter(x -> !x.equals(member)).findFirst().map(names::get).orElse("");
                for (Integer minutes : series.reminderOffsets()) {
                    list.add(new Reminder(member, o.startsAt().minus(Duration.ofMinutes(minutes)), "DATE_REMINDER",
                            Map.of("title", o.shown().title(), "partner", partner), link));
                }
            }
        }
        reminders.replace(series.spaceId(), SourceType.DATE_PLAN, source, list);
    }

    // --- Дотоод: угсралт ---

    private DatePlan assemble(Occurrence o, boolean withWeather) {
        Row s = o.series();
        Row shown = o.shown();
        DatePlanSummary sum = summary(o, users.ref(s.proposerId()));
        List<ChecklistItem> checklist = checklist(s.id());
        List<Expense> expenses = expenses(s.id());
        long actual = expenses.stream().mapToLong(Expense::getAmountMnt).sum();
        Long planned = shown.plannedBudget();
        BudgetLine budget = new BudgetLine(s.id(), shown.title(), planned, actual,
                planned == null ? 0L : Math.max(0, actual - planned));
        budget.startsAt(sum.getStartsAt());
        long done = checklist.stream().filter(ChecklistItem::getDone).count();
        DatePlan plan = new DatePlan(s.id(), sum.getTitle(), sum.getStartsAt(), sum.getTimezone(), sum.getStatus(),
                sum.getRecurrence(), new ArrayList<>(s.reminderOffsets()), counterOptions(s.id()), checklist,
                new DatePlanAllOfChecklistProgress((int) done, checklist.size()), expenses, budget,
                shown == s ? s.version() : shown.version());
        plan.category(sum.getCategory());
        plan.place(sum.getPlace());
        plan.occurrenceOn(sum.getOccurrenceOn());
        plan.proposer(sum.getProposer());
        plan.description(shown.description());
        plan.ideaId(s.ideaId());
        plan.seriesId(s.recurring() ? s.id() : null);
        plan.recurrenceUntil(s.recurrenceUntil());
        plan.plannedBudgetMnt(planned);
        plan.memoryId(linkedMemory(s));
        if (withWeather && shown.lat() != null && shown.lon() != null) {
            try {
                weather.forDate(shown.lat().doubleValue(), shown.lon().doubleValue(),
                        DateRecurrence.localDate(o.startsAt(), shown.zone()), shown.zone()).ifPresent(plan::weather);
            } catch (RuntimeException e) {
                // Цаг агаар хүрэхгүй бол хэсгээ нууна (AC-71)
            }
        }
        return plan;
    }

    private DatePlanSummary summary(Occurrence o, mn.aura.couple.api.model.UserRef proposer) {
        Row s = o.series();
        Row shown = o.shown();
        DatePlanSummary sum = new DatePlanSummary(s.id(), shown.title(), utc(o.startsAt()), shown.timezone(),
                PlanStatus.fromValue(shown.status()), Recurrence.fromValue(s.recurrence().name()));
        sum.category(shown.category() == null ? null : IdeaCategory.fromValue(shown.category()));
        if (shown.placeName() != null && shown.lat() != null && shown.lon() != null) {
            sum.place(new NullablePlace(shown.placeName(), shown.lat(), shown.lon()));
        }
        sum.occurrenceOn(o.on());
        sum.proposer(proposer);
        return sum;
    }

    private UUID linkedMemory(Row s) {
        if (s.memoryId() != null) {
            return s.memoryId();
        }
        List<UUID> ids = jdbc.queryForList("""
                SELECT id FROM memory WHERE date_plan_id = :p AND deleted_at IS NULL ORDER BY created_at LIMIT 1
                """, new MapSqlParameterSource("p", s.id()), UUID.class);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private List<CounterOption> counterOptions(UUID planId) {
        return jdbc.query("SELECT id, starts_at, proposer_id, chosen FROM plan_counter_option WHERE plan_id = :p "
                        + "ORDER BY starts_at, id", new MapSqlParameterSource("p", planId),
                (rs, i) -> new CounterOption(rs.getObject("id", UUID.class), utc(rs.getTimestamp("starts_at").toInstant()),
                        rs.getObject("proposer_id", UUID.class), rs.getBoolean("chosen")));
    }

    private List<ChecklistItem> checklist(UUID planId) {
        return jdbc.query("SELECT * FROM checklist_item WHERE plan_id = :p ORDER BY position, created_at, id",
                new MapSqlParameterSource("p", planId), (rs, i) -> mapChecklist(rs));
    }

    private ChecklistItem checklistItem(UUID id) {
        return jdbc.query("SELECT * FROM checklist_item WHERE id = :id", new MapSqlParameterSource("id", id),
                (rs, i) -> mapChecklist(rs)).stream().findFirst().orElseThrow(ApiException::notFound);
    }

    private static ChecklistItem mapChecklist(ResultSet rs) throws SQLException {
        Timestamp doneAt = rs.getTimestamp("done_at");
        ChecklistItem item = new ChecklistItem(rs.getObject("id", UUID.class), rs.getString("text"), rs.getInt("position"),
                doneAt != null, rs.getLong("version"));
        item.doneBy(rs.getObject("done_by", UUID.class));
        item.doneAt(doneAt == null ? null : utc(doneAt.toInstant()));
        return item;
    }

    private List<Expense> expenses(UUID planId) {
        return jdbc.query("SELECT * FROM expense WHERE plan_id = :p ORDER BY spent_on, created_at, id",
                new MapSqlParameterSource("p", planId), (rs, i) -> {
                    Expense e = new Expense(rs.getObject("id", UUID.class), rs.getObject("plan_id", UUID.class),
                            rs.getLong("amount_mnt"), rs.getObject("payer_id", UUID.class),
                            rs.getDate("spent_on").toLocalDate());
                    e.note(rs.getString("note"));
                    return e;
                });
    }

    private UUID insertChecklist(UUID planId, UUID userId, String text, int position) {
        String clean = text == null ? "" : text.strip();
        if (clean.isEmpty() || clean.length() > 200) {
            throw ApiException.validation("text", ErrorCode.VALIDATION_FAILED);
        }
        UUID id = Ids.newId();
        Timestamp now = Timestamp.from(time.now());
        jdbc.update("""
                INSERT INTO checklist_item (id, plan_id, text, position, created_by, updated_by, created_at, updated_at)
                VALUES (:id, :p, :text, :pos, :u, :u, :now, :now)
                """, new MapSqlParameterSource("id", id).addValue("p", planId).addValue("text", clean)
                .addValue("pos", position).addValue("u", userId).addValue("now", now));
        return id;
    }

    private Map<String, Object> lockChecklist(SpaceContext ctx, UUID itemId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT c.id, c.plan_id, c.done_at, c.created_by, c.updated_by, c.version
                  FROM checklist_item c JOIN date_plan p ON p.id = c.plan_id
                 WHERE c.id = :id AND p.space_id = :s FOR UPDATE OF c
                """, new MapSqlParameterSource("id", itemId).addValue("s", ctx.spaceId()));
        if (rows.isEmpty()) {
            throw ApiException.notFound();
        }
        return rows.get(0);
    }

    // --- Дотоод: мөр ---

    private Row lockSeries(SpaceContext ctx, UUID planId) {
        List<Row> rows = query("WHERE p.id = :id AND p.space_id = :s FOR UPDATE",
                new MapSqlParameterSource("id", planId).addValue("s", ctx.spaceId()));
        if (rows.isEmpty()) {
            throw ApiException.notFound();
        }
        Row r = rows.get(0);
        if (r.seriesId() != null) { // нэг удаагийн мөрийн ID → цуваа
            return query("WHERE p.id = :id FOR UPDATE", new MapSqlParameterSource("id", r.seriesId())).get(0);
        }
        return r;
    }

    Row loadById(UUID id) {
        List<Row> rows = query("WHERE p.id = :id", new MapSqlParameterSource("id", id));
        if (rows.isEmpty()) {
            throw ApiException.notFound();
        }
        return rows.get(0);
    }

    private List<Row> query(String where, MapSqlParameterSource p) {
        return jdbc.query("SELECT " + COLUMNS + " FROM date_plan p " + where, p, (rs, i) -> map(rs));
    }

    private static Row map(ResultSet rs) throws SQLException {
        Date until = rs.getDate("recurrence_until");
        Date on = rs.getDate("occurrence_on");
        Object budget = rs.getObject("planned_budget_mnt");
        List<Integer> offsets = new ArrayList<>();
        Array arr = rs.getArray("reminder_offsets");
        if (arr != null) {
            for (Object o : (Object[]) arr.getArray()) {
                offsets.add(((Number) o).intValue());
            }
        }
        return new Row(rs.getObject("id", UUID.class), rs.getObject("space_id", UUID.class),
                rs.getObject("proposer_id", UUID.class), rs.getObject("idea_id", UUID.class), rs.getString("title"),
                rs.getString("description"), rs.getString("category"), rs.getTimestamp("starts_at").toInstant(),
                rs.getString("timezone"), rs.getString("place_name"), rs.getBigDecimal("lat"), rs.getBigDecimal("lon"),
                rs.getString("status"), DateRecurrence.Kind.valueOf(rs.getString("recurrence")),
                until == null ? null : until.toLocalDate(), rs.getObject("series_id", UUID.class),
                on == null ? null : on.toLocalDate(), budget == null ? null : ((Number) budget).longValue(), offsets,
                rs.getObject("memory_id", UUID.class), rs.getObject("responder_id", UUID.class),
                rs.getObject("updated_by", UUID.class), rs.getLong("version"));
    }

    private void setStatus(MapSqlParameterSource p, String status) {
        jdbc.update("""
                UPDATE date_plan SET status = :status, responder_id = :u, updated_by = :u, updated_at = :now,
                       version = version + 1 WHERE id = :id
                """, new MapSqlParameterSource(p.getValues()).addValue("status", status));
    }

    private ApiException conflict(SpaceContext ctx, Row series, LocalDate on, Row current) {
        DatePlan plan = get(ctx, series.id(), on);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("current", plan);
        details.put("currentVersion", plan.getVersion());
        details.put("updatedBy", current.updatedBy() == null ? current.proposerId() : current.updatedBy());
        return new ApiException(ErrorCode.VERSION_CONFLICT, HttpStatus.CONFLICT, details);
    }

    private void publish(SpaceContext ctx, Row row) {
        Row series = row.seriesId() == null ? row : loadById(row.seriesId());
        Instant at = series.startsAt();
        LocalDate on = null;
        Row shown = series;
        if (series.recurring()) {
            on = nextOccurrence(series);
            Optional<Row> ex = exception(series, on);
            shown = ex.orElse(series);
            at = ex.map(Row::startsAt).orElse(DateRecurrence.startOf(series.startsAt(), series.zone(), on));
        }
        DatePlanSummary sum = summary(new Occurrence(series, shown, on, at), users.ref(series.proposerId()));
        events.publishEvent(RealtimeEvent.of("plan.updated", ctx.userId(), couples.members(ctx.spaceId()), sum));
    }

    private void publishChecklist(SpaceContext ctx, UUID planId, ChecklistItem item, boolean removed) {
        List<ChecklistItem> all = checklist(planId);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("planId", planId);
        payload.put("item", item);
        payload.put("progress", Map.of("done", all.stream().filter(ChecklistItem::getDone).count(), "total", all.size()));
        if (removed) {
            payload.put("removed", true);
        }
        events.publishEvent(RealtimeEvent.of("checklist.updated", ctx.userId(), couples.members(ctx.spaceId()), payload));
    }

    private boolean ideaInSpace(UUID spaceId, UUID ideaId) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM date_idea WHERE id = :i AND space_id = :s",
                new MapSqlParameterSource("i", ideaId).addValue("s", spaceId), Integer.class);
        return n != null && n > 0;
    }

    private String name(UUID userId) {
        return users.ref(userId).getDisplayName();
    }

    private static boolean isActive(String status) {
        return "PENDING".equals(status) || "COUNTER_PROPOSED".equals(status) || "CONFIRMED".equals(status);
    }

    private static View parseView(String view) {
        if (view == null || view.isBlank()) {
            return null;
        }
        try {
            return View.valueOf(view.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw ApiException.validation("view", ErrorCode.VALIDATION_FAILED);
        }
    }

    private static DateRecurrence.Kind kindOf(Recurrence r) {
        return r == null ? DateRecurrence.Kind.NONE : DateRecurrence.Kind.valueOf(r.getValue());
    }

    private static List<Integer> offsets(List<Integer> in) {
        if (in == null) {
            return List.of();
        }
        if (in.size() > 5 || in.stream().anyMatch(m -> m == null || m < 0 || m > 60 * 24 * 60)) {
            throw ApiException.validation("reminderOffsets", ErrorCode.VALIDATION_FAILED);
        }
        return in.stream().distinct().sorted(Comparator.reverseOrder()).toList();
    }

    private static String joinOffsets(List<Integer> offsets) {
        return String.join(",", offsets.stream().map(String::valueOf).toList());
    }

    private static ZoneId requireZone(String tz) {
        try {
            return ZoneId.of(tz);
        } catch (DateTimeException | NullPointerException e) {
            throw ApiException.validation("timezone", ErrorCode.VALIDATION_FAILED);
        }
    }

    static ZoneId zoneOf(String tz) {
        try {
            return ZoneId.of(tz);
        } catch (DateTimeException | NullPointerException e) {
            return ZoneId.of("Asia/Ulaanbaatar");
        }
    }

    private static OffsetDateTime utc(Instant i) {
        return i == null ? null : OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    private static String icsText(String s) {
        return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r", "").replace("\n", "\\n");
    }
}
