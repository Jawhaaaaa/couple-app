package mn.aura.couple.couple.app;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import mn.aura.couple.auth.app.DeviceSessionService;
import mn.aura.couple.auth.app.PasswordHasher;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.event.Notify;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.media.app.MediaStorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Акаунт устгах (FR-14.7, GAP-14 анхдагч, DD-AURA-034, AC-128).
 * <ul>
 *   <li>Нууц үг (401 `AUTH_INVALID_CREDENTIALS`) ба баталгаажуулах үг («УСТГАХ» / «DELETE», 400)</li>
 *   <li>Хувийн өгөгдөл шууд устна: профайл (нэр, имэйл, төрсөн өдөр, хот, avatar), нэвтрэх мэдээлэл (нууц үг,
 *       OAuth, session, token), тохиргоо, мэдэгдэл, push, сэтгэл санаа, нууц бэлэг, deck сонголт, экспорт, ганцаараа үеийн
 *       (SOLO) бүх зүйл — DB ба storage. Хэрэглэгчийн мөр нэргүй («DELETED») болж үлдэнэ (хосын агуулгын зохиогчийн лавлагаа)</li>
 *   <li>Хостой бол: сэргээлтгүй (GAP-14), space `ORPHANED` — хамтрагч 30 хоног зөвхөн харах/экспорт, дараа нь
 *       `CouplePurgeJob` бүгдийг устгана; хамтрагчид `PARTNER_DELETED` мэдэгдэл</li>
 * </ul>
 */
@Service
public class AccountDeletionService {

    private static final Logger log = LoggerFactory.getLogger(AccountDeletionService.class);
    public static final Duration PARTNER_EXPORT_WINDOW = Duration.ofDays(30);
    static final Set<String> CONFIRM_PHRASES = Set.of("устгах", "delete");

    private final JdbcTemplate jdbc;
    private final PasswordHasher passwords;
    private final DeviceSessionService sessions;
    private final MediaStorageService storage;
    private final CoupleMembers couples;
    private final UserRefs users;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;

    public AccountDeletionService(JdbcTemplate jdbc, PasswordHasher passwords, DeviceSessionService sessions,
                                  MediaStorageService storage, CoupleMembers couples, UserRefs users,
                                  ApplicationEventPublisher events, TimeProvider time) {
        this.jdbc = jdbc;
        this.passwords = passwords;
        this.sessions = sessions;
        this.storage = storage;
        this.couples = couples;
        this.users = users;
        this.events = events;
        this.time = time;
    }

