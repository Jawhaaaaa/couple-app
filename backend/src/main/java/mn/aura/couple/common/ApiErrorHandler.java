package mn.aura.couple.common;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import mn.aura.couple.common.observability.ErrorReporter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.Nullable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Бүх алдааг гэрээний `ApiError` JSON болгоно. `message` нь `Accept-Language` (mn/en)-ээр.
 * Үл мэдэгдэх алдаа → 500 `INTERNAL` (stack зөвхөн логт ба `ErrorReporter`-т, биед хэзээ ч үгүй).
 */
@RestControllerAdvice
public class ApiErrorHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiErrorHandler.class);
    private static final Set<ErrorCode> CODES = EnumSet.allOf(ErrorCode.class);

    private final ApiErrorWriter writer;
    private final ErrorReporter errorReporter;

    public ApiErrorHandler(ApiErrorWriter writer, ErrorReporter errorReporter) {
        this.writer = writer;
        this.errorReporter = errorReporter;
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Object> handleApi(ApiException ex, WebRequest request) {
        HttpHeaders headers = new HttpHeaders();
        if (ex.retryAfterSeconds() != null) {
            headers.set(HttpHeaders.RETRY_AFTER, String.valueOf(ex.retryAfterSeconds()));
        }
        ApiError body = writer.build(ex.code(), lang(request), ex.fieldErrors(), ex.retryAfterSeconds(), ex.details());
        return ResponseEntity.status(ex.status()).headers(headers).body(body);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<Object> handleConstraintViolation(ConstraintViolationException ex, WebRequest request) {
        List<ApiError.FieldError> fields = new ArrayList<>();
        for (ConstraintViolation<?> v : ex.getConstraintViolations()) {
            fields.add(new ApiError.FieldError(lastNode(v.getPropertyPath().toString()), fieldCode(v.getMessageTemplate()), null));
        }
        return validation(fields, request);
    }

    /** Spring Security-ийн алдааг ExceptionTranslationFilter руу буцаана (401/403-ыг тэнд бичнэ). */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Object> handleUnknown(Exception ex, WebRequest request) throws Exception {
        if (ex instanceof AccessDeniedException || ex instanceof AuthenticationException) {
            throw ex;
        }
        log.error("Боловсруулаагүй алдаа", ex);
        errorReporter.report(ex);
        ApiError body = writer.build(ErrorCode.INTERNAL, lang(request), List.of(), null, Map.of());
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex, HttpHeaders headers,
                                                                  HttpStatusCode status, WebRequest request) {
        List<ApiError.FieldError> fields = new ArrayList<>();
        for (FieldError fe : ex.getBindingResult().getFieldErrors()) {
            fields.add(new ApiError.FieldError(fe.getField(), fieldCode(fe.getDefaultMessage()), null));
        }
        ex.getBindingResult().getGlobalErrors().forEach(ge ->
                fields.add(new ApiError.FieldError(ge.getObjectName(), fieldCode(ge.getDefaultMessage()), null)));
        return validation(fields, request);
    }

    @Override
    protected ResponseEntity<Object> handleHandlerMethodValidationException(HandlerMethodValidationException ex,
                                                                            HttpHeaders headers, HttpStatusCode status,
                                                                            WebRequest request) {
        List<ApiError.FieldError> fields = new ArrayList<>();
        ex.getParameterValidationResults().forEach(r -> {
            String name = r.getMethodParameter().getParameterName();
            for (MessageSourceResolvable error : r.getResolvableErrors()) {
                String field = error instanceof FieldError fe ? fe.getField() : (name != null ? name : "request");
                fields.add(new ApiError.FieldError(field, fieldCode(error.getDefaultMessage()), null));
            }
        });
        return validation(fields, request);
    }

    /** Spring MVC-ийн стандарт алдаа (404 NoResourceFound, 405, 413, 415, уншигдахгүй бие г.м.). */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception ex, @Nullable Object body, HttpHeaders headers,
                                                             HttpStatusCode statusCode, WebRequest request) {
        ErrorCode code = codeForStatus(statusCode);
        if (statusCode.is5xxServerError()) {
            log.error("Spring MVC-ийн алдаа", ex);
            errorReporter.report(ex);
        } else {
            log.debug("Хүсэлтийн алдаа {}: {}", statusCode.value(), ex.getClass().getSimpleName());
        }
        ApiError apiError = writer.build(code, lang(request), List.of(), null, Map.of());
        HttpHeaders out = new HttpHeaders();
        if (headers.getAllow() != null && !headers.getAllow().isEmpty()) {
            out.setAllow(headers.getAllow());
        }
        return ResponseEntity.status(statusCode).headers(out).body(apiError);
    }

    static ErrorCode codeForStatus(HttpStatusCode status) {
        return switch (status.value()) {
            case 400, 422 -> ErrorCode.VALIDATION_FAILED;
            case 401 -> ErrorCode.TOKEN_INVALID;
            case 403 -> ErrorCode.NOT_OWNER;
            case 404, 405 -> ErrorCode.NOT_FOUND;
            case 413 -> ErrorCode.MEDIA_TOO_LARGE;
            case 429 -> ErrorCode.RATE_LIMITED;
            case 503 -> ErrorCode.UPSTREAM_UNAVAILABLE;
            default -> status.is5xxServerError() ? ErrorCode.INTERNAL : ErrorCode.VALIDATION_FAILED;
        };
    }

    private ResponseEntity<Object> validation(List<ApiError.FieldError> fields, WebRequest request) {
        ApiError body = writer.build(ErrorCode.VALIDATION_FAILED, lang(request), fields, null, Map.of());
        return ResponseEntity.badRequest().body(body);
    }

    /** Constraint-ийн мессеж нь ErrorCode-ийн нэр бол (жишээ `PASSWORD_WEAK`) түүнийг, үгүй бол VALIDATION_FAILED. */
    private static String fieldCode(@Nullable String message) {
        if (message != null) {
            String m = message.replace("{", "").replace("}", "");
            for (ErrorCode c : CODES) {
                if (c.name().equals(m)) {
                    return m;
                }
            }
        }
        return ErrorCode.VALIDATION_FAILED.name();
    }

    private static String lastNode(String path) {
        int i = path.lastIndexOf('.');
        return i >= 0 ? path.substring(i + 1) : path;
    }

    private static String lang(WebRequest request) {
        return request.getHeader(HttpHeaders.ACCEPT_LANGUAGE);
    }
}
