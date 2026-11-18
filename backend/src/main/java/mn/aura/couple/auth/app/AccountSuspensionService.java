package mn.aura.couple.auth.app;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.auth.domain.DeviceSession;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.time.TimeProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Акаунт түдгэлзүүлэх (FR-14.8, AC-186). Түдгэлзүүлэхэд бүх session хаагдаж `session_version` нэмэгдэнэ —
 * гарт байгаа access JWT дараагийн хүсэлтэд 401, refresh 401 `AUTH_SESSION_REVOKED`, нууц үг/OAuth-оор
 * нэвтрэх 403 `ACCOUNT_SUSPENDED` (`LoginService`, `OAuthAccountLinker`). Үйлдэл бүр `user_suspension`-д
 * (шалтгаан, админ) бүртгэгдэнэ. Устсан эсвэл байхгүй хэрэглэгч → 404.
 */
@Service
public class AccountSuspensionService {

    private static final Logger log = LoggerFactory.getLogger(AccountSuspensionService.class);

    private final JdbcTemplate jdbc;
    private final DeviceSessionService sessions;
    private final TimeProvider time;

    public AccountSuspensionService(JdbcTemplate jdbc, DeviceSessionService sessions, TimeProvider time) {
        this.jdbc = jdbc;
        this.sessions = sessions;
        this.time = time;
    }

    @Transactional
    public void suspend(UUID userId, String reason, UUID actorId) {
        if (userId.equals(actorId)) {
            throw ApiException.validation("userId", ErrorCode.VALIDATION_FAILED);
        }
        String status = statusOf(userId);
        Instant now = time.now();
        if (!"SUSPENDED".equals(status)) {
            jdbc.update("UPDATE users SET status = 'SUSPENDED', updated_at = ? WHERE id = ?", Timestamp.from(now), userId);
        }
        // Дахин дуудахад ч session-ийг хаана (түдгэлзсэн хойно нээгдсэн session үлдэхгүй)
        sessions.revokeAll(userId, DeviceSession.RevokedReason.REVOKE_ALL, null, true);
        audit(userId, "SUSPEND", reason, actorId, now);
        log.info("Хэрэглэгч {} түдгэлзлээ (админ {})", userId, actorId);
    }

    @Transactional
    public void unsuspend(UUID userId, String reason, UUID actorId) {
        String status = statusOf(userId);
        Instant now = time.now();
        if ("SUSPENDED".equals(status)) {
            jdbc.update("UPDATE users SET status = 'ACTIVE', updated_at = ? WHERE id = ?", Timestamp.from(now), userId);
            audit(userId, "UNSUSPEND", reason, actorId, now);
            log.info("Хэрэглэгч {}-ийн түдгэлзүүлэлт цуцлагдлаа (админ {})", userId, actorId);
        }
    }

    private String statusOf(UUID userId) {
        List<String> rows = jdbc.queryForList("SELECT status FROM users WHERE id = ? FOR UPDATE", String.class, userId);
        if (rows.isEmpty() || "DELETED".equals(rows.get(0))) {
            throw ApiException.notFound();
        }
        return rows.get(0);
    }

    private void audit(UUID userId, String action, String reason, UUID actorId, Instant now) {
        jdbc.update("INSERT INTO user_suspension (id, user_id, action, reason, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                Ids.newId(), userId, action, reason == null || reason.isBlank() ? null : reason.strip(), actorId,
                Timestamp.from(now));
    }
}
