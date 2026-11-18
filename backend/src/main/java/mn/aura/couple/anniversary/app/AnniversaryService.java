package mn.aura.couple.anniversary.app;

import java.nio.charset.StandardCharsets;
import java.sql.Array;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import mn.aura.couple.anniversary.app.AutoMilestoneCalculator.AutoOccasion;
import mn.aura.couple.anniversary.app.AutoMilestoneCalculator.Source;
import mn.aura.couple.api.model.Anniversary;
import mn.aura.couple.api.model.AnniversaryInput;
import mn.aura.couple.api.model.AnniversaryKind;
import mn.aura.couple.api.model.AnniversaryUpdate;
import mn.aura.couple.api.model.MemorySummary;
import mn.aura.couple.api.model.Occasion;
import mn.aura.couple.api.model.OccasionDetail;
import mn.aura.couple.api.model.OccasionKind;
import mn.aura.couple.api.model.OccasionNoteInput;
import mn.aura.couple.api.model.OccasionSource;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.CoupleMembers;
import mn.aura.couple.couple.app.UserRefs;
import mn.aura.couple.couple.app.UserRefs.UserRow;
import mn.aura.couple.memory.app.MemoryAssembler;
import mn.aura.couple.memory.app.MemoryService;
import mn.aura.couple.notification.app.ReminderRegistry;
import mn.aura.couple.notification.app.ReminderRegistry.Reminder;
import mn.aura.couple.notification.app.ReminderRegistry.Scheduled;
import mn.aura.couple.notification.app.ReminderRegistry.SourceType;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ой (FR-8.1…8.5): хэрэглэгчийн ой (`anniversary`), автомат ой ба төрсөн өдөр (`AutoMilestoneCalculator` —
 * хадгалагдахгүй, AC-102) нэг `Occasion` жагсаалтад. Тэмдэглэл + дурсамж (AC-105), сануулга 7/1/0 хоног
 * (`ReminderRegistry`, хоёр гишүүнд тус тусын бүсээр 09:00, AC-104). Засах/устгах — зөвхөн зохиогч
 * (403 `NOT_OWNER`), `version` зөрвөл 409 (DD-AURA-016).
 */
@Service
public class AnniversaryService {

    /** Анхдагч жагсаалтад өнгөрсөн давтагдахгүй ойг хэдэн хоног харуулах («3 хоногийн өмнө», AC-103). */
    static final int PAST_WINDOW_DAYS = 30;
    static final int MAX_MEMORIES = 20;
    /** Сануулгын цаг — хүлээн авагчийн бүсээр. */
    static final LocalTime REMINDER_TIME = LocalTime.of(9, 0);

    /** Нэг ойн (хэрэглэгчийн эсвэл автомат) дотоод мөр. `version` — тэмдэглэлийн хувилбар. */
    public record OccasionRow(String key, Source source, UUID anniversaryId, UUID authorId, AutoOccasion auto,
                              String customTitle, AnniversaryKind customKind, LocalDate date, boolean recurring,
                              String note, List<Integer> reminderDays, List<UUID> memoryIds, long version) {
    }

    private final NamedParameterJdbcTemplate jdbc;
    private final MemoryService memories;
    private final MemoryAssembler memoryAssembler;
    private final UserRefs users;
    private final CoupleMembers couples;
    private final ReminderRegistry reminders;
    private final TimeProvider time;

    public AnniversaryService(NamedParameterJdbcTemplate jdbc, MemoryService memories, MemoryAssembler memoryAssembler,
                              UserRefs users, CoupleMembers couples, ReminderRegistry reminders, TimeProvider time) {
        this.jdbc = jdbc;
        this.memories = memories;
        this.memoryAssembler = memoryAssembler;
        this.users = users;
        this.couples = couples;
        this.reminders = reminders;
        this.time = time;
    }

    // --- Жагсаалт, дэлгэрэнгүй ---

