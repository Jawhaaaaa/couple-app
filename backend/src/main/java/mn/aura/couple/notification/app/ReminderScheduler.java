package mn.aura.couple.notification.app;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.api.model.Reminder;
import mn.aura.couple.common.event.Notify;
import mn.aura.couple.common.job.TestRunnableJob;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.notification.app.ReminderRegistry.Fired;
import mn.aura.couple.notification.app.ReminderRegistry.SourceType;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Хуваарьт сануулгын илгээгч (FR-19.4, DD-AURA-023, AC-35, AC-104, AC-155, AC-180): 30 с тутам `scheduled_reminder`-ийн
 * хугацаа болсон PENDING мөрийг апп доторх мэдэгдэл + push болгоно (DND, тайван горим, нуух дүрэм `NotificationDispatcher`-т).
 * Native локал сануулгатай төхөөрөмж (`localReminders`) ижил сануулгыг `GET /reminders`-оор өөрөө товлосон тул тэр
 * subscription-д серверийн push явахгүй — давхардахгүй. 6 цагаас илүү хоцорсон сануулга (сервер унтарсан г.м.) явахгүй.
 */
@Service
public class ReminderScheduler implements TestRunnableJob {

    static final int BATCH = 500;
    static final Duration STALE = Duration.ofHours(6);
    static final Duration DEFAULT_HORIZON = Duration.ofDays(60);

    private final NamedParameterJdbcTemplate jdbc;
    private final NotificationDispatcher dispatcher;
    private final NotificationTexts texts;
    private final ApplicationEventPublisher events;
    private final ObjectMapper mapper;
    private final TimeProvider time;

    public ReminderScheduler(NamedParameterJdbcTemplate jdbc, NotificationDispatcher dispatcher, NotificationTexts texts,
                             ApplicationEventPublisher events, ObjectMapper mapper, TimeProvider time) {
        this.jdbc = jdbc;
        this.dispatcher = dispatcher;
        this.texts = texts;
        this.events = events;
        this.mapper = mapper;
        this.time = time;
    }

    @Scheduled(fixedDelayString = "${aura.jobs.reminder-interval:PT30S}")
    @SchedulerLock(name = "reminders", lockAtMostFor = "PT5M")
    public void scheduled() {
        runOnce();
    }

    @Override
    public String name() {
        return "reminders";
    }

    @Override
    @Transactional
    public int runOnce() {
        Instant now = time.now();
        List<Map<String, Object>> due = jdbc.queryForList("""
                SELECT r.id, r.user_id, r.space_id, r.source_type, r.source_id, r.kind, r.params::text AS params, r.deep_link,
                       r.fire_at
                  FROM scheduled_reminder r JOIN users u ON u.id = r.user_id
                 WHERE r.status = 'PENDING' AND r.fire_at <= :now AND u.status = 'ACTIVE'
                 ORDER BY r.fire_at LIMIT :limit FOR UPDATE OF r SKIP LOCKED
                """, new MapSqlParameterSource("now", Timestamp.from(now)).addValue("limit", BATCH));
        int sent = 0;
        for (Map<String, Object> r : due) {
            UUID id = (UUID) r.get("id");
            Instant fireAt = ((Timestamp) r.get("fire_at")).toInstant();
            boolean stale = fireAt.isBefore(now.minus(STALE));
            jdbc.update("UPDATE scheduled_reminder SET status = :st WHERE id = :id",
                    new MapSqlParameterSource("id", id).addValue("st", stale ? "CANCELLED" : "SENT"));
            SourceType type = SourceType.valueOf((String) r.get("source_type"));
            if (!stale) {
                dispatcher.dispatch(new Notify((UUID) r.get("user_id"), (UUID) r.get("space_id"), null,
                        (String) r.get("kind"), params((String) r.get("params")), (String) r.get("deep_link")),
                        type != SourceType.INACTIVITY);
                sent++;
            }
            events.publishEvent(new Fired(type, (String) r.get("source_id"), (UUID) r.get("user_id")));
        }
        return sent;
    }

    /** `GET /reminders` (AC-180): native төхөөрөмж локал товлох PENDING сануулгууд, хэрэглэгчийн хэлээр гарчигтай. */
    @Transactional(readOnly = true)
    public List<Reminder> list(UUID userId, OffsetDateTime from, OffsetDateTime to) {
        Instant now = time.now();
        Instant lo = from == null ? now : from.toInstant();
        Instant hi = to == null ? lo.plus(DEFAULT_HORIZON) : to.toInstant();
        List<String> locales = jdbc.queryForList("SELECT locale FROM users WHERE id = :u",
                new MapSqlParameterSource("u", userId), String.class);
        String locale = locales.isEmpty() ? "mn" : locales.get(0);
        return jdbc.query("""
                SELECT id, source_type, source_id, kind, params::text AS params, deep_link, fire_at FROM scheduled_reminder
                 WHERE user_id = :u AND status = 'PENDING' AND fire_at >= :lo AND fire_at <= :hi ORDER BY fire_at, id
                """, new MapSqlParameterSource("u", userId).addValue("lo", Timestamp.from(lo)).addValue("hi", Timestamp.from(hi)),
                (rs, i) -> {
                    Map<String, String> params = params(rs.getString("params"));
                    Reminder r = new Reminder(rs.getObject("id", UUID.class),
                            Reminder.SourceTypeEnum.fromValue(rs.getString("source_type")), null,
                            OffsetDateTime.ofInstant(rs.getTimestamp("fire_at").toInstant(), ZoneOffset.UTC),
                            texts.renderFirst(rs.getString("kind"), locale, params).title(), rs.getString("deep_link"));
                    r.sourceId(uuidOrNull(rs.getString("source_id")));
                    return r;
                });
    }

    private Map<String, String> params(String json) {
        try {
            return json == null ? Map.of() : mapper.readValue(json, new TypeReference<Map<String, String>>() { });
        } catch (Exception e) {
            return Map.of();
        }
    }

    private static UUID uuidOrNull(String s) {
        try {
            return s == null ? null : UUID.fromString(s);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
