package mn.aura.couple.auth.domain;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** `refresh_token` — зөвхөн SHA-256 hash хадгална. */
@Repository
public class RefreshTokenRepository {

    public record Row(UUID id, UUID sessionId, Instant expiresAt, Instant rotatedAt) {
    }

    private final JdbcTemplate jdbc;

    public RefreshTokenRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(UUID id, UUID sessionId, String tokenHash, Instant expiresAt, Instant now) {
        jdbc.update("INSERT INTO refresh_token (id, session_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
                id, sessionId, tokenHash, Timestamp.from(expiresAt), Timestamp.from(now));
    }

    public Optional<Row> findByHash(String tokenHash) {
        return jdbc.query("SELECT id, session_id, expires_at, rotated_at FROM refresh_token WHERE token_hash = ?",
                (rs, i) -> new Row(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class),
                        rs.getTimestamp(3).toInstant(),
                        rs.getTimestamp(4) == null ? null : rs.getTimestamp(4).toInstant()),
                tokenHash).stream().findFirst();
    }

    /** Нэг л удаа амжилттай — зэрэг хоёр rotation-ийн хоёр дахь нь false (давхар ашиглалт). */
    public boolean markRotated(UUID id, UUID replacedBy, Instant now) {
        return jdbc.update("UPDATE refresh_token SET rotated_at = ?, replaced_by = ? WHERE id = ? AND rotated_at IS NULL",
                Timestamp.from(now), replacedBy, id) > 0;
    }
}
