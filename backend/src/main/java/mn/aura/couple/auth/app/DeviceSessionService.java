package mn.aura.couple.auth.app;

import java.util.List;
import java.util.UUID;
import mn.aura.couple.auth.domain.DeviceSession;
import mn.aura.couple.auth.domain.DeviceSessionRepository;
import mn.aura.couple.auth.domain.UserAccountRepository;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.event.RealtimeEvent;
import mn.aura.couple.common.time.TimeProvider;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Төхөөрөмжийн session (DD-AURA-006/007). Хэрэглэгч тутмын бүх session-ийг хаах үед
 * `users.session_version`-ийг нэмж бүх access JWT-г шууд хүчингүй болгоно (AC-03, AC-07, AC-125).
 * Хаагдсан session бүрд хэрэглэгчийн бусад төхөөрөмж рүү `session.revoked {sessionId}` (asyncapi) — тэр төхөөрөмж
 * дараагийн хүсэлтийг хүлээлгүй S-03 руу гарна (AC-56).
 */
@Service
public class DeviceSessionService {

    private final DeviceSessionRepository sessions;
    private final UserAccountRepository users;
    private final SessionVersionCache cache;
    private final ApplicationEventPublisher events;
    private final TimeProvider time;

    public DeviceSessionService(DeviceSessionRepository sessions, UserAccountRepository users,
                                SessionVersionCache cache, ApplicationEventPublisher events, TimeProvider time) {
        this.sessions = sessions;
        this.users = users;
        this.cache = cache;
        this.events = events;
        this.time = time;
    }

    @Transactional
    public DeviceSession create(UUID userId, String deviceName, DeviceSession.Platform platform) {
        var now = time.now();
        String name = deviceName == null || deviceName.isBlank() ? defaultName(platform) : truncate(deviceName.strip(), 100);
        DeviceSession s = new DeviceSession(mn.aura.couple.common.id.Ids.newId(), userId, name, platform, now, now, null, null);
        sessions.insert(s);
        return s;
    }

    public List<DeviceSession> listActive(UUID userId) {
        return sessions.findActiveByUser(userId);
    }

    /** Өөрийн session-ийг хаана; өөр хэрэглэгчийнх эсвэл байхгүй → 404. */
    @Transactional
    public void revoke(UUID userId, UUID sessionId, DeviceSession.RevokedReason reason) {
        DeviceSession s = sessions.findById(sessionId).filter(x -> x.userId().equals(userId) && !x.revoked())
                .orElseThrow(ApiException::notFound);
        sessions.revoke(s.id(), reason, time.now());
        afterCommit(() -> cache.invalidateSession(sessionId));
        announce(userId, List.of(sessionId));
    }

    /**
     * Бүх идэвхтэй session (`except` өгвөл түүнээс бусад). `bumpVersion` бол бүх access JWT
     * (`sv`) хүчингүй — `except` session-ийнх ч мөн (дараагийн refresh-ээр шинэ `sv` авна).
     */
    @Transactional
    public List<UUID> revokeAll(UUID userId, DeviceSession.RevokedReason reason, UUID except, boolean bumpVersion) {
        List<UUID> revoked = sessions.revokeAll(userId, reason, time.now(), except);
        if (bumpVersion) {
            users.bumpSessionVersion(userId);
        }
        afterCommit(() -> cache.invalidateUser(userId));
        announce(userId, revoked);
        return revoked;
    }

    /**
     * Алсаас түгжих (GAP-24 анхдагч, AC-187): бүх session хааж, дараагийн нэвтрэлтэд нууц үг шаардана —
     * OAuth/passkey шууд нэвтрүүлэхгүй.
     */
    @Transactional
    public List<UUID> lockRemotely(UUID userId, DeviceSession.RevokedReason reason) {
        users.setRequirePassword(userId);
        return revokeAll(userId, reason, null, true);
    }

    /** Бүх session хааж access-ийг шууд хүчингүй болгоно (акаунт устгал г.м. бусад домэйнд). */
    @Transactional
    public List<UUID> revokeEverywhere(UUID userId) {
        return revokeAll(userId, DeviceSession.RevokedReason.REVOKE_ALL, null, true);
    }

    private void announce(UUID userId, List<UUID> revoked) {
        for (UUID id : revoked) {
            events.publishEvent(RealtimeEvent.of("session.revoked", null, List.of(userId), java.util.Map.of("sessionId", id)));
        }
    }

    public void touch(UUID sessionId) {
        sessions.touch(sessionId, time.now());
    }

    private static void afterCommit(Runnable action) {
        action.run();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
        }
    }

    private static String defaultName(DeviceSession.Platform platform) {
        return switch (platform) {
            case IOS -> "iPhone";
            case ANDROID -> "Android";
            case WEB -> "Web";
        };
    }

    private static String truncate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }
}
