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
public class OAuthLoginRepository {

    private final JdbcTemplate jdbc;

    public OAuthLoginRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public UUID insert(String provider, String subject, String email, String displayName, String client,
                       String exchangeCodeHash, Instant exchangeExpiresAt, Instant now) {
        UUID id = Ids.newId();
        jdbc.update("""
                INSERT INTO oauth_login (id, provider, subject, email, display_name, client, exchange_code_hash,
                                         exchange_expires_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, id, provider, subject, email, displayName, client, exchangeCodeHash,
                Timestamp.from(exchangeExpiresAt), Timestamp.from(now));
        return id;
    }

    public Optional<OAuthLogin> findByExchangeHash(String hash) {
        return jdbc.query("SELECT * FROM oauth_login WHERE exchange_code_hash = ? FOR UPDATE",
                OAuthLoginRepository::map, hash).stream().findFirst();
    }

    public Optional<OAuthLogin> findByLinkHash(String hash) {
        return jdbc.query("SELECT * FROM oauth_login WHERE link_token_hash = ? FOR UPDATE",
                OAuthLoginRepository::map, hash).stream().findFirst();
    }

    public void markExchanged(UUID id, String deviceName, String devicePlatform, Instant now) {
        jdbc.update("UPDATE oauth_login SET exchanged_at = ?, device_name = ?, device_platform = ? WHERE id = ?",
                Timestamp.from(now), deviceName, devicePlatform, id);
    }

    public void requireLink(UUID id, UUID userId, String linkTokenHash, Instant linkExpiresAt) {
        jdbc.update("UPDATE oauth_login SET link_user_id = ?, link_token_hash = ?, link_expires_at = ? WHERE id = ?",
                userId, linkTokenHash, Timestamp.from(linkExpiresAt), id);
    }

    public void markLinked(UUID id, Instant now) {
        jdbc.update("UPDATE oauth_login SET linked_at = ? WHERE id = ?", Timestamp.from(now), id);
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }

    private static OAuthLogin map(ResultSet rs, int i) throws SQLException {
        return new OAuthLogin(
                rs.getObject("id", UUID.class),
                rs.getString("provider"),
                rs.getString("subject"),
                rs.getString("email"),
                rs.getString("display_name"),
                rs.getString("client"),
                instant(rs, "exchange_expires_at"),
                instant(rs, "exchanged_at"),
                rs.getObject("link_user_id", UUID.class),
                instant(rs, "link_expires_at"),
                instant(rs, "linked_at"),
                rs.getString("device_name"),
                rs.getString("device_platform"));
    }
}
