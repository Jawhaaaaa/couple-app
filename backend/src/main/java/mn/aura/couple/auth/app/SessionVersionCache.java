package mn.aura.couple.auth.app;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Access JWT бүрд DB-ээс session-ийн төлөв унших ачааллыг 5 с-ийн Caffeine кэшээр бууруулна
 * (DD-AURA-007). Revoke хийсэн процесс өөрөө `invalidate…` дуудаж шууд хүчингүй болгоно; бусад
 * тохиолдолд хамгийн ихдээ 5 с хоцорно.
 */
@Component
public class SessionVersionCache {

    static final Duration TTL = Duration.ofSeconds(5);

    /** `device_session` ба `users`-ийн одоогийн төлөв. */
    public record SessionState(UUID userId, boolean sessionRevoked, int sessionVersion, String userStatus) {
    }

    private final JdbcTemplate jdbc;
    private final Cache<UUID, Optional<SessionState>> cache = Caffeine.newBuilder()
            .expireAfterWrite(TTL)
            .maximumSize(100_000)
            .build();

    public SessionVersionCache(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<SessionState> get(UUID sessionId) {
        return cache.get(sessionId, this::load);
    }

    public void invalidateSession(UUID sessionId) {
        cache.invalidate(sessionId);
    }

    public void invalidateUser(UUID userId) {
        cache.asMap().entrySet().removeIf(e -> e.getValue().map(s -> s.userId().equals(userId)).orElse(true));
    }

    private Optional<SessionState> load(UUID sessionId) {
        List<SessionState> rows = jdbc.query("""
                SELECT ds.user_id, ds.revoked_at IS NOT NULL AS revoked, u.session_version, u.status
                  FROM device_session ds JOIN users u ON u.id = ds.user_id
                 WHERE ds.id = ?
                """, (rs, i) -> new SessionState(rs.getObject(1, UUID.class), rs.getBoolean(2), rs.getInt(3),
                rs.getString(4)), sessionId);
        return rows.stream().findFirst();
    }
}