    /**
     * `GET /anniversaries` — `from` өгвөл давтагдах ойн тохиолдлыг түүнээс хойш тооцож `[from, to]`-д шүүнэ;
     * өгөхгүй бол ирэх бүх ой + сүүлийн 30 хоногт өнгөрсөн давтагдахгүй ой.
     */
    @Transactional(readOnly = true)
    public List<Occasion> list(SpaceContext ctx, LocalDate from, LocalDate to, String tz) {
        UserRow viewer = users.row(ctx.userId()).orElseThrow(ApiException::notFound);
        LocalDate today = time.today(zone(tz, viewer));
        LocalDate anchor = from != null ? from : today;
        LocalDate lower = from != null ? from : today.minusDays(PAST_WINDOW_DAYS);
        List<OccasionRow> rows = rows(ctx.spaceId());
        Set<UUID> live = liveMemories(ctx.spaceId(), rows);
        List<Occasion> out = new ArrayList<>();
        for (OccasionRow row : rows) {
            LocalDate next = AutoMilestoneCalculator.nextOn(row.date(), row.recurring(), anchor);
            if (next.isBefore(lower) || (to != null && next.isAfter(to))) {
                continue;
            }
            out.add(occasion(row, next, today, viewer.locale(), live));
        }
        out.sort(Comparator.comparing(Occasion::getNextOn).thenComparing(Occasion::getOccasionKey));
        return out;
    }

    @Transactional(readOnly = true)
    public OccasionDetail detail(SpaceContext ctx, String key) {
        UserRow viewer = users.row(ctx.userId()).orElseThrow(ApiException::notFound);
        OccasionRow row = row(ctx.spaceId(), key).orElseThrow(ApiException::notFound);
        return detail(ctx, row, viewer);
    }

    /** Ойн тэмдэглэл, хавсаргасан дурсамж, сануулга (AC-104, AC-105) — хоёр гишүүн хоёулаа засна. */
    @Transactional
    public OccasionDetail putNote(SpaceContext ctx, String key, OccasionNoteInput in) {
        UserRow viewer = users.row(ctx.userId()).orElseThrow(ApiException::notFound);
        OccasionRow row = row(ctx.spaceId(), key).orElseThrow(ApiException::notFound);
        List<UUID> memoryIds = checkMemories(ctx, in.getMemoryIds());
        Integer[] days = reminderDays(in.getReminderDays());
        String note = blankToNull(in.getNote());
        MapSqlParameterSource p = new MapSqlParameterSource("space", ctx.spaceId()).addValue("key", key)
                .addValue("note", note).addValue("days", days).addValue("now", Timestamp.from(time.now()));
        if (row.source() == Source.CUSTOM) {
            long current = jdbc.queryForObject("SELECT version FROM anniversary WHERE id = :id FOR UPDATE",
                    new MapSqlParameterSource("id", row.anniversaryId()), Long.class);
            requireVersion(in.getVersion(), current, () -> detail(ctx, row, viewer));
            jdbc.update("""
                    UPDATE anniversary SET note = :note, reminder_days = :days, version = version + 1, updated_at = :now
                     WHERE id = :id
                    """, p.addValue("id", row.anniversaryId()));
            setAnniversaryMemories(row.anniversaryId(), memoryIds);
        } else {
            List<Long> current = jdbc.queryForList("SELECT version FROM milestone_note WHERE space_id = :space "
                    + "AND occasion_key = :key FOR UPDATE", p, Long.class);
            requireVersion(in.getVersion(), current.isEmpty() ? 0 : current.get(0), () -> detail(ctx, row, viewer));
            jdbc.update("""
                    INSERT INTO milestone_note (space_id, occasion_key, note, memory_ids, reminder_days, version, updated_at)
                    VALUES (:space, :key, :note, :ids, :days, 1, :now)
                    ON CONFLICT (space_id, occasion_key) DO UPDATE SET note = EXCLUDED.note, memory_ids = EXCLUDED.memory_ids,
                        reminder_days = EXCLUDED.reminder_days, version = milestone_note.version + 1, updated_at = EXCLUDED.updated_at
                    """, p.addValue("ids", memoryIds.toArray(UUID[]::new)));
        }
        OccasionRow updated = row(ctx.spaceId(), key).orElseThrow(ApiException::notFound);
        syncReminders(ctx.spaceId(), updated);
        return detail(ctx, updated, viewer);
    }

    // --- Хэрэглэгчийн ой ---

    @Transactional
    public Anniversary create(SpaceContext ctx, AnniversaryInput in) {
        UUID id = Ids.newId();
        Timestamp now = Timestamp.from(time.now());
        jdbc.update("""
                INSERT INTO anniversary (id, space_id, author_id, title, date, kind, recurring, note, reminder_days,
                    created_at, updated_at)
                VALUES (:id, :space, :author, :title, :date, :kind, :recurring, :note, :days, :now, :now)
                """, new MapSqlParameterSource("id", id).addValue("space", ctx.spaceId()).addValue("author", ctx.userId())
                .addValue("title", in.getTitle().strip()).addValue("date", in.getDate())
                .addValue("kind", in.getKind().getValue()).addValue("recurring", in.getRecurring())
                .addValue("note", blankToNull(in.getNote())).addValue("days", reminderDays(in.getReminderDays()))
                .addValue("now", now));
        syncReminders(ctx.spaceId(), row(ctx.spaceId(), "custom:" + id).orElseThrow());
        return anniversary(ctx, id);
    }

