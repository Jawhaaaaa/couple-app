package mn.aura.couple.auth.app;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import mn.aura.couple.auth.domain.DeviceSession;
import mn.aura.couple.auth.domain.DeviceSessionRepository;
import mn.aura.couple.auth.domain.RefreshTokenRepository;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.time.TimeProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Refresh токен (DD-AURA-006/007): opaque 256 бит, DB-д SHA-256, 30 хоног, ашиглах бүрд солигдоно
 * (rotation). Солигдсон токен дахин ирвэл хулгайлагдсан гэж үзэж хэрэглэгчийн БҮХ session-ийг
 * `REUSE` шалтгаанаар хааж `session_version`-ийг нэмнэ → 401 `AUTH_SESSION_REVOKED` (AC-07).
 */
@Service
public class RefreshTokenService {

    public static final Duration TTL = Duration.ofDays(30);
    private static final Logger log = LoggerFactory.getLogger(RefreshTokenService.class);

    public record Rotation(DeviceSession session, String refreshToken) {
        @Override
        public String toString() {
            return "Rotation[session=" + session.id() + ", refreshToken=***]";
        }
    }

    private final RefreshTokenRepository tokens;
    private final DeviceSessionRepository sessions;
    private final DeviceSessionService sessionService;
    private final TokenHasher hasher;
    private final TimeProvider time;

    public RefreshTokenService(RefreshTokenRepository tokens, DeviceSessionRepository sessions,
                               DeviceSessionService sessionService, TokenHasher hasher, TimeProvider time) {
        this.tokens = tokens;
        this.sessions = sessions;
        this.sessionService = sessionService;
        this.hasher = hasher;
        this.time = time;
    }

    /** Session-д шинэ refresh (raw утгыг зөвхөн client-д буцаана). */
    @Transactional
    public String issue(UUID sessionId) {
        return insert(sessionId, Ids.newId(), time.now());
    }

    /**
     * Rotation. Буруу → `TOKEN_INVALID`, хугацаа дууссан → `TOKEN_EXPIRED`, хаагдсан session эсвэл
     * давхар ашиглалт → `AUTH_SESSION_REVOKED`. Давхар ашиглалтын revoke нь 401-тэй хамт commit хийгдэнэ.
     */
    @Transactional(noRollbackFor = ApiException.class)
    public Rotation rotate(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw unauthorized(ErrorCode.TOKEN_INVALID);
        }
        Instant now = time.now();
        RefreshTokenRepository.Row row = tokens.findByHash(hasher.sha256(rawToken.strip()))
                .orElseThrow(() -> unauthorized(ErrorCode.TOKEN_INVALID));
        DeviceSession session = sessions.findById(row.sessionId())
                .orElseThrow(() -> unauthorized(ErrorCode.TOKEN_INVALID));
        if (session.revoked()) {
            throw unauthorized(ErrorCode.AUTH_SESSION_REVOKED);
        }
        if (row.rotatedAt() != null) {
            throw reuse(session);
        }
        if (!row.expiresAt().isAfter(now)) {
            throw unauthorized(ErrorCode.TOKEN_EXPIRED);
        }
        UUID nextId = Ids.newId();
        String next = insert(session.id(), nextId, now);
        if (!tokens.markRotated(row.id(), nextId, now)) {
            throw reuse(session);
        }
        sessions.touch(session.id(), now);
        return new Rotation(session, next);
    }

    private ApiException reuse(DeviceSession session) {
        log.warn("Refresh токены давхар ашиглалт — хэрэглэгчийн бүх session хаагдлаа (session {})", session.id());
        sessionService.revokeAll(session.userId(), DeviceSession.RevokedReason.REUSE, null, true);
        return unauthorized(ErrorCode.AUTH_SESSION_REVOKED);
    }

    private String insert(UUID sessionId, UUID id, Instant now) {
        String raw = hasher.randomToken();
        tokens.insert(id, sessionId, hasher.sha256(raw), now.plus(TTL), now);
        return raw;
    }

    private static ApiException unauthorized(ErrorCode code) {
        return new ApiException(code, HttpStatus.UNAUTHORIZED);
    }
}
