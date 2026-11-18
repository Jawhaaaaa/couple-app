package mn.aura.couple.auth.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import mn.aura.couple.common.observability.LogRedaction;
import mn.aura.couple.common.observability.Sensitive;

/** `users`-ийн auth-д хэрэгтэй хэсэг. `passwordHash` нь OAuth-оор л бүртгүүлсэн бол null. */
public record UserAccount(
        UUID id,
        String email,
        @Sensitive String passwordHash,
        String displayName,
        String callName,
        LocalDate birthDate,
        String timezone,
        String locale,
        Instant emailVerifiedAt,
        String status,
        boolean requirePassword,
        int sessionVersion,
        String policyVersion,
        boolean onlineVisible,
        boolean typingVisible) {

    public boolean emailVerified() {
        return emailVerifiedAt != null;
    }

    public boolean hasPassword() {
        return passwordHash != null && !passwordHash.isBlank();
    }

    @Override
    public String toString() {
        return LogRedaction.toString(this);
    }
}
