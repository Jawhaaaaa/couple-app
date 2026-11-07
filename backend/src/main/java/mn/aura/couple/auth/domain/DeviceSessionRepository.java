package mn.aura.couple.auth.domain;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class DeviceSessionRepository {

    private final JdbcTemplate jdbc;

    public DeviceSessionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(DeviceSession s) {
        jdbc.update("""
                INSERT INTO device_session (id, user_id, device_name, platform, created_at, last_used_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """, s.id(), s.userId(), s.deviceName(), s.platform().name(), Timestamp.from(s.createdAt()),
                Timestamp.from(s.lastUsedAt()));
    }

    public Optional<DeviceSession> findById(UUID id) {
        return jdbc.query("SELECT * FROM device_session WHERE id = ?", DeviceSessionRepository::map, id)
                .stream().findFirst();
    }

    public List<DeviceSession> findActiveByUser(UUID userId) {
        return jdbc.query(
                "SELECT * FROM device_session WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_used_at DESC",
                DeviceSessionRepository::map, userId);
    }

    public void touch(UUID id, Instant now) {
        jdbc.update("UPDATE device_session SET last_used_at = ? WHERE id = ?", Timestamp.from(now), id);
    }

    public boolean revoke(UUID id, DeviceSession.RevokedReason reason, Instant now) {
        return jdbc.update(
                "UPDATE device_session SET revoked_at = ?, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL",
                Timestamp.from(now), reason.name(), id) > 0;
    }

    /** Хэрэглэгчийн бүх идэвхтэй session-ийг (`except` өгвөл түүнээс бусдыг) хаана. */
    public List<UUID> revokeAll(UUID userId, DeviceSession.RevokedReason reason, Instant now, UUID except) {
        if (except == null) {
            return jdbc.queryForList("""
                    UPDATE device_session SET revoked_at = ?, revoked_reason = ?
                     WHERE user_id = ? AND revoked_at IS NULL
                    RETURNING id
                    """, UUID.class, Timestamp.from(now), reason.name(), userId);
        }
        return jdbc.queryForList("""
                UPDATE device_session SET revoked_at = ?, revoked_reason = ?
                 WHERE user_id = ? AND revoked_at IS NULL AND id <> ?
                RETURNING id
                """, UUID.class, Timestamp.from(now), reason.name(), userId, except);
    }

    private static DeviceSession map(ResultSet rs, int i) throws SQLException {
        Timestamp revoked = rs.getTimestamp("revoked_at");
        String reason = rs.getString("revoked_reason");
        return new DeviceSession(
                rs.getObject("id", UUID.class),
                rs.getObject("user_id", UUID.class),
                rs.getString("device_name"),
                DeviceSession.Platform.valueOf(rs.getString("platform")),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("last_used_at").toInstant(),
                revoked == null ? null : revoked.toInstant(),
                reason == null ? null : DeviceSession.RevokedReason.valueOf(reason));
    }
}
