package mn.aura.couple.notification.domain;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** `push_subscription` — төхөөрөмж бүрийн Web Push эсвэл Expo токен (FR-19.3). */
@Repository
public class PushSubscriptionRepository {

    public record SubscriptionRow(UUID id, UUID userId, String kind, String endpoint, String p256dh, String auth,
                                  String expoToken, boolean localReminders) {
    }

    private final JdbcTemplate jdbc;

    public PushSubscriptionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Endpoint/токен давхцвал тухайн мөрийг шинэ эзэн, түлхүүрээр солино (төхөөрөмж дахин бүртгэгдэх). */
    public UUID upsert(UUID id, UUID userId, UUID sessionId, String kind, String endpoint, String p256dh, String auth,
                       String expoToken, boolean localReminders, Instant now) {
        String conflict = "WEB".equals(kind) ? "endpoint" : "expo_token";
        return jdbc.queryForObject("INSERT INTO push_subscription (id, user_id, session_id, kind, endpoint, p256dh, auth, "
                + "expo_token, local_reminders, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
                + "ON CONFLICT (" + conflict + ") DO UPDATE SET user_id = EXCLUDED.user_id, session_id = EXCLUDED.session_id, "
                + "p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, local_reminders = EXCLUDED.local_reminders "
                + "RETURNING id", UUID.class, id, userId, sessionId, kind, endpoint, p256dh, auth, expoToken, localReminders,
                Timestamp.from(now));
    }

    public List<SubscriptionRow> forUser(UUID userId) {
        return jdbc.query("SELECT id, user_id, kind, endpoint, p256dh, auth, expo_token, local_reminders "
                        + "FROM push_subscription WHERE user_id = ?",
                (rs, i) -> new SubscriptionRow(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                        rs.getString("kind"), rs.getString("endpoint"), rs.getString("p256dh"), rs.getString("auth"),
                        rs.getString("expo_token"), rs.getBoolean("local_reminders")), userId);
    }

    public int delete(UUID id, UUID userId) {
        return jdbc.update("DELETE FROM push_subscription WHERE id = ? AND user_id = ?", id, userId);
    }

    /** Push service 404/410 буцаасан — subscription хүчингүй (AC-154). */
    public void deleteById(UUID id) {
        jdbc.update("DELETE FROM push_subscription WHERE id = ?", id);
    }
}
