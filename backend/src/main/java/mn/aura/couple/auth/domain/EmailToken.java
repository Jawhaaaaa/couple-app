package mn.aura.couple.auth.domain;

import java.time.Instant;
import java.util.UUID;

/** `email_token` — имэйлээр очих код (HMAC hash) ба/эсвэл холбоос (SHA-256 hash). */
public record EmailToken(
        UUID id,
        UUID userId,
        Purpose purpose,
        String codeHash,
        String newEmail,
        Instant expiresAt,
        int attempts,
        Instant consumedAt) {

    public enum Purpose { VERIFY, EMAIL_CHANGE, PASSWORD_RESET, NOT_ME, OAUTH_LINK }

    public boolean expired(Instant now) {
        return !expiresAt.isAfter(now);
    }

    public boolean consumed() {
        return consumedAt != null;
    }
}