    @Transactional(readOnly = true)
    public Anniversary get(SpaceContext ctx, UUID id) {
        visible(ctx, id);
        return anniversary(ctx, id);
    }

    @Transactional
    public Anniversary update(SpaceContext ctx, UUID id, AnniversaryUpdate in) {
        long version = owned(ctx, id);
        requireVersion(in.getVersion(), version, () -> anniversary(ctx, id));
        List<String> sets = new ArrayList<>();
        MapSqlParameterSource p = new MapSqlParameterSource("id", id).addValue("now", Timestamp.from(time.now()));
        if (in.getTitle() != null) {
            sets.add("title = :title");
            p.addValue("title", in.getTitle().strip());
        }
        if (in.getDate() != null) {
            sets.add("date = :date");
            p.addValue("date", in.getDate());
        }
        if (in.getKind() != null) {
            sets.add("kind = :kind");
            p.addValue("kind", in.getKind().getValue());
        }
        if (in.getRecurring() != null) {
            sets.add("recurring = :recurring");
            p.addValue("recurring", in.getRecurring());
        }
        if (in.getNote() != null) {
            // `openApiNullable=false` — null ба байхгүйг ялгахгүй тул хоосон мөр нь тэмдэглэлийг арилгана
            sets.add("note = :note");
            p.addValue("note", blankToNull(in.getNote()));
        }
        if (in.getReminderDays() != null) {
            sets.add("reminder_days = :days");
            p.addValue("days", reminderDays(in.getReminderDays()));
        }
        sets.add("version = version + 1");
        sets.add("updated_at = :now");
        jdbc.update("UPDATE anniversary SET " + String.join(", ", sets) + " WHERE id = :id", p);
        syncReminders(ctx.spaceId(), row(ctx.spaceId(), "custom:" + id).orElseThrow());
        return anniversary(ctx, id);
    }

    @Transactional
    public void delete(SpaceContext ctx, UUID id) {
        owned(ctx, id);
        jdbc.update("DELETE FROM anniversary WHERE id = :id", new MapSqlParameterSource("id", id));
        jdbc.update("DELETE FROM gift_idea WHERE space_id = :space AND occasion_key = :key",
                new MapSqlParameterSource("space", ctx.spaceId()).addValue("key", "custom:" + id));
        reminders.cancel(SourceType.ANNIVERSARY, id.toString());
    }

    // --- Сануулга (AC-104) ---

    /**
     * Ойн сануулгыг хүлээгдэж буй мөрүүдтэй тулгаж, зөрвөл дахин товлоно. Давтагдах ой өнгөрөх, төрсөн өдөр
     * эсвэл эхэлсэн өдөр солигдох үед `AnniversaryReminderJob` ч үүнийг дуудна.
     */
    @Transactional
    public boolean syncReminders(UUID spaceId, OccasionRow row) {
        String sourceId = reminderSourceId(spaceId, row);
        List<Reminder> expected = expectedReminders(spaceId, row);
        Set<String> want = new TreeSet<>();
        expected.forEach(r -> want.add(r.userId() + "@" + r.fireAt()));
        Set<String> have = new TreeSet<>();
        for (Scheduled s : reminders.pending(SourceType.ANNIVERSARY, sourceId)) {
            have.add(s.userId() + "@" + s.fireAt());
        }
        if (want.equals(have)) {
            return false;
        }
        reminders.replace(spaceId, SourceType.ANNIVERSARY, sourceId, expected);
        return true;
    }

    /** `scheduled_reminder.source_id`: хэрэглэгчийн ойд ID, автомат ойд space + түлхүүрийн тогтвортой UUID. */
    public static String reminderSourceId(UUID spaceId, OccasionRow row) {
        if (row.source() == Source.CUSTOM) {
            return row.anniversaryId().toString();
        }
        return UUID.nameUUIDFromBytes(("occasion|" + spaceId + "|" + row.key()).getBytes(StandardCharsets.UTF_8)).toString();
    }

