package mn.aura.couple.couple.domain;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** `space`, `space_member` (DD-AURA-003) — хосын талын бичилт ба уншилт. */
@Repository
public class SpaceRepository {

    /** Хэрэглэгчийн идэвхтэй COUPLE гишүүнчлэл (тасалж буй ч гэсэн — `left_at IS NULL`). */
    public record CoupleMembership(UUID spaceId, String status, Instant readOnlyUntil) {

        public boolean active() {
            return "ACTIVE".equals(status);
        }
    }

    public record SpaceRow(UUID id, String kind, String status, String timezone, LocalDate startDate,
                           boolean startDateConfirmed, String theme, Instant nextMeetupAt, Instant linkedAt,
                           Instant readOnlyUntil, long version) {
    }

    public record MemberRow(UUID spaceId, UUID userId, LocalDate proposedStartDate, String partnerNickname,
                            UUID partnerAvatarMediaId, String soloShareDecision, Instant breakupConfirmedAt,
                            Instant restoreConfirmedAt) {
    }

    private final JdbcTemplate jdbc;

    public SpaceRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<CoupleMembership> coupleMembership(UUID userId) {
        return jdbc.query("""
                SELECT s.id, s.status, s.read_only_until
                  FROM space_member sm JOIN space s ON s.id = sm.space_id
                 WHERE sm.user_id = ? AND sm.space_kind = 'COUPLE' AND sm.left_at IS NULL
                """, (rs, i) -> new CoupleMembership(rs.getObject("id", UUID.class), rs.getString("status"),
                instant(rs, "read_only_until")), userId).stream().findFirst();
    }

    public Optional<UUID> soloSpaceOf(UUID userId) {
        return jdbc.queryForList("""
                SELECT sm.space_id FROM space_member sm
                 WHERE sm.user_id = ? AND sm.space_kind = 'SOLO' AND sm.left_at IS NULL
                 ORDER BY sm.joined_at LIMIT 1
                """, UUID.class, userId).stream().findFirst();
    }

    public Optional<SpaceRow> find(UUID spaceId) {
        return jdbc.query("""
                SELECT id, kind, status, timezone, start_date, start_date_confirmed, theme, next_meetup_at, linked_at,
                       read_only_until, version
                  FROM space WHERE id = ?
                """, SpaceRepository::mapSpace, spaceId).stream().findFirst();
    }

    public List<MemberRow> members(UUID spaceId) {
        return jdbc.query("""
                SELECT space_id, user_id, proposed_start_date, partner_nickname, partner_avatar_media_id,
                       solo_share_decision, breakup_confirmed_at, restore_confirmed_at
                  FROM space_member WHERE space_id = ? AND left_at IS NULL ORDER BY joined_at, user_id
                """, (rs, i) -> new MemberRow(rs.getObject("space_id", UUID.class), rs.getObject("user_id", UUID.class),
                date(rs, "proposed_start_date"), rs.getString("partner_nickname"),
                rs.getObject("partner_avatar_media_id", UUID.class), rs.getString("solo_share_decision"),
                instant(rs, "breakup_confirmed_at"), instant(rs, "restore_confirmed_at")), spaceId);
    }

    /** Хосын space (SD-02: бүс = урилга үүсгэгчийн бүс, өөрчлөгдөхгүй). */
    public void insertCoupleSpace(UUID spaceId, String timezone, Instant now) {
        jdbc.update("""
                INSERT INTO space (id, kind, status, timezone, linked_at, created_at, updated_at)
                VALUES (?, 'COUPLE', 'ACTIVE', ?, ?, ?, ?)
                """, spaceId, timezone, ts(now), ts(now), ts(now));
    }

    /** INV-02: `space_member_one_active_couple_uk` зөрчигдвөл `DuplicateKeyException`. */
    public void insertCoupleMember(UUID spaceId, UUID userId, String soloShareDecision, Instant now) {
        jdbc.update("""
                INSERT INTO space_member (space_id, user_id, space_kind, joined_at, solo_share_decision)
                VALUES (?, ?, 'COUPLE', ?, ?)
                """, spaceId, userId, ts(now), soloShareDecision);
    }

    public String userTimezone(UUID userId) {
        return jdbc.queryForObject("SELECT timezone FROM users WHERE id = ?", String.class, userId);
    }

    public boolean emailVerified(UUID userId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT email_verified_at IS NOT NULL FROM users WHERE id = ?", Boolean.class, userId));
    }

    /** Space-ийн мөрийг түгжинэ (эхэлсэн өдөр, сэдэв г.м. зэрэг бичилт). */
    public void lock(UUID spaceId) {
        jdbc.queryForList("SELECT id FROM space WHERE id = ? FOR UPDATE", UUID.class, spaceId);
    }

    public void touch(UUID spaceId, Instant now) {
        jdbc.update("UPDATE space SET version = version + 1, updated_at = ? WHERE id = ?", ts(now), spaceId);
    }

    private static SpaceRow mapSpace(ResultSet rs, int i) throws SQLException {
        return new SpaceRow(rs.getObject("id", UUID.class), rs.getString("kind"), rs.getString("status"),
                rs.getString("timezone"), date(rs, "start_date"), rs.getBoolean("start_date_confirmed"),
                rs.getString("theme"), instant(rs, "next_meetup_at"), instant(rs, "linked_at"),
                instant(rs, "read_only_until"), rs.getLong("version"));
    }

    static Instant instant(ResultSet rs, String col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }

    static LocalDate date(ResultSet rs, String col) throws SQLException {
        Date d = rs.getDate(col);
        return d == null ? null : d.toLocalDate();
    }

    static Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }
}
