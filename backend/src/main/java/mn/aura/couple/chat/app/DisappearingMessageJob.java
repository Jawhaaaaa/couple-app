package mn.aura.couple.chat.app;

import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import mn.aura.couple.chat.app.ChatMessageAssembler.Row;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.job.TestRunnableJob;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.CoupleMembers;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Алга болдог мессеж (FR-6.9, AC-92, DD-AURA-010): `expires_at = read_at + disappear_seconds` болмогц 2 с тутмын
 * ажил агуулга, байршил, медиа, реакц, pin-ийг серверээс устгаж (INV-05, AC-30), хоёр гишүүнд `chat.expired`
 * илгээнэ. Уншаагүй мессежийн `expires_at` NULL тул тоолуур эхлэхгүй.
 *
 * <p>Ажил гүйхээс өмнөх 0–2 с-д ч жагсаалт, хайлт, pin нь `expires_at`-ээр шүүдэг тул хугацаа дууссан мессеж
 * API-д гарахгүй.
 */
@Service
public class DisappearingMessageJob implements TestRunnableJob {

    static final int BATCH = 200;

    private final NamedParameterJdbcTemplate jdbc;
    private final ChatMessageService messages;
    private final CoupleMembers couples;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;

    public DisappearingMessageJob(NamedParameterJdbcTemplate jdbc, ChatMessageService messages, CoupleMembers couples,
                                  ApplicationEventPublisher events, TimeProvider time) {
        this.jdbc = jdbc;
        this.messages = messages;
        this.couples = couples;
        this.events = events;
        this.time = time;
    }

    @Scheduled(fixedDelayString = "${aura.jobs.disappearing-interval:PT2S}")
    @SchedulerLock(name = "disappearingMessages", lockAtMostFor = "PT1M")
    public void scheduled() {
        runOnce();
    }

    @Override
    public String name() {
        return "disappearingMessages";
    }

    @Override
    @Transactional
    public int runOnce() {
        var now = time.now();
        List<Row> due = jdbc.query("SELECT " + ChatMessageAssembler.COLUMNS + " FROM chat_message m "
                        + "WHERE m.expires_at IS NOT NULL AND m.expires_at <= :now AND m.deleted_at IS NULL "
                        + "ORDER BY m.expires_at LIMIT :limit FOR UPDATE SKIP LOCKED",
                new MapSqlParameterSource("now", Timestamp.from(now)).addValue("limit", BATCH),
                (rs, i) -> ChatMessageAssembler.map(rs));
        for (Row row : due) {
            messages.erase(row, now);
            events.publishEvent(RealtimeEvent.of("chat.expired", null, couples.members(row.spaceId()),
                    Map.of("messageId", row.id())));
        }
        return due.size();
    }
}
