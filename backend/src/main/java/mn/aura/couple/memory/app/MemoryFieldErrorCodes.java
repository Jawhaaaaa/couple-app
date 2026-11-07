package mn.aura.couple.memory.app;

import java.util.Collection;
import java.util.Set;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.FieldErrorCodeResolver;
import org.springframework.stereotype.Component;
import org.springframework.validation.FieldError;

/** Гэрээний `media: maxItems 20` (`@Size`) → `MEDIA_LIMIT_EXCEEDED` (AC-172). */
@Component
public class MemoryFieldErrorCodes implements FieldErrorCodeResolver {

    private static final Set<String> MEDIA_FIELDS = Set.of("memoryCreate.media", "memoryUpdate.media");

    @Override
    public ErrorCode resolve(FieldError error) {
        if (MEDIA_FIELDS.contains(error.getObjectName() + "." + error.getField())
                && error.getRejectedValue() instanceof Collection<?> c && c.size() > MemoryService.MAX_MEDIA) {
            return ErrorCode.MEDIA_LIMIT_EXCEEDED;
        }
        return null;
    }
}