    /** Хамтрагч экспорт хийх эцсийн хугацаа (хостой бол), үгүй бол empty. */
    @Transactional
    public Optional<OffsetDateTime> delete(UUID userId, String password, String confirmPhrase) {
        List<String> hash = jdbc.queryForList("SELECT password_hash FROM users WHERE id = ? FOR UPDATE", String.class, userId);
        if (hash.isEmpty()) {
            throw ApiException.notFound();
        }
        if (hash.get(0) != null && (password == null || !passwords.matches(password, hash.get(0)))) {
            throw new ApiException(ErrorCode.AUTH_INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
        }
        if (confirmPhrase == null || !CONFIRM_PHRASES.contains(confirmPhrase.strip().toLowerCase(Locale.ROOT))) {
            throw ApiException.validation("confirmPhrase", ErrorCode.VALIDATION_FAILED);
        }
        Instant now = time.now();
        String name = users.ref(userId).getDisplayName();

        // 1) Хосын space → ORPHANED (сэргээлтгүй), хамтрагч 30 хоног зөвхөн харах/экспорт
        Optional<OffsetDateTime> partnerUntil = Optional.empty();
        List<Map<String, Object>> couple = jdbc.queryForList("""
                SELECT s.id, s.status, s.read_only_until FROM space_member sm JOIN space s ON s.id = sm.space_id
                 WHERE sm.user_id = ? AND sm.space_kind = 'COUPLE' AND sm.left_at IS NULL AND s.status <> 'PURGING'
                 FOR UPDATE OF s
                """, userId);
        for (Map<String, Object> c : couple) {
            UUID spaceId = (UUID) c.get("id");
            Optional<UUID> partner = couples.partnerIn(spaceId, userId);
            Instant until = now.plus(PARTNER_EXPORT_WINDOW);
            if (c.get("read_only_until") instanceof Timestamp t && t.toInstant().isAfter(until)) {
                until = t.toInstant();
            }
            jdbc.update("UPDATE space SET status = 'ORPHANED', read_only_until = ?, version = version + 1, updated_at = ? "
                    + "WHERE id = ?", Timestamp.from(until), Timestamp.from(now), spaceId);
            jdbc.update("UPDATE space_member SET left_at = ?, partner_nickname = NULL, partner_avatar_media_id = NULL "
                    + "WHERE space_id = ? AND user_id = ?", Timestamp.from(now), spaceId, userId);
            if (partner.isPresent()) {
                partnerUntil = Optional.of(OffsetDateTime.ofInstant(until, ZoneOffset.UTC));
                events.publishEvent(new Notify(partner.get(), spaceId, null, "PARTNER_DELETED", Map.of("partner", name),
                        "/settings/data"));
                events.publishEvent(RealtimeEvent.of("couple.updated", null, List.of(partner.get()),
                        Map.of("coupleId", spaceId)));
            }
        }

        // 2) Бүх session хааж access-ийг шууд хүчингүй болгоно
        sessions.revokeEverywhere(userId);

        // 3) Ганцаараа (SOLO) space — DB ба storage
        List<UUID> solo = jdbc.queryForList("SELECT space_id FROM space_member WHERE user_id = ? AND space_kind = 'SOLO'",
                UUID.class, userId);
        List<String> exports = jdbc.queryForList("SELECT s3_key FROM data_export WHERE user_id = ? AND s3_key IS NOT NULL",
                String.class, userId);
        jdbc.update("UPDATE users SET avatar_media_id = NULL WHERE id = ?", userId);
        for (UUID spaceId : solo) {
            jdbc.update("DELETE FROM space WHERE id = ?", spaceId);
        }

        // 4) Хувийн мөрүүд
        for (String sql : List.of(
                "DELETE FROM oauth_identity WHERE user_id = ?",
                "DELETE FROM oauth_login WHERE link_user_id = ?",
                "DELETE FROM email_token WHERE user_id = ?",
                "DELETE FROM device_session WHERE user_id = ?",
                "DELETE FROM push_outbox WHERE user_id = ?",
                "DELETE FROM push_subscription WHERE user_id = ?",
                "DELETE FROM notification WHERE user_id = ?",
                "DELETE FROM notification_setting WHERE user_id = ?",
                "DELETE FROM scheduled_reminder WHERE user_id = ?",
                "DELETE FROM user_preference WHERE user_id = ?",
                "DELETE FROM policy_acceptance WHERE user_id = ?",
                "DELETE FROM celebration_seen WHERE user_id = ?",
                "DELETE FROM check_in WHERE user_id = ?",
                "DELETE FROM gift_idea WHERE owner_id = ?",
                "DELETE FROM deck_swipe WHERE user_id = ?",
                "DELETE FROM data_export WHERE user_id = ?",
                "DELETE FROM upload_session WHERE owner_id = ?",
                "DELETE FROM survey_response WHERE user_id = ?",
                "DELETE FROM first_week_task WHERE user_id = ?",
                "DELETE FROM webauthn_challenge WHERE user_id = ?",
                "DELETE FROM webauthn_credential WHERE user_id = ?")) {
            jdbc.update(sql, userId);
        }
        jdbc.update("""
                UPDATE users SET email = ?, password_hash = NULL, display_name = NULL, call_name = NULL, birth_date = NULL,
                       city_name = NULL, city_lat = NULL, city_lon = NULL, country_code = NULL, avatar_media_id = NULL,
                       email_verified_at = NULL, status = 'DELETED', require_password = true, last_active_at = NULL,
                       online_visible = false, typing_visible = false, version = version + 1, updated_at = ?
                 WHERE id = ?
                """, "deleted+" + userId + "@deleted.invalid", Timestamp.from(now), userId);

        // 5) Storage — commit-ийн дараа (DB буцвал файл үлдэнэ)
        afterCommit(() -> {
            for (UUID spaceId : solo) {
                safely(() -> storage.deletePrefix(MediaStorageService.spacePrefix(spaceId)));
            }
            for (String key : exports) {
                safely(() -> storage.delete(key));
            }
        });
        return partnerUntil;
    }

    private static void safely(Runnable r) {
        try {
            r.run();
        } catch (RuntimeException e) {
            log.warn("Устгасан акаунтын storage цэвэрлэгээ амжилтгүй", e);
        }
    }

    private static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
        } else {
            action.run();
        }
    }
}