    List<Reminder> expectedReminders(UUID spaceId, OccasionRow row) {
        List<Reminder> out = new ArrayList<>();
        if (row.reminderDays().isEmpty()) {
            return out;
        }
        Instant now = time.now();
        for (UserRow member : users.rows(couples.members(spaceId)).values()) {
            ZoneId zone = zoneOf(member.timezone());
            LocalDate next = AutoMilestoneCalculator.nextOn(row.date(), row.recurring(), time.today(zone));
            String title = title(row, member.locale());
            for (int days : row.reminderDays()) {
                Instant fireAt = next.minusDays(days).atTime(REMINDER_TIME).atZone(zone).toInstant();
                if (fireAt.isAfter(now)) {
                    out.add(new Reminder(member.id(), fireAt, "ANNIVERSARY_REMINDER",
                            Map.of("title", title, "days", Integer.toString(days)),
                            "/together/occasions/" + row.key()));
                }
            }
        }
        return out;
    }

    /** Сануулгатай ой бүхий идэвхтэй space-ууд (job-д). */
    @Transactional(readOnly = true)
    public List<UUID> spacesWithReminders() {
        return jdbc.queryForList("""
                SELECT DISTINCT x.space_id FROM (
                    SELECT space_id FROM anniversary WHERE cardinality(reminder_days) > 0
                    UNION SELECT space_id FROM milestone_note WHERE cardinality(reminder_days) > 0) x
                  JOIN space s ON s.id = x.space_id WHERE s.status = 'ACTIVE'
                """, new MapSqlParameterSource(), UUID.class);
    }

    // --- Бусад домэйнд (баяр, нүүр) ---

    /** Space-ийн бүх ой (хэрэглэгчийн + автомат + төрсөн өдөр). */
    @Transactional(readOnly = true)
    public List<OccasionRow> rows(UUID spaceId) {
        List<OccasionRow> out = new ArrayList<>();
        MapSqlParameterSource p = new MapSqlParameterSource("space", spaceId);
        Map<UUID, List<UUID>> attached = new HashMap<>();
        jdbc.query("""
                SELECT am.anniversary_id, am.memory_id FROM anniversary_memory am JOIN anniversary a ON a.id = am.anniversary_id
                 WHERE a.space_id = :space ORDER BY am.position
                """, p, rs -> {
            attached.computeIfAbsent(rs.getObject("anniversary_id", UUID.class), k -> new ArrayList<>())
                    .add(rs.getObject("memory_id", UUID.class));
        });
        jdbc.query("""
                SELECT id, author_id, title, date, kind, recurring, note, reminder_days, version
                  FROM anniversary WHERE space_id = :space ORDER BY date, id
                """, p, rs -> {
            UUID id = rs.getObject("id", UUID.class);
            out.add(new OccasionRow("custom:" + id, Source.CUSTOM, id, rs.getObject("author_id", UUID.class), null,
                    rs.getString("title"), AnniversaryKind.fromValue(rs.getString("kind")),
                    rs.getDate("date").toLocalDate(), rs.getBoolean("recurring"), rs.getString("note"),
                    ints(rs.getArray("reminder_days")), attached.getOrDefault(id, List.of()), rs.getLong("version")));
        });
        Map<String, Map<String, Object>> notes = new HashMap<>();
        jdbc.query("SELECT occasion_key, note, memory_ids, reminder_days, version FROM milestone_note WHERE space_id = :space",
                p, rs -> {
                    Map<String, Object> n = new HashMap<>();
                    n.put("note", rs.getString("note"));
                    n.put("memoryIds", uuids(rs.getArray("memory_ids")));
                    n.put("reminderDays", ints(rs.getArray("reminder_days")));
                    n.put("version", rs.getLong("version"));
                    notes.put(rs.getString("occasion_key"), n);
                });
        List<AutoOccasion> autos = new ArrayList<>(AutoMilestoneCalculator.milestones(startDate(spaceId).orElse(null)));
        for (UserRow member : users.rows(couples.members(spaceId)).values()) {
            if (member.birthDate() != null) {
                autos.add(AutoMilestoneCalculator.birthday(member.id(), member.birthDate()));
            }
        }
        for (AutoOccasion auto : autos) {
            Map<String, Object> n = notes.getOrDefault(auto.key(), Map.of());
            @SuppressWarnings("unchecked")
            List<UUID> ids = (List<UUID>) n.getOrDefault("memoryIds", List.of());
            @SuppressWarnings("unchecked")
            List<Integer> days = (List<Integer>) n.getOrDefault("reminderDays", List.of());
            out.add(new OccasionRow(auto.key(), auto.source(), null, null, auto, null, null, auto.date(), auto.recurring(),
                    (String) n.get("note"), days, ids, (Long) n.getOrDefault("version", 0L)));
        }
        return out;
    }

