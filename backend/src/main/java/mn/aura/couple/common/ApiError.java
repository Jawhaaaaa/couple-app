package mn.aura.couple.common;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import java.util.Map;

/**
 * Гэрээний `ApiError` бие: {code, message, traceId, fieldErrors?, retryAfterSeconds?, details?}.
 * Stack trace хэзээ ч орохгүй.
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record ApiError(
        ErrorCode code,
        String message,
        String traceId,
        List<FieldError> fieldErrors,
        Integer retryAfterSeconds,
        Map<String, Object> details) {

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record FieldError(String field, String code, String message) {
    }
}
