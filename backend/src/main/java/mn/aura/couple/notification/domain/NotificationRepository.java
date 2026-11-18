package mn.aura.couple.notification.domain;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Time;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** `notification`, `notification_setting`, `push_outbox` (T-25, DD-AURA-022). */
@Repository
public class NotificationRepository {

    private static final TypeReference<Map<String, String>> PARAMS = new TypeReference<>() {
    };

    public record NotificationRow(UUID id, UUID userId, UUID spaceId, String type, String variantId,
                                  Map<String, String> params, String deepLink, Instant createdAt, Instant readAt) {
    }

    public record SettingRow(UUID userId, LocalTime dndStart, LocalTime dndEnd, boolean hideContent,
                             boolean greetingMorning, boolean greetingEvening, LocalTime greetingMorningAt,
                             LocalTime greetingEveningAt, Instant quietUntil, Set<String> disabledTypes) {
    }

    /** `skipLocal` — сануулгын push: native локал сануулгатай subscription-д илгээхгүй (DD-AURA-023). */
    public record OutboxRow(UUID id, UUID userId, UUID notificationId, Instant deliverAfter, boolean deferred,
                            boolean skipLocal) {
    }

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public NotificationRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public void insert(NotificationRow n) {
        jdbc.update("""
                INSERT INTO notification (id, user_id, space_id, type, variant_id, params, deep_link, created_at)
                VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?)
                """, n.id(), n.userId(), n.spaceId(), n.type(), n.variantId(), json(n.params()), n.deepLink(),
                ts(n.createdAt()));
    }

    /** Шинээс хуучин руу; `before` = (created_at, id) cursor. */
    public List<NotificationRow> page(UUID userId, Instant beforeAt, UUID beforeId, int limit) {
        if (beforeAt == null) {
            return jdbc.query("SELECT * FROM notification WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
                    this::map, userId, limit);
        }
        return jdbc.query("""
                SELECT * FROM notification WHERE user_id = ? AND (created_at, id) < (?, ?)
                 ORDER BY created_at DESC, id DESC LIMIT ?
                """, this::map, userId, ts(beforeAt), beforeId, limit);
    }

    public Optional<NotificationRow> find(UUID id) {
        return jdbc.query("SELECT * FROM notification WHERE id = ?", this::map, id).stream().findFirst();
    }

