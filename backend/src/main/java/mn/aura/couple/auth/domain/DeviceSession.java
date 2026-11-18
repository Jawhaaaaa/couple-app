package mn.aura.couple.auth.domain;

import java.time.Instant;
import java.util.UUID;

/**
 * Төхөөрөмжийн session (`device_session`, DD-AURA-006) — refresh токены гэр бүл. Access JWT-ийн
 * `sid` нь энэ id; revoke хийгдвэл тухайн session-ийн access ба refresh хоёулаа хүчингүй.
 */
public record DeviceSession(
        UUID id,
        UUID userId,
        String deviceName,
        Platform platform,
        Instant createdAt,
        Instant lastUsedAt,
        Instant revokedAt,
        RevokedReason revokedReason) {

    public enum Platform { IOS, ANDROID, WEB }

    public enum RevokedReason { LOGOUT, REUSE, PASSWORD_RESET, PASSWORD_CHANGE, NOT_ME, REVOKED, REVOKE_ALL }

    public boolean revoked() {
        return revokedAt != null;
    }
}
