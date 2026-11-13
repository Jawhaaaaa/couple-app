package mn.aura.couple.notification.app;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.common.event.Notify;
import mn.aura.couple.common.job.TestRunnableJob;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.CoupleMembers;
import mn.aura.couple.couple.app.UserRefs;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Идэвхгүй хэрэглэгчийн зөөлөн сануулга (FR-13.6, AC-122): 7 хоног апп нээгээгүй (сүүлийн идэвх = presence,
 * session-ийн сүүлийн хэрэглээ, бүртгүүлсэн агшны хамгийн сүүлийнх) хостой хэрэглэгчид зэмлэлгүй
 * `INACTIVITY_NUDGE` (Б.3) — 7 хоногт ≤ 1. Хоосон байсаар байвал дараагийнх нь өмнөхөөс 7 хоногийн дараа.
 * «Бүү саад бол», тайван горимыг `NotificationDispatcher` мөрдөнө.
 */
@Service
public class InactivityReminderJob implements TestRunnableJob {

    public static final String TYPE = "INACTIVITY_NUDGE";
    static final Duration INACTIVE = Duration.ofDays(7);
    static final int BATCH = 500;

    private final NamedParameterJdbcTemplate jdbc;
    private final NotificationDispatcher dispatcher;
    private final CoupleMembers couples;
    private final UserRefs users;
    private final TimeProvider time;

    public InactivityReminderJob(NamedParameterJdbcTemplate jdbc, NotificationDispatcher dispatcher, CoupleMembers couples,
                                 UserRefs users, TimeProvider time) {
        this.jdbc = jdbc;
        this.dispatcher = dispatcher;
        this.couples = couples;
        this.users = users;
        this.time = time;
    }

    @Scheduled(fixedDelayString = "${aura.jobs.inactivity-interval:PT1H}", initialDelayString = "PT10M")
    @SchedulerLock(name = "inactivity", lockAtMostFor = "PT30M")
    public void scheduled() {
        runOnce();
    }

    @Override
    public String name() {
        return "inactivity";
    }

    @Override
    @Transactional
    public int runOnce() {
        int total = 0;
        int n;
        do {
            n = batch();
            total += n;
        } while (n == BATCH);
        return total;
    }

    private int batch() {
        Instant now = time.now();
        Timestamp cutoff = Timestamp.from(now.minus(INACTIVE));
        List<Map<String, Object>> idle = jdbc.queryForList("""
                SELECT u.id AS user_id, sm.space_id FROM users u
                  JOIN space_member sm ON sm.user_id = u.id AND sm.space_kind = 'COUPLE' AND sm.left_at IS NULL
                  JOIN space s ON s.id = sm.space_id AND s.status = 'ACTIVE'
                 WHERE u.status = 'ACTIVE'
                   AND greatest(u.created_at, coalesce(u.last_active_at, u.created_at),
                                coalesce((SELECT max(d.last_used_at) FROM device_session d WHERE d.user_id = u.id), u.created_at))
                       <= :cutoff
                   AND NOT EXISTS (SELECT 1 FROM notification n WHERE n.user_id = u.id AND n.type = :type
                                    AND n.created_at > :cutoff)
                 ORDER BY u.id LIMIT :limit
                """, new MapSqlParameterSource("cutoff", cutoff).addValue("type", TYPE).addValue("limit", BATCH));
        for (Map<String, Object> r : idle) {
            UUID userId = (UUID) r.get("user_id");
            UUID spaceId = (UUID) r.get("space_id");
            String partner = couples.partnerIn(spaceId, userId).map(p -> users.ref(p).getDisplayName()).orElse("");
            dispatcher.dispatch(new Notify(userId, spaceId, null, TYPE, Map.of("partner", partner), "/home"));
        }
        return idle.size();
    }
}
