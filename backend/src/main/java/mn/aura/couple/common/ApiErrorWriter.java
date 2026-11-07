package mn.aura.couple.common;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import mn.aura.couple.common.observability.TraceIdFilter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

/**
 * `ApiError` биеийг бүтээж, шаардлагатай бол servlet хариунд шууд бичнэ
 * (Spring Security-ийн 401/403 зэрэг controller-оос гадуурх хариунд).
 */
@Component
public class ApiErrorWriter {

    private final ErrorMessages messages;
    private final ObjectMapper objectMapper;

    public ApiErrorWriter(ErrorMessages messages, ObjectMapper objectMapper) {
        this.messages = messages;
        this.objectMapper = objectMapper;
    }

    public ApiError build(ErrorCode code, String acceptLanguage, List<ApiError.FieldError> fieldErrors,
                          Integer retryAfterSeconds, Map<String, Object> details) {
        List<ApiError.FieldError> localized = fieldErrors == null ? List.of() : fieldErrors.stream()
                .map(f -> new ApiError.FieldError(f.field(), f.code(),
                        f.message() != null ? f.message() : messages.message(f.code(), acceptLanguage)))
                .toList();
        return new ApiError(code, messages.message(code, acceptLanguage), TraceIdFilter.currentTraceId(),
                localized, retryAfterSeconds, details);
    }

    public void write(HttpServletRequest request, HttpServletResponse response, HttpStatus status, ErrorCode code)
            throws IOException {
        ApiError body = build(code, request.getHeader(HttpHeaders.ACCEPT_LANGUAGE), List.of(), null, Map.of());
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(response.getOutputStream(), body);
    }
}
