package mn.aura.couple.couple.domain;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** `theme_proposal` — хосын сэдвийн санал (AC-138), space-д нэг PENDING. */
@Repository
public class ThemeProposalRepository {

    public record ProposalRow(UUID id, UUID spaceId, UUID proposerId, String theme, String status, Instant createdAt) {
    }

    private final JdbcTemplate jdbc;

    public ThemeProposalRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<ProposalRow> findPending(UUID spaceId) {
        return jdbc.query("SELECT id, space_id, proposer_id, theme, status, created_at FROM theme_proposal "
                        + "WHERE space_id = ? AND status = 'PENDING'",
                (rs, i) -> new ProposalRow(rs.getObject("id", UUID.class), rs.getObject("space_id", UUID.class),
                        rs.getObject("proposer_id", UUID.class), rs.getString("theme"), rs.getString("status"),
                        rs.getTimestamp("created_at").toInstant()), spaceId).stream().findFirst();
    }

    public Optional<ProposalRow> findForUpdate(UUID id, UUID spaceId) {
        return jdbc.query("SELECT id, space_id, proposer_id, theme, status, created_at FROM theme_proposal "
                        + "WHERE id = ? AND space_id = ? FOR UPDATE",
                (rs, i) -> new ProposalRow(rs.getObject("id", UUID.class), rs.getObject("space_id", UUID.class),
                        rs.getObject("proposer_id", UUID.class), rs.getString("theme"), rs.getString("status"),
                        rs.getTimestamp("created_at").toInstant()), id, spaceId).stream().findFirst();
    }

    public void insert(UUID id, UUID spaceId, UUID proposerId, String theme, Instant now) {
        jdbc.update("INSERT INTO theme_proposal (id, space_id, proposer_id, theme, status, created_at, updated_at) "
                + "VALUES (?, ?, ?, ?, 'PENDING', ?, ?)", id, spaceId, proposerId, theme, Timestamp.from(now), Timestamp.from(now));
    }

    public void setStatus(UUID id, String status, Instant now) {
        jdbc.update("UPDATE theme_proposal SET status = ?, updated_at = ? WHERE id = ?", status, Timestamp.from(now), id);
    }
}
