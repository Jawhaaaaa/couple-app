package mn.aura.couple.auth.app;

import java.util.Set;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.FieldErrorCodeResolver;
import org.springframework.stereotype.Component;
import org.springframework.validation.FieldError;

/**
 * Гэрээний `minLength: 8` (`@Size`) нь `PasswordPolicy`-оос өмнө ажилладаг тул богино шинэ нууц үгийг
 * `VALIDATION_FAILED` биш `PASSWORD_WEAK` болгоно (AC-164: «шалтгаантай татгалзана»).
 */
@Component
public class PasswordFieldErrorCodes implements FieldErrorCodeResolver {

    private static final Set<String> NEW_PASSWORD_FIELDS = Set.of(
            "registerRequest.password", "passwordResetConfirm.newPassword", "passwordChange.newPassword");

    @Override
    public ErrorCode resolve(FieldError error) {
        if (!NEW_PASSWORD_FIELDS.contains(error.getObjectName() + "." + error.getField())) {
            return null;
        }
        if (error.getRejectedValue() instanceof String s && s.length() < PasswordPolicy.MIN_LENGTH) {
            return ErrorCode.PASSWORD_WEAK;
        }
        return null;
    }
}
