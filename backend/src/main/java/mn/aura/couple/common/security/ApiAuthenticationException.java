package mn.aura.couple.common.security;

import mn.aura.couple.common.ErrorCode;
import org.springframework.security.core.AuthenticationException;

/** 401 хариуны кодыг (`TOKEN_EXPIRED`, `AUTH_SESSION_REVOKED` г.м.) entry point-д дамжуулна. */
public class ApiAuthenticationException extends AuthenticationException {

    private final ErrorCode code;

    public ApiAuthenticationException(ErrorCode code) {
        super(code.name());
        this.code = code;
    }

    public ErrorCode code() {
        return code;
    }
}
