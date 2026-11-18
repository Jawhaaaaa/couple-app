package mn.aura.couple.notification.app;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Хуваарьт сануулгын бүртгэл (`scheduled_reminder`, FR-19.4). Эх объект (болзоо, ой, захидал)
 * өөрчлөгдөх, цуцлагдах бүрд `replace`-ээр хуучин PENDING мөрүүдийг цуцалж шинийг бичнэ — хуучин
 * сануулга явахгүй (AC-35). Өнгөрсөн цагтай сануулга бичигдэхгүй. Илгээлт `ReminderScheduler`-т (T-68).
 */
@Service
public class ReminderRegistry {

    public enum SourceType { DATE_PLAN, ANNIVERSARY, LETTER, GREETING, INACTIVITY }

    /** Нэг сануулга: хэнд, хэзээ, ямар мэдэгдлийн төрлөөр (`notifications.json`-ийн `type`). */
    public record Reminder(UUID userId, Instant fireAt, String kind, Map<String, String> params, String deepLink) {
    }

    public record Scheduled(UUID id, UUID userId, String kind, Instant fireAt, String status) {
    }

    /** Сануулга илгээгдлээ — эх домэйн дараагийн давталтыг нөхөж товлоно (жишээ нь давтагдах болзоо). */
    public record Fired(SourceType type, String sourceId, UUID userId) {
    }

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final TimeProvider time;

    public ReminderRegistry(JdbcTemplate jdbc, ObjectMapper mapper, TimeProvider time) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.time = time;
    }

    /** Эх объектын бүх PENDING сануулгыг цуцалж, шинэ жагсаалтыг товлоно. */
    @Transactional
    public void replace(UUID spaceId, SourceType type, String sourceId, List<Reminder> reminders) {
        cancel(type, sourceId);
        Instant now = time.now();
        for (Reminder r : reminders) {
            if (!r.fireAt().isAfter(now)) {
                continue;
            }
            jdbc.update("""
                    INSERT INTO scheduled_reminder (id, user_id, space_id, source_type, source_id, kind, params, deep_link, fire_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?)
                    """, Ids.newId(), r.userId(), spaceId, type.name(), sourceId, r.kind(), json(r.params()),
                    r.deepLink(), Timestamp.from(r.fireAt()));
        }
    }

    @Transactional
    public void cancel(SourceType type, String sourceId) {
        jdbc.update("UPDATE scheduled_reminder SET status = 'CANCELLED' WHERE source_type = ? AND source_id = ? "
                + "AND status = 'PENDING'", type.name(), sourceId);
    }

    @Transactional(readOnly = true)
    public List<Scheduled> pending(SourceType type, String sourceId) {
        return jdbc.query("SELECT id, user_id, kind, fire_at, status FROM scheduled_reminder WHERE source_type = ? "
                        + "AND source_id = ? AND status = 'PENDING' ORDER BY fire_at, user_id",
                (rs, i) -> new Scheduled(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                        rs.getString("kind"), rs.getTimestamp("fire_at").toInstant(), rs.getString("status")),
                type.name(), sourceId);
    }

    private String json(Map<String, String> params) {
        try {
            return mapper.writeValueAsString(params == null ? Map.of() : params);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
