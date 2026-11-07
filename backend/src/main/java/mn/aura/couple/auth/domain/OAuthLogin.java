package mn.aura.couple.auth.domain;

import java.time.Instant;
import java.util.UUID;

/** `oauth_login` — callback-ийн дараах, IdP-ийн баталгаажуулсан identity (DD-AURA-032). */
public record OAuthLogin(
        UUID id,
        String provider,
        String subject,
        String email,
        String displayName,
        String client,
        Instant exchangeExpiresAt,
        Instant exchangedAt,
        UUID linkUserId,
        Instant linkExpiresAt,
        Instant linkedAt,
        String deviceName,
        String devicePlatform) {
}
