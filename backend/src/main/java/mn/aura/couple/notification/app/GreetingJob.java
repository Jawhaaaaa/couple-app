package mn.aura.couple.notification.app;

import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.common.job.TestRunnableJob;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.CoupleMembers;
import mn.aura.couple.couple.app.UserRefs;
import mn.aura.couple.notification.app.ReminderRegistry.Reminder;
import mn.aura.couple.notification.app.ReminderRegistry.Scheduled;
import mn.aura.couple.notification.app.ReminderRegistry.SourceType;
import mn.aura.couple.notification.domain.NotificationRepository.SettingRow;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Өглөө/оройн мэндчилгээ (FR-13.5, GAP-26, AC-121). Хостой, мэндчилгээ асаасан хэрэглэгч бүрд дараагийн
 * `greetingMorningAt`/`greetingEveningAt` (анхдагч 08:00 / 22:00) агшныг **хүлээн авагчийн бүсээр** тооцож
 * `scheduled_reminder`-т (GREETING) товлоно; илгээлтийг `ReminderScheduler` (30 с) хийнэ — тэр агшнаас ≤ 5 мин-д.
 * Native төхөөрөмж мөн `GET /reminders`-оор локал товлоно. Унтраасан бол товлосон нь цуцлагдана.
 * Анхдагч асаалттай эсэх нь алс зайн хост эсэхээс (GAP-26, `NotificationPreferenceService`).
 */
@Service
public class GreetingJob implements TestRunnableJob {

    private final NamedParameterJdbcTemplate jdbc;
    private final NotificationPreferenceService preferences;
    private final ReminderRegistry reminders;
    private final CoupleMembers couples;
    private final UserRefs users;
    private final TimeProvider time;

    public GreetingJob(NamedParameterJdbcTemplate jdbc, NotificationPreferenceService preferences,
                       ReminderRegistry reminders, CoupleMembers couples, UserRefs users, TimeProvider time) {
        this.jdbc = jdbc;
        this.preferences = preferences;
        this.reminders = reminders;
        this.couples = couples;
        this.users = users;
        this.time = time;
    }

    @org.springframework.scheduling.annotation.Scheduled(fixedDelayString = "${aura.jobs.greeting-interval:PT5M}")
    @SchedulerLock(name = "greetings", lockAtMostFor = "PT5M")
    public void scheduled() {
        runOnce();
    }

    @Override
    public String name() {
        return "greetings";
    }

    /** Хостой бүх идэвхтэй хэрэглэгчийн мэндчилгээг тохиргоотой нь тааруулна; өөрчлөгдсөн тоог буцаана. */
    @Override
    @Transactional
    public int runOnce() {
        List<Map<String, Object>> members = jdbc.queryForList("""
                SELECT sm.user_id, sm.space_id, u.timezone FROM space_member sm
                  JOIN space s ON s.id = sm.space_id JOIN users u ON u.id = sm.user_id
                 WHERE sm.space_kind = 'COUPLE' AND sm.left_at IS NULL AND s.status = 'ACTIVE' AND u.status = 'ACTIVE'
                """, new MapSqlParameterSource());
        int changed = 0;
        for (Map<String, Object> m : members) {
            UUID userId = (UUID) m.get("user_id");
            UUID spaceId = (UUID) m.get("space_id");
            SettingRow s = preferences.load(userId);
            ZoneId zone = zone((String) m.get("timezone"));
            changed += sync(userId, spaceId, zone, "MORNING", s.greetingMorning(), s.greetingMorningAt(), "GREETING_MORNING");
            changed += sync(userId, spaceId, zone, "EVENING", s.greetingEvening(), s.greetingEveningAt(), "GREETING_EVENING");
        }
        return changed;
    }

    private int sync(UUID userId, UUID spaceId, ZoneId zone, String slot, boolean enabled, LocalTime at, String kind) {
        String source = userId + ":" + slot;
        List<Scheduled> pending = reminders.pending(SourceType.GREETING, source);
        if (!enabled || at == null) {
            if (!pending.isEmpty()) {
                reminders.cancel(SourceType.GREETING, source);
                return 1;
            }
            return 0;
        }
        Instant now = time.now();
        Instant next = next(now, zone, at);
        if (pending.size() == 1 && (pending.get(0).fireAt().equals(next) || !pending.get(0).fireAt().isAfter(now))) {
            return 0; // аль хэдийн зөв товлосон, эсвэл хугацаа болж илгээгдэхээ хүлээж буй
        }
        String partner = couples.partnerIn(spaceId, userId).map(p -> users.ref(p).getDisplayName()).orElse("");
        List<Reminder> list = new ArrayList<>();
        list.add(new Reminder(userId, next, kind, Map.of("partner", partner), "/home"));
        reminders.replace(spaceId, SourceType.GREETING, source, list);
        return 1;
    }

    /** `at` локал цагийн одооноос хойших хамгийн ойрын агшин (тухайн бүсээр). */
    static Instant next(Instant now, ZoneId zone, LocalTime at) {
        ZonedDateTime local = now.atZone(zone);
        ZonedDateTime today = local.toLocalDate().atTime(at).atZone(zone);
        return (today.toInstant().isAfter(now) ? today : today.plusDays(1)).toInstant();
    }

    private static ZoneId zone(String tz) {
        try {
            return ZoneId.of(tz);
        } catch (RuntimeException e) {
            return ZoneId.of("Asia/Ulaanbaatar");
        }
    }
}
