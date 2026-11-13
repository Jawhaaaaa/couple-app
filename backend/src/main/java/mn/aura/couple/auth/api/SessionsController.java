package mn.aura.couple.auth.api;

import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.api.SessionsApi;
import mn.aura.couple.api.model.DevicePlatform;
import mn.aura.couple.api.model.DeviceSession;
import mn.aura.couple.api.model.RevokeAllRequest;
import mn.aura.couple.auth.app.DeviceSessionService;
import mn.aura.couple.common.security.AuraAuthentication;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/**
 * Гэрээний `Sessions` tag (AC-56, AC-125). Хаагдсан session-ийн access ба refresh шууд хүчингүй
 * (`SessionVersionCache`). «Бүгдээс гарах» нь `session_version`-ийг нэмж бүх access-ийг хаана;
 * `requirePassword` бол алсаас түгжих (GAP-24): дараагийн нэвтрэлтэд нууц үг шаардана (AC-187). Хаагдсан session бүрд
 * WS `session.revoked`.
 */
@RestController
public class SessionsController implements SessionsApi {

    private final DeviceSessionService sessions;
    private final mn.aura.couple.auth.domain.UserAccountRepository users;

    public SessionsController(DeviceSessionService sessions, mn.aura.couple.auth.domain.UserAccountRepository users) {
        this.sessions = sessions;
        this.users = users;
    }

    @Override
    public ResponseEntity<List<DeviceSession>> listSessions() {
        AuraAuthentication auth = MeController.current();
        List<DeviceSession> out = sessions.listActive(auth.userId()).stream()
                .map(s -> new DeviceSession(s.id(), s.deviceName(), DevicePlatform.fromValue(s.platform().name()),
                        s.createdAt().atOffset(ZoneOffset.UTC), s.lastUsedAt().atOffset(ZoneOffset.UTC),
                        s.id().equals(auth.sessionId())))
                .toList();
        return ResponseEntity.ok(out);
    }

    @Override
    public ResponseEntity<Void> revokeSession(UUID sessionId) {
        sessions.revoke(MeController.current().userId(), sessionId,
                mn.aura.couple.auth.domain.DeviceSession.RevokedReason.REVOKED);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> revokeAllSessions(RevokeAllRequest body) {
        UUID userId = MeController.current().userId();
        if (Boolean.TRUE.equals(body.getRequirePassword())) {
            sessions.lockRemotely(userId, mn.aura.couple.auth.domain.DeviceSession.RevokedReason.REVOKE_ALL);
        } else {
            sessions.revokeAll(userId, mn.aura.couple.auth.domain.DeviceSession.RevokedReason.REVOKE_ALL, null, true);
        }
        return ResponseEntity.noContent().build();
    }
}
