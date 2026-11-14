package mn.aura.couple.account.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.api.model.FirstWeekState;
import mn.aura.couple.api.model.FirstWeekTask;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Эхний 7 хоногийн даалгавар (FR-16.4, AC-134). Хос холбогдсон өдөр (хосын цагийн бүсээр) = 1-р өдөр;
 * өдөр бүр `mobile/src/content/first-week.json`-ийн тухайн өдрийн нэг даалгавар. Хэрэглэгч бүр өөрөө
 * DONE/SKIPPED тэмдэглэнэ; «Нуух» нь `Preferences.firstWeekHidden`. 8 дахь өдрөөс, хосгүй үед эсвэл
 * нуусан бол `visible = false`, `today` байхгүй (гэрээний `day` 1–7 тул 7-оос хэтрэхгүй).
 */
@Service
public class FirstWeekTasks {

    public static final String RESOURCE = "content/first-week.json";
    static final int DAYS = 7;

    private final JdbcTemplate jdbc;
    private final SpaceAccessGuard spaces;
    private final TimeProvider time;
    /** өдөр → taskKey */
    private final Map<Integer, String> byDay = new LinkedHashMap<>();

    public FirstWeekTasks(JdbcTemplate jdbc, SpaceAccessGuard spaces, TimeProvider time, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.spaces = spaces;
        this.time = time;
        try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
            for (JsonNode item : mapper.readTree(in).path("items")) {
                byDay.put(item.path("day").asInt(), item.path("id").asText());
            }
        } catch (IOException e) {
            throw new UncheckedIOException(RESOURCE + " уншигдсангүй", e);
        }
        for (int d = 1; d <= DAYS; d++) {
            if (!byDay.containsKey(d)) {
                throw new IllegalStateException(RESOURCE + ": " + d + "-р өдрийн даалгавар алга");
            }
        }
    }

    @Transactional(readOnly = true)
    public FirstWeekState state(UUID userId) {
        Optional<Integer> day = coupleDay(userId);
        if (day.isEmpty()) {
            return new FirstWeekState(1, false);
        }
        int d = day.get();
        boolean hidden = Boolean.TRUE.equals(jdbc.query(
                "SELECT first_week_hidden FROM user_preference WHERE user_id = ?",
                rs -> rs.next() ? rs.getBoolean(1) : Boolean.FALSE, userId));
        if (d > DAYS || hidden) {
            return new FirstWeekState(Math.min(d, DAYS), false);
        }
        String key = byDay.get(d);
        List<String> status = jdbc.queryForList(
                "SELECT status FROM first_week_task WHERE user_id = ? AND task_key = ?", String.class, userId, key);
        FirstWeekTask task = new FirstWeekTask(key, d,
                status.isEmpty() ? null : FirstWeekTask.StatusEnum.fromValue(status.get(0)));
        return new FirstWeekState(d, true).today(task);
    }

    /**
     * Өнөөдрийн эсвэл өнгөрсөн өдрийн даалгаврыг тэмдэглэнэ (дахин дуудахад төлөв солигдоно). Үл мэдэгдэх
     * түлхүүр, ирээдүйн өдөр эсвэл хосгүй → 404.
     */
    @Transactional
    public FirstWeekState setStatus(UUID userId, String taskKey, String status) {
        Integer taskDay = byDay.entrySet().stream().filter(e -> e.getValue().equals(taskKey)).map(Map.Entry::getKey)
                .findFirst().orElseThrow(ApiException::notFound);
        int day = coupleDay(userId).orElseThrow(ApiException::notFound);
        if (taskDay > day) {
            throw ApiException.notFound();
        }
        jdbc.update("""
                INSERT INTO first_week_task (user_id, task_key, status, at) VALUES (?, ?, ?, ?)
                ON CONFLICT (user_id, task_key) DO UPDATE SET status = EXCLUDED.status, at = EXCLUDED.at
                """, userId, taskKey, status, Timestamp.from(time.now()));
        return state(userId);
    }

    /** Хос холбогдсон өдрөөс хойших дугаар (1-ээс). SOLO эсвэл холбогдсон огноо алга бол хоосон. */
    private Optional<Integer> coupleDay(UUID userId) {
        Optional<SpaceContext> ctx = spaces.resolve(userId).filter(c -> c.kind() == SpaceContext.Kind.COUPLE);
        if (ctx.isEmpty()) {
            return Optional.empty();
        }
        return jdbc.query("SELECT linked_at, timezone FROM space WHERE id = ?", rs -> {
            if (!rs.next() || rs.getTimestamp(1) == null) {
                return Optional.<Integer>empty();
            }
            ZoneId zone = ZoneId.of(rs.getString(2));
            LocalDate linked = rs.getTimestamp(1).toInstant().atZone(zone).toLocalDate();
            long d = ChronoUnit.DAYS.between(linked, time.today(zone)) + 1;
            return Optional.of((int) Math.max(1, Math.min(d, DAYS + 1)));
        }, ctx.get().spaceId());
    }
}
