package mn.aura.couple.common;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;

/**
 * Бизнесийн алдаа — `ApiErrorHandler` нь гэрээний `ApiError` JSON болгоно.
 * `details` нь `ApiError.details` (жишээ `attemptsLeft`, `availableAt`).
 */
public class ApiException extends RuntimeException {

    private final ErrorCode code;
    private final HttpStatus status;
    private final Map<String, Object> details;
    private final Integer retryAfterSeconds;
    private final List<ApiError.FieldError> fieldErrors;

    public ApiException(ErrorCode code, HttpStatus status) {
        this(code, status, Map.of(), null, List.of());
    }

    public ApiException(ErrorCode code, HttpStatus status, Map<String, ?> details) {
        this(code, status, details, null, List.of());
    }

    private ApiException(ErrorCode code, HttpStatus status, Map<String, ?> details,
                         Integer retryAfterSeconds, List<ApiError.FieldError> fieldErrors) {
        super(code.name(), null, false, false);
        this.code = code;
        this.status = status;
        this.details = details == null ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(details));
        this.retryAfterSeconds = retryAfterSeconds;
        this.fieldErrors = fieldErrors == null ? List.of() : List.copyOf(fieldErrors);
    }

    /** 429 `RATE_LIMITED` — `Retry-After` толгой ба `retryAfterSeconds`. */
    public static ApiException rateLimited(int retryAfterSeconds) {
        return new ApiException(ErrorCode.RATE_LIMITED, HttpStatus.TOO_MANY_REQUESTS, Map.of(), retryAfterSeconds, List.of());
    }

    /** 400 `VALIDATION_FAILED` нэг талбарын алдаатай (талбарын код нь тодорхой код, жишээ `PASSWORD_WEAK`). */
    public static ApiException validation(String field, ErrorCode fieldCode) {
        return new ApiException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, Map.of(), null,
                List.of(new ApiError.FieldError(field, fieldCode.name(), null)));
    }

    /** 404 `NOT_FOUND` — өөр space-ийн объектод ч мөн адил (DD-AURA-004). */
    public static ApiException notFound() {
        return new ApiException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
    }

    public ErrorCode code() {
        return code;
    }

    public HttpStatus status() {
        return status;
    }

    public Map<String, Object> details() {
        return details;
    }

    public Integer retryAfterSeconds() {
        return retryAfterSeconds;
    }

    public List<ApiError.FieldError> fieldErrors() {
        return fieldErrors;
    }
}
