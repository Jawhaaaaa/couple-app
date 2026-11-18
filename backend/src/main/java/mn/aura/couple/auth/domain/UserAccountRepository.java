package mn.aura.couple.auth.domain;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.common.id.Ids;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** `users`, `user_preference`, SOLO `space` (DD-AURA-003), `policy_acceptance`. */
@Repository
public class UserAccountRepository {

    private static final String COLUMNS = """
            id, email, password_hash, display_name, call_name, birth_date, timezone, locale, email_verified_at,
            status, require_password, session_version, policy_version, online_visible, typing_visible
            """;

    private final JdbcTemplate jdbc;

    public UserAccountRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<UserAccount> findByEmail(String email) {
        return jdbc.query("SELECT " + COLUMNS + " FROM users WHERE email = ?", UserAccountRepository::map, email)
                .stream().findFirst();
    }

    public Optional<UserAccount> findById(UUID id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM users WHERE id = ?", UserAccountRepository::map, id)
                .stream().findFirst();
    }

    public boolean emailTaken(String email) {
        return !jdbc.queryForList("SELECT 1 FROM users WHERE email = ?", Integer.class, email).isEmpty();
    }

    /**
     * Шинэ хэрэглэгч + тохиргоо + SOLO space (DD-AURA-003) + бодлогын зөвшөөрөл (AC-63).
     * Имэйл давхцвал (зэрэг бүртгэл) хоосон буцаана.
     */
    public Optional<UUID> insert(NewUser u, Instant now) {
        UUID id = Ids.newId();
        List<UUID> created = jdbc.queryForList("""
                INSERT INTO users (id, email, password_hash, display_name, birth_date, timezone, locale,
                                   email_verified_at, policy_version, policy_accepted_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (email) DO NOTHING
                RETURNING id
                """, UUID.class, id, u.email(), u.passwordHash(), u.displayName(), u.birthDate(), u.timezone(),
                u.locale(), ts(u.emailVerifiedAt()), u.policyVersion(), u.policyVersion() == null ? null : ts(now),
                ts(now), ts(now));
        if (created.isEmpty()) {
            return Optional.empty();
        }
        jdbc.update("INSERT INTO user_preference (user_id) VALUES (?)", id);
        if (u.policyVersion() != null) {
            jdbc.update("INSERT INTO policy_acceptance (user_id, version, accepted_at) VALUES (?, ?, ?)",
                    id, u.policyVersion(), ts(now));
        }
        UUID spaceId = Ids.newId();
        jdbc.update("INSERT INTO space (id, kind, timezone, created_at, updated_at) VALUES (?, 'SOLO', ?, ?, ?)",
                spaceId, u.timezone(), ts(now), ts(now));
        jdbc.update("INSERT INTO space_member (space_id, user_id, space_kind, joined_at) VALUES (?, ?, 'SOLO', ?)",
                spaceId, id, ts(now));
        return Optional.of(id);
    }

    public void markEmailVerified(UUID userId, Instant now) {
        jdbc.update("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?",
                ts(now), ts(now), userId);
    }

    public void updatePassword(UUID userId, String hash, Instant now) {
        jdbc.update("UPDATE users SET password_hash = ?, require_password = false, updated_at = ? WHERE id = ?",
                hash, ts(now), userId);
    }

    public void clearRequirePassword(UUID userId) {
        jdbc.update("UPDATE users SET require_password = false WHERE id = ? AND require_password", userId);
    }

    public void setRequirePassword(UUID userId) {
        jdbc.update("UPDATE users SET require_password = true WHERE id = ?", userId);
    }

    public void changeEmail(UUID userId, String newEmail, Instant now) {
        jdbc.update("UPDATE users SET email = ?, email_verified_at = ?, updated_at = ?, version = version + 1 WHERE id = ?",
                newEmail, ts(now), ts(now), userId);
    }

    /** DD-AURA-007: бүх access JWT (`sv`) шууд хүчингүй. */
    public int bumpSessionVersion(UUID userId) {
        return jdbc.queryForObject(
                "UPDATE users SET session_version = session_version + 1 WHERE id = ? RETURNING session_version",
                Integer.class, userId);
    }

    public void acceptPolicy(UUID userId, String version, Instant now) {
        jdbc.update("""
                INSERT INTO policy_acceptance (user_id, version, accepted_at) VALUES (?, ?, ?)
                ON CONFLICT (user_id, version) DO NOTHING
                """, userId, version, ts(now));
        jdbc.update("UPDATE users SET policy_version = ?, policy_accepted_at = ?, updated_at = ? WHERE id = ?",
                version, ts(now), ts(now), userId);
    }

    public record NewUser(String email, String passwordHash, String displayName, LocalDate birthDate, String timezone,
                          String locale, Instant emailVerifiedAt, String policyVersion) {
        @Override
        public String toString() {
            return "NewUser[***]";
        }
    }

    private static Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }

    private static UserAccount map(ResultSet rs, int i) throws SQLException {
        Timestamp verified = rs.getTimestamp("email_verified_at");
        java.sql.Date birth = rs.getDate("birth_date");
        return new UserAccount(
                rs.getObject("id", UUID.class),
                rs.getString("email"),
                rs.getString("password_hash"),
                rs.getString("display_name"),
                rs.getString("call_name"),
                birth == null ? null : birth.toLocalDate(),
                rs.getString("timezone"),
                rs.getString("locale"),
                verified == null ? null : verified.toInstant(),
                rs.getString("status"),
                rs.getBoolean("require_password"),
                rs.getInt("session_version"),
                rs.getString("policy_version"),
                rs.getBoolean("online_visible"),
                rs.getBoolean("typing_visible"));
    }
}