    public Optional<OccasionRow> row(UUID spaceId, String key) {
        if (AutoMilestoneCalculator.sourceOf(key) == null) {
            return Optional.empty();
        }
        return rows(spaceId).stream().filter(r -> r.key().equals(key)).findFirst();
    }

    /** Ойн нэр харагчийн хэлээр — автомат ойн нэрийг mobile өөрөө ч орчуулна. */
    public String title(OccasionRow row, String locale) {
        boolean en = "en".equals(locale);
        if (row.source() == Source.CUSTOM) {
            return row.customTitle();
        }
        AutoOccasion auto = row.auto();
        return switch (auto.source()) {
            case AUTO_DAYS -> en ? auto.n() + " days" : auto.n() + " хоног";
            case AUTO_YEARS -> en ? auto.n() + (auto.n() == 1 ? " year" : " years") : auto.n() + " жил";
            case BIRTHDAY -> {
                String name = users.row(auto.userId()).map(UserRow::shownName).orElse("");
                yield en ? name + "'s birthday" : "Төрсөн өдөр · " + name;
            }
            case CUSTOM -> row.customTitle();
        };
    }

    public static OccasionKind kind(OccasionRow row) {
        return switch (row.source()) {
            case CUSTOM -> OccasionKind.fromValue(row.customKind().getValue());
            case BIRTHDAY -> OccasionKind.BIRTHDAY;
            case AUTO_DAYS, AUTO_YEARS -> OccasionKind.MILESTONE;
        };
    }

    public static ZoneId zoneOf(String tz) {
        try {
            return ZoneId.of(tz);
        } catch (DateTimeException | NullPointerException e) {
            return ZoneId.of("Asia/Ulaanbaatar");
        }
    }

    // --- Дотоод ---

    private Occasion occasion(OccasionRow row, LocalDate next, LocalDate today, String locale, Set<UUID> live) {
        int memoryCount = (int) row.memoryIds().stream().filter(live::contains).count();
        Occasion o = new Occasion(row.key(), OccasionSource.fromValue(row.source().name()), title(row, locale), kind(row),
                row.date(), next, AutoMilestoneCalculator.daysUntil(next, today), row.recurring(),
                new LinkedHashSet<>(row.reminderDays()), memoryCount);
        o.anniversaryId(row.anniversaryId());
        o.daysSince(AutoMilestoneCalculator.daysSince(next, today));
        o.note(row.note());
        return o;
    }

    private OccasionDetail detail(SpaceContext ctx, OccasionRow row, UserRow viewer) {
        LocalDate today = time.today(zoneOf(viewer.timezone()));
        Set<UUID> live = liveMemories(ctx.spaceId(), List.of(row));
        Occasion o = occasion(row, AutoMilestoneCalculator.nextOn(row.date(), row.recurring(), today), today,
                viewer.locale(), live);
        List<MemorySummary> attached = memoryAssembler.summaries(row.memoryIds().stream().filter(live::contains).toList(),
                ctx.userId());
        OccasionDetail d = new OccasionDetail(o, attached, new LinkedHashSet<>(row.reminderDays()), row.version());
        d.note(row.note());
        return d;
    }

    private Anniversary anniversary(SpaceContext ctx, UUID id) {
        OccasionRow row = row(ctx.spaceId(), "custom:" + id).orElseThrow(ApiException::notFound);
        Set<UUID> live = liveMemories(ctx.spaceId(), List.of(row));
        Anniversary a = new Anniversary(id, row.customTitle(), row.date(), row.customKind(), row.recurring(),
                new LinkedHashSet<>(row.reminderDays()), users.ref(row.authorId()),
                memoryAssembler.summaries(row.memoryIds().stream().filter(live::contains).toList(), ctx.userId()),
                row.version());
        a.note(row.note());
        return a;
    }

