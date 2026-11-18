package mn.aura.couple.couple.domain;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** `pairing` хүснэгт — хоёр талын баталгаа (AC-170). */
@Repository
public class PairingRepository {

    public record PairingRow(UUID id, UUID inviteId, UUID inviterId, UUID joinerId, String status, UUID spaceId) {

        public boolean awaiting() {
            return "AWAITING_INVITER".equals(status);
        }

        public boolean involves(UUID userId) {
            return inviterId.equals(userId) || joinerId.equals(userId);
        }
    }

    private static final String COLUMNS = "id, invite_id, inviter_id, joiner_id, status, space_id";

    private final JdbcTemplate jdbc;

    public PairingRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(UUID id, UUID inviteId, UUID inviterId, UUID joinerId, Instant now) {
        jdbc.update("""
                INSERT INTO pairing (id, invite_id, inviter_id, joiner_id, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'AWAITING_INVITER', ?, ?)
                """, id, inviteId, inviterId, joinerId, Timestamp.from(now), Timestamp.from(now));
    }

    /** Мөрийг түгжиж уншина — зэрэг баталгаа/цуцлалтаас сэргийлнэ. */
    public Optional<PairingRow> findForUpdate(UUID id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM pairing WHERE id = ? FOR UPDATE", PairingRepository::map, id)
                .stream().findFirst();
    }

    /** Хэрэглэгчийн хүлээгдэж буй (inviter эсвэл joiner) хамгийн сүүлийн pairing. */
    public Optional<PairingRow> findAwaiting(UUID userId) {
        return jdbc.query("SELECT " + COLUMNS + " FROM pairing WHERE status = 'AWAITING_INVITER' AND (inviter_id = ? OR joiner_id = ?) "
                + "ORDER BY created_at DESC LIMIT 1", PairingRepository::map, userId, userId).stream().findFirst();
    }

    public List<PairingRow> findAllAwaiting(UUID userId) {
        return jdbc.query("SELECT " + COLUMNS + " FROM pairing WHERE status = 'AWAITING_INVITER' AND (inviter_id = ? OR joiner_id = ?)",
                PairingRepository::map, userId, userId);
    }

    public void setStatus(UUID id, String status, UUID spaceId, Instant now) {
        jdbc.update("UPDATE pairing SET status = ?, space_id = ?, updated_at = ? WHERE id = ?",
                status, spaceId, Timestamp.from(now), id);
    }

    private static PairingRow map(ResultSet rs, int i) throws SQLException {
        return new PairingRow(rs.getObject("id", UUID.class), rs.getObject("invite_id", UUID.class),
                rs.getObject("inviter_id", UUID.class), rs.getObject("joiner_id", UUID.class), rs.getString("status"),
                rs.getObject("space_id", UUID.class));
    }
}
