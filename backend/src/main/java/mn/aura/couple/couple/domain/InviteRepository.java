package mn.aura.couple.couple.domain;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** `invite` хүснэгт (T-22). */
@Repository
public class InviteRepository {

    public record InviteRow(UUID id, String code, UUID inviterId, Instant expiresAt, String status, Instant createdAt) {

        public boolean usable(Instant now) {
            return "ACTIVE".equals(status) && expiresAt.isAfter(now);
        }
    }

    private static final String COLUMNS = "id, code, inviter_id, expires_at, status, created_at";

    private final JdbcTemplate jdbc;

    public InviteRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Хүчинтэй кодтой давхцвал false (дуудагч шинэ код үүсгэнэ). */
    public boolean insert(UUID id, String code, UUID inviterId, Instant expiresAt, Instant now) {
        try {
            jdbc.update("""
                    INSERT INTO invite (id, code, inviter_id, expires_at, status, created_at, updated_at)
                    VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)
                    """, id, code, inviterId, ts(expiresAt), ts(now), ts(now));
            return true;
        } catch (DuplicateKeyException e) {
            return false;
        }
    }

    public Optional<InviteRow> findById(UUID id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM invite WHERE id = ?", InviteRepository::map, id)
                .stream().findFirst();
    }

    /** Кодын хамгийн сүүлийн урилга (ашиглагдсан/дууссан ч — «хүчингүй» гэж ялгах, AC-08). */
    public Optional<InviteRow> findLatestByCode(String code) {
        return jdbc.query("SELECT " + COLUMNS + " FROM invite WHERE code = ? "
                        + "ORDER BY (status = 'ACTIVE') DESC, created_at DESC LIMIT 1 FOR UPDATE",
                InviteRepository::map, code).stream().findFirst();
    }

    public Optional<InviteRow> findLatestActive(UUID inviterId, Instant now) {
        return jdbc.query("SELECT " + COLUMNS + " FROM invite WHERE inviter_id = ? AND status = 'ACTIVE' AND expires_at > ? "
                        + "ORDER BY created_at DESC LIMIT 1", InviteRepository::map, inviterId, ts(now))
                .stream().findFirst();
    }

    public void setStatus(UUID id, String status, Instant now) {
        jdbc.update("UPDATE invite SET status = ?, updated_at = ? WHERE id = ?", status, ts(now), id);
    }

    /** Хэрэглэгчийн бүх хүчинтэй урилгыг цуцална (шинэ үүсгэх, хос холбогдох үед). */
    public int cancelActive(UUID inviterId, Instant now) {
        return jdbc.update("UPDATE invite SET status = 'CANCELLED', updated_at = ? WHERE inviter_id = ? AND status = 'ACTIVE'",
                ts(now), inviterId);
    }

    /** Хугацаа нь дууссан ACTIVE урилгыг EXPIRED болгоно — кодыг дахин олгох боломжтой болно. */
    public int expire(Instant now) {
        return jdbc.update("UPDATE invite SET status = 'EXPIRED', updated_at = ? WHERE status = 'ACTIVE' AND expires_at <= ?",
                ts(now), ts(now));
    }

    private static InviteRow map(ResultSet rs, int i) throws SQLException {
        return new InviteRow(rs.getObject("id", UUID.class), rs.getString("code"), rs.getObject("inviter_id", UUID.class),
                rs.getTimestamp("expires_at").toInstant(), rs.getString("status"), rs.getTimestamp("created_at").toInstant());
    }

    private static Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }
}