    /** Space-д байгаа, устгагдаагүй дурсамжууд (хавсралтын тоо ба жагсаалтад). */
    private Set<UUID> liveMemories(UUID spaceId, List<OccasionRow> rows) {
        Set<UUID> ids = new HashSet<>();
        rows.forEach(r -> ids.addAll(r.memoryIds()));
        if (ids.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(jdbc.queryForList("SELECT id FROM memory WHERE id IN (:ids) AND space_id = :space "
                + "AND deleted_at IS NULL", new MapSqlParameterSource("ids", ids).addValue("space", spaceId), UUID.class));
    }

    /** Хавсаргах дурсамж: хүсэгчид харагдах, хосын space-д байгаа (хувийн дурсамж хамтрагчид харагдахгүй). */
    private List<UUID> checkMemories(SpaceContext ctx, List<UUID> ids) {
        List<UUID> unique = new ArrayList<>(new LinkedHashSet<>(ids == null ? List.of() : ids));
        if (unique.size() > MAX_MEMORIES) {
            throw ApiException.validation("memoryIds", ErrorCode.VALIDATION_FAILED);
        }
        var scope = memories.scope(ctx);
        for (UUID id : unique) {
            if (!ctx.spaceId().equals(memories.visible(scope, id).spaceId())) {
                throw ApiException.notFound();
            }
        }
        return unique;
    }

    private void setAnniversaryMemories(UUID anniversaryId, List<UUID> ids) {
        jdbc.update("DELETE FROM anniversary_memory WHERE anniversary_id = :a", new MapSqlParameterSource("a", anniversaryId));
        int position = 0;
        for (UUID id : ids) {
            jdbc.update("INSERT INTO anniversary_memory (anniversary_id, memory_id, position) VALUES (:a, :m, :p)",
                    new MapSqlParameterSource("a", anniversaryId).addValue("m", id).addValue("p", position++));
        }
    }

    private void visible(SpaceContext ctx, UUID id) {
        List<UUID> space = jdbc.queryForList("SELECT space_id FROM anniversary WHERE id = :id",
                new MapSqlParameterSource("id", id), UUID.class);
        if (space.isEmpty() || !space.get(0).equals(ctx.spaceId())) {
            throw ApiException.notFound();
        }
    }

    /** Зохиогчийн ой: өөр space → 404, бусдынх → 403 `NOT_OWNER`. Хувилбарыг буцаана (мөрийг түгжинэ). */
    private long owned(SpaceContext ctx, UUID id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT space_id, author_id, version FROM anniversary WHERE id = :id FOR UPDATE",
                new MapSqlParameterSource("id", id));
        if (rows.isEmpty() || !ctx.spaceId().equals(rows.get(0).get("space_id"))) {
            throw ApiException.notFound();
        }
        if (!ctx.userId().equals(rows.get(0).get("author_id"))) {
            throw new ApiException(ErrorCode.NOT_OWNER, HttpStatus.FORBIDDEN);
        }
        return ((Number) rows.get(0).get("version")).longValue();
    }

    private static void requireVersion(Long given, long current, java.util.function.Supplier<Object> currentView) {
        if (given == null || given != current) {
            throw new ApiException(ErrorCode.VERSION_CONFLICT, HttpStatus.CONFLICT, Map.of("current", currentView.get()));
        }
    }

    private Optional<LocalDate> startDate(UUID spaceId) {
        List<Map<String, Object>> r = jdbc.queryForList(
                "SELECT start_date, start_date_confirmed FROM space WHERE id = :id", new MapSqlParameterSource("id", spaceId));
        if (r.isEmpty() || r.get(0).get("start_date") == null || !Boolean.TRUE.equals(r.get(0).get("start_date_confirmed"))) {
            return Optional.empty();
        }
        return Optional.of(((java.sql.Date) r.get(0).get("start_date")).toLocalDate());
    }

    private static ZoneId zone(String tz, UserRow viewer) {
        if (tz == null || tz.isBlank()) {
            return zoneOf(viewer.timezone());
        }
        try {
            return ZoneId.of(tz);
        } catch (DateTimeException e) {
            throw ApiException.validation("tz", ErrorCode.VALIDATION_FAILED);
        }
    }

    private static Integer[] reminderDays(Set<Integer> days) {
        return days == null ? new Integer[0] : new TreeSet<>(days).descendingSet().toArray(Integer[]::new);
    }

    private static List<Integer> ints(Array array) throws SQLException {
        return array == null ? List.of() : Arrays.asList((Integer[]) array.getArray());
    }

    private static List<UUID> uuids(Array array) throws SQLException {
        return array == null ? List.of() : Arrays.asList((UUID[]) array.getArray());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
