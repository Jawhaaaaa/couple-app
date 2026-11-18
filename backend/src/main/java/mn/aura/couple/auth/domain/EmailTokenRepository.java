package mn.aura.couple.auth.domain;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.common.id.Ids;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class EmailTokenRepository {

    private static final String COLUMNS = "id, user_id, purpose, code_hash, new_email, expires_at, attempts, consumed_at";

    private final JdbcTemplate jdbc;

    public EmailTokenRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Ижил зорилгын өмнөх идэвхтэй токеныг хүчингүй болгоод шинийг хадгална (сүүлийнх л хүчинтэй). */
    public UUID replace(UUID userId, EmailToken.Purpose purpose, String codeHash, String linkTokenHash, String newEmail,
                        Instant expiresAt, Instant now) {
        jdbc.update("UPDATE email_token SET consumed_at = ? WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL",
                Timestamp.from(now), userId, purpose.name());
        UUID id = Ids.newId();
        jdbc.update("""
                INSERT INTO email_token (id, user_id, purpose, code_hash, link_token_hash, new_email, expires_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, id, userId, purpose.name(), codeHash, linkTokenHash, newEmail, Timestamp.from(expiresAt),
                Timestamp.from(now));
        return id;
    }

    /** Хамгийн сүүлийн ашиглаагүй токен (хугацаа дууссан ч буцаана — `CODE_EXPIRED` ялгахын тулд). */
    public Optional<EmailToken> latestOpen(UUID userId, EmailToken.Purpose purpose) {
        return jdbc.query("SELECT " + COLUMNS + " FROM email_token WHERE user_id = ? AND purpose = ? "
                        + "AND consumed_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE",
                EmailTokenRepository::map, userId, purpose.name()).stream().findFirst();
    }

    public Optional<EmailToken> findByLinkHash(String linkTokenHash, EmailToken.Purpose purpose) {
        return jdbc.query("SELECT " + COLUMNS + " FROM email_token WHERE link_token_hash = ? AND purpose = ? FOR UPDATE",
                EmailTokenRepository::map, linkTokenHash, purpose.name()).stream().findFirst();
    }

    public void incrementAttempts(UUID id) {
        jdbc.update("UPDATE email_token SET attempts = attempts + 1 WHERE id = ?", id);
    }

    /** Нэг удаагийн: аль хэдийн ашигласан бол false. */
    public boolean consume(UUID id, Instant now) {
        return jdbc.update("UPDATE email_token SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL",
                Timestamp.from(now), id) > 0;
    }

    private static EmailToken map(ResultSet rs, int i) throws SQLException {
        Timestamp consumed = rs.getTimestamp("consumed_at");
        return new EmailToken(
                rs.getObject("id", UUID.class),
                rs.getObject("user_id", UUID.class),
                EmailToken.Purpose.valueOf(rs.getString("purpose")),
                rs.getString("code_hash"),
                rs.getString("new_email"),
                rs.getTimestamp("expires_at").toInstant(),
                rs.getInt("attempts"),
                consumed == null ? null : consumed.toInstant());
    }
}
