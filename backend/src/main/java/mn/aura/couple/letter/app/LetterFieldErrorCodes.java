package mn.aura.couple.letter.app;

import java.util.Collection;
import java.util.Set;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.FieldErrorCodeResolver;
import org.springframework.stereotype.Component;
import org.springframework.validation.FieldError;

/** Гэрээний `mediaIds: maxItems 5` (`@Size`) → `MEDIA_LIMIT_EXCEEDED` (AC-111). */
@Component
public class LetterFieldErrorCodes implements FieldErrorCodeResolver {

    private static final Set<String> MEDIA_FIELDS = Set.of("letterInput.mediaIds", "letterUpdate.mediaIds",
            "capsulePartInput.mediaIds");

    @Override
    public ErrorCode resolve(FieldError error) {
        if (MEDIA_FIELDS.contains(error.getObjectName() + "." + error.getField())
                && error.getRejectedValue() instanceof Collection<?> c && c.size() > LetterService.MAX_MEDIA) {
            return ErrorCode.MEDIA_LIMIT_EXCEEDED;
        }
        return null;
    }
}
