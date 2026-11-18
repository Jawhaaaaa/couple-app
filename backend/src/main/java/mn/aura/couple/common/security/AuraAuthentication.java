package mn.aura.couple.common.security;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Access JWT-ээр нэвтэрсэн хэрэглэгч (DD-AURA-006). `getName()` нь хэрэглэгчийн UUID
 * (`SpaceAccessGuard` уншина), `sessionId` нь `device_session.id` (JWT-ийн `sid`).
 */
public class AuraAuthentication extends AbstractAuthenticationToken {

    private final UUID userId;
    private final UUID sessionId;

    public AuraAuthentication(UUID userId, UUID sessionId) {
        super(List.of(new SimpleGrantedAuthority("ROLE_USER")));
        this.userId = userId;
        this.sessionId = sessionId;
        setAuthenticated(true);
    }

    public UUID userId() {
        return userId;
    }

    public UUID sessionId() {
        return sessionId;
    }

    @Override
    public Object getCredentials() {
        return "";
    }

    @Override
    public Object getPrincipal() {
        return userId;
    }

    @Override
    public String getName() {
        return userId.toString();
    }

    /** Одоогийн хүсэлтийн JWT session (байхгүй бол хоосон). */
    public static Optional<AuraAuthentication> current() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth instanceof AuraAuthentication a ? Optional.of(a) : Optional.empty();
    }
}
