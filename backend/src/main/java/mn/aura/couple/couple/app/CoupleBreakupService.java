package mn.aura.couple.couple.app;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.api.model.BreakupState;
import mn.aura.couple.api.model.SpaceStatus;
import mn.aura.couple.auth.app.PasswordHasher;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.event.Notify;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Хос тасалах ба сэргээх (FR-14.6, DD-AURA-034, AC-54, AC-127, AC-171, AC-185).
 * <ul>
 *   <li>Давхар баталгаа (`confirmStep = 2`) + нууц үг → space `BREAKING`, 14 хоног зөвхөн унших/экспорт (бичих → 423);
 *       хамтрагчид `BREAKUP_STARTED` мэдэгдэл (экспортын санал client-д)</li>
 *   <li>14 хоногийн дотор хоёулаа «Сэргээх» дарвал `ACTIVE` — өгөгдөл бүтэн; нэг нь л бол сэргэхгүй</li>
 *   <li>Хугацаа дуусахад `CouplePurgeJob` DB ба storage-оос бүрэн устгана (INV-16); энэ хугацаанд шинэ урилга
 *       409 `PAIRING_COOLDOWN` (`InviteService`)</li>
 * </ul>
 */
@Service
public class CoupleBreakupService {

    public static final Duration RESTORE_WINDOW = Duration.ofDays(14);

    private final JdbcTemplate jdbc;
    private final PasswordHasher passwords;
    private final CoupleMembers couples;
    private final UserRefs users;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;

    public CoupleBreakupService(JdbcTemplate jdbc, PasswordHasher passwords, CoupleMembers couples, UserRefs users,
                                ApplicationEventPublisher events, TimeProvider time) {
        this.jdbc = jdbc;
        this.passwords = passwords;
        this.couples = couples;
        this.users = users;
        this.events = events;
        this.time = time;
    }

    @Transactional
    public BreakupState start(SpaceContext ctx, String password, Integer confirmStep) {
        if (confirmStep == null || confirmStep != 2) {
            throw ApiException.validation("confirmStep", ErrorCode.VALIDATION_FAILED);
        }
        List<String> hash = jdbc.queryForList("SELECT password_hash FROM users WHERE id = ?", String.class, ctx.userId());
        // OAuth-оор л бүртгүүлсэн (нууц үггүй) хэрэглэгчид давхар баталгаа хангалттай
        if (!hash.isEmpty() && hash.get(0) != null
                && (password == null || password.isEmpty() || !passwords.matches(password, hash.get(0)))) {
            throw ApiException.validation("password", ErrorCode.VALIDATION_FAILED);
        }
        jdbc.queryForList("SELECT id FROM space WHERE id = ? FOR UPDATE", UUID.class, ctx.spaceId());
        Instant now = time.now();
        jdbc.update("UPDATE space SET status = 'BREAKING', read_only_until = ?, version = version + 1, updated_at = ? "
                + "WHERE id = ? AND status = 'ACTIVE'", Timestamp.from(now.plus(RESTORE_WINDOW)), Timestamp.from(now),
                ctx.spaceId());
        jdbc.update("UPDATE space_member SET breakup_confirmed_at = CASE WHEN user_id = ? THEN ?::timestamptz ELSE NULL END, "
                + "restore_confirmed_at = NULL WHERE space_id = ?", ctx.userId(), Timestamp.from(now), ctx.spaceId());
        List<UUID> members = couples.members(ctx.spaceId());
        // Бичвэрийн `{days}` (notifications.json) ба S-86 — үлдсэн хоног, «Сэргээх», экспорт тэнд (AC-185)
        couples.partnerIn(ctx.spaceId(), ctx.userId()).ifPresent(partner -> events.publishEvent(new Notify(partner,
                ctx.spaceId(), ctx.userId(), "BREAKUP_STARTED", Map.of("partner", users.ref(ctx.userId()).getDisplayName(),
                        "days", String.valueOf(RESTORE_WINDOW.toDays())), "/settings/breakup")));
        events.publishEvent(RealtimeEvent.of("couple.updated", ctx.userId(), members, Map.of("coupleId", ctx.spaceId())));
        return state(ctx);
    }

    /** «Сэргээх» (AC-127) — хоёулаа дармагц `ACTIVE`. `BREAKING` биш эсвэл хугацаа дууссан → 409 `NOT_BREAKING`. */
    @Transactional
    public BreakupState restore(SpaceContext ctx) {
        List<java.util.Map<String, Object>> space = jdbc.queryForList(
                "SELECT status, read_only_until FROM space WHERE id = ? FOR UPDATE", ctx.spaceId());
        Instant now = time.now();
        if (space.isEmpty() || !"BREAKING".equals(space.get(0).get("status"))
                || space.get(0).get("read_only_until") == null
                || !((Timestamp) space.get(0).get("read_only_until")).toInstant().isAfter(now)) {
            throw new ApiException(ErrorCode.NOT_BREAKING, HttpStatus.CONFLICT);
        }
        jdbc.update("UPDATE space_member SET restore_confirmed_at = ? WHERE space_id = ? AND user_id = ?",
                Timestamp.from(now), ctx.spaceId(), ctx.userId());
        Integer pending = jdbc.queryForObject("SELECT count(*) FROM space_member WHERE space_id = ? AND left_at IS NULL "
                + "AND restore_confirmed_at IS NULL", Integer.class, ctx.spaceId());
        if (pending != null && pending == 0) {
            jdbc.update("UPDATE space SET status = 'ACTIVE', read_only_until = NULL, version = version + 1, updated_at = ? "
                    + "WHERE id = ?", Timestamp.from(now), ctx.spaceId());
            jdbc.update("UPDATE space_member SET breakup_confirmed_at = NULL, restore_confirmed_at = NULL WHERE space_id = ?",
                    ctx.spaceId());
        }
        events.publishEvent(RealtimeEvent.of("couple.updated", ctx.userId(), couples.members(ctx.spaceId()),
                Map.of("coupleId", ctx.spaceId())));
        return state(ctx);
    }

    private BreakupState state(SpaceContext ctx) {
        Map<String, Object> s = jdbc.queryForMap("SELECT status, read_only_until FROM space WHERE id = ?", ctx.spaceId());
        boolean mine = false;
        boolean partner = false;
        for (Map<String, Object> m : jdbc.queryForList("SELECT user_id, restore_confirmed_at FROM space_member "
                + "WHERE space_id = ?", ctx.spaceId())) {
            boolean confirmed = m.get("restore_confirmed_at") != null;
            if (ctx.userId().equals(m.get("user_id"))) {
                mine = confirmed;
            } else {
                partner = confirmed;
            }
        }
        Timestamp until = (Timestamp) s.get("read_only_until");
        return new BreakupState(SpaceStatus.fromValue((String) s.get("status")),
                until == null ? null : OffsetDateTime.ofInstant(until.toInstant(), ZoneOffset.UTC), mine, partner);
    }
}