    public int unreadCount(UUID userId) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM notification WHERE user_id = ? AND read_at IS NULL",
                Integer.class, userId);
        return n == null ? 0 : n;
    }

    public int markRead(UUID userId, UUID id, Instant now) {
        return jdbc.update("UPDATE notification SET read_at = coalesce(read_at, ?) WHERE id = ? AND user_id = ?",
                ts(now), id, userId);
    }

    public int markAllRead(UUID userId, Instant now) {
        return jdbc.update("UPDATE notification SET read_at = ? WHERE user_id = ? AND read_at IS NULL", ts(now), userId);
    }

    public Optional<SettingRow> settings(UUID userId) {
        return jdbc.query("SELECT * FROM notification_setting WHERE user_id = ?", (rs, i) -> new SettingRow(
                rs.getObject("user_id", UUID.class), time(rs, "dnd_start"), time(rs, "dnd_end"),
                rs.getBoolean("hide_content"), rs.getBoolean("greeting_morning"), rs.getBoolean("greeting_evening"),
                time(rs, "greeting_morning_at"), time(rs, "greeting_evening_at"), instant(rs, "quiet_until"),
                textArray(rs.getArray("disabled_types"))), userId).stream().findFirst();
    }

    /** Анхдагч мөр (байхгүй бол) — мэндчилгээний анхдагчийг дуудагч тооцно (GAP-26). */
    public void ensureSettings(UUID userId, boolean greetingsDefault) {
        jdbc.update("""
                INSERT INTO notification_setting (user_id, greeting_morning, greeting_evening)
                VALUES (?, ?, ?) ON CONFLICT (user_id) DO NOTHING
                """, userId, greetingsDefault, greetingsDefault);
    }

    public void saveSettings(SettingRow s, Instant now) {
        jdbc.update(con -> {
            var ps = con.prepareStatement("""
                    UPDATE notification_setting SET dnd_start = ?, dnd_end = ?, hide_content = ?, greeting_morning = ?,
                           greeting_evening = ?, greeting_morning_at = ?, greeting_evening_at = ?, disabled_types = ?,
                           updated_at = ?
                     WHERE user_id = ?
                    """);
            ps.setTime(1, Time.valueOf(s.dndStart()));
            ps.setTime(2, Time.valueOf(s.dndEnd()));
            ps.setBoolean(3, s.hideContent());
            ps.setBoolean(4, s.greetingMorning());
            ps.setBoolean(5, s.greetingEvening());
            ps.setTime(6, Time.valueOf(s.greetingMorningAt()));
            ps.setTime(7, Time.valueOf(s.greetingEveningAt()));
            ps.setArray(8, con.createArrayOf("text", s.disabledTypes().toArray()));
            ps.setTimestamp(9, ts(now));
            ps.setObject(10, s.userId());
            return ps;
        });
    }

    public void setQuietUntil(UUID userId, Instant until) {
        jdbc.update("UPDATE notification_setting SET quiet_until = ?, updated_at = now() WHERE user_id = ?", ts(until), userId);
    }

    public void enqueuePush(UUID id, UUID userId, UUID notificationId, Instant deliverAfter, boolean deferred) {
        enqueuePush(id, userId, notificationId, deliverAfter, deferred, false);
    }

    public void enqueuePush(UUID id, UUID userId, UUID notificationId, Instant deliverAfter, boolean deferred,
                            boolean skipLocal) {
        jdbc.update("INSERT INTO push_outbox (id, user_id, notification_id, deliver_after, deferred, skip_local) "
                + "VALUES (?, ?, ?, ?, ?, ?)", id, userId, notificationId, ts(deliverAfter), deferred, skipLocal);
    }

    /** Хугацаа нь болсон PENDING мөрүүдийг түгжиж авна (олон процесс/thread давхар илгээхгүй). */
    public List<OutboxRow> lockDue(Instant now, UUID onlyUser, int limit) {
        String sql = "SELECT id, user_id, notification_id, deliver_after, deferred, skip_local FROM push_outbox "
                + "WHERE status = 'PENDING' AND deliver_after <= ?" + (onlyUser == null ? "" : " AND user_id = ?")
                + " ORDER BY deliver_after, id LIMIT ? FOR UPDATE SKIP LOCKED";
        Object[] args = onlyUser == null ? new Object[] {ts(now), limit} : new Object[] {ts(now), onlyUser, limit};
        return jdbc.query(sql, (rs, i) -> new OutboxRow(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                rs.getObject("notification_id", UUID.class), instant(rs, "deliver_after"), rs.getBoolean("deferred"),
                rs.getBoolean("skip_local")), args);
    }

    public void markOutbox(List<UUID> ids, String status, Instant now) {
        for (UUID id : ids) {
            jdbc.update("UPDATE push_outbox SET status = ?, sent_at = ? WHERE id = ?", status, ts(now), id);
        }
    }

    public String locale(UUID userId) {
        return jdbc.queryForList("SELECT locale FROM users WHERE id = ?", String.class, userId).stream().findFirst().orElse("mn");
    }

    public String timezone(UUID userId) {
        return jdbc.queryForList("SELECT timezone FROM users WHERE id = ?", String.class, userId).stream().findFirst()
                .orElse("Asia/Ulaanbaatar");
    }

    private NotificationRow map(ResultSet rs, int i) throws SQLException {
        return new NotificationRow(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                rs.getObject("space_id", UUID.class), rs.getString("type"), rs.getString("variant_id"),
                parse(rs.getString("params")), rs.getString("deep_link"), instant(rs, "created_at"),
                instant(rs, "read_at"));
    }

    private Map<String, String> parse(String json) {
        try {
            return json == null ? Map.of() : mapper.readValue(json, PARAMS);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("notification.params задлах боломжгүй", e);
        }
    }

    private String json(Map<String, String> params) {
        try {
            return mapper.writeValueAsString(params);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static Set<String> textArray(Array array) throws SQLException {
        return array == null ? Set.of() : Set.copyOf(Arrays.asList((String[]) array.getArray()));
    }

    private static LocalTime time(ResultSet rs, String col) throws SQLException {
        Time t = rs.getTime(col);
        return t == null ? null : t.toLocalTime();
    }

    private static Instant instant(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }

    private static Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }
}
