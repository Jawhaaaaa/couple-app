package mn.aura.couple.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Map;
import mn.aura.couple.common.config.AuraProperties;
import mn.aura.couple.common.observability.ErrorReporter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@DisplayName("ApiErrorHandler — гэрээний ApiError бие")
class ApiErrorHandlerTest {

    private static final String ERRORS_JSON = """
            {"version":1,"items":[
              {"id":"NOT_PAIRED","mn":"Та хосоо холбоогүй байна","en":"You are not paired yet"},
              {"id":"VALIDATION_FAILED","mn":"Оролт буруу байна","en":"Invalid input"},
              {"id":"INTERNAL","mn":"Алдаа гарлаа","en":"Something went wrong"}
            ]}
            """;

    record NoteInput(@NotBlank String title) {
    }

    @RestController
    static class ProbeController {
        @GetMapping("/probe/not-paired")
        void notPaired() {
            throw new ApiException(ErrorCode.NOT_PAIRED, HttpStatus.CONFLICT, Map.of("hint", "invite"));
        }

        @GetMapping("/probe/rate")
        void rate() {
            throw ApiException.rateLimited(42);
        }

        @GetMapping("/probe/no-message")
        void noMessage() {
            throw new ApiException(ErrorCode.CAPSULE_SEALED, HttpStatus.CONFLICT);
        }

        @GetMapping("/probe/boom")
        void boom() {
            throw new IllegalStateException("нууц дотоод дэлгэрэнгүй SELECT * FROM users");
        }

        @PostMapping("/probe/notes")
        void create(@Valid @RequestBody NoteInput input) {
        }
    }

    MockMvc mvc;

    @BeforeEach
    void setUp() {
        ObjectMapper mapper = new ObjectMapper();
        ErrorMessages messages = new ErrorMessages(mapper, new ByteArrayResource(ERRORS_JSON.getBytes(StandardCharsets.UTF_8)));
        ErrorReporter reporter = new ErrorReporter(new AuraProperties(null, null, null, null, null, null, null, null));
        ApiErrorHandler handler = new ApiErrorHandler(new ApiErrorWriter(messages, mapper), reporter);
        mvc = MockMvcBuilders.standaloneSetup(new ProbeController()).setControllerAdvice(handler).build();
    }

    @Test
    @DisplayName("ApiException → тодорхой статус, code, details, traceId")
    void apiException() throws Exception {
        mvc.perform(get("/probe/not-paired"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOT_PAIRED"))
                .andExpect(jsonPath("$.details.hint").value("invite"))
                .andExpect(jsonPath("$.traceId").isNotEmpty());
    }

    @Test
    @DisplayName("message нь Accept-Language-ээр mn/en, анхдагч mn")
    void localizedMessage() throws Exception {
        mvc.perform(get("/probe/not-paired").header("Accept-Language", "en-US,en;q=0.9"))
                .andExpect(jsonPath("$.message").value("You are not paired yet"));
        mvc.perform(get("/probe/not-paired").header("Accept-Language", "mn"))
                .andExpect(jsonPath("$.message").value("Та хосоо холбоогүй байна"));
        mvc.perform(get("/probe/not-paired"))
                .andExpect(jsonPath("$.message").value("Та хосоо холбоогүй байна"));
    }

    @Test
    @DisplayName("errors.json-д мөр байхгүй бол message = кодын нэр")
    void fallbackToCode() throws Exception {
        mvc.perform(get("/probe/no-message"))
                .andExpect(jsonPath("$.code").value("CAPSULE_SEALED"))
                .andExpect(jsonPath("$.message").value("CAPSULE_SEALED"));
    }

    @Test
    @DisplayName("RATE_LIMITED → 429, Retry-After толгой ба retryAfterSeconds")
    void rateLimited() throws Exception {
        mvc.perform(get("/probe/rate"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "42"))
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"))
                .andExpect(jsonPath("$.retryAfterSeconds").value(42));
    }

    @Test
    @DisplayName("Bean validation → 400 VALIDATION_FAILED + fieldErrors")
    void validation() throws Exception {
        mvc.perform(post("/probe/notes").contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"\"}")
                        .header("Accept-Language", "en"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("title"))
                .andExpect(jsonPath("$.fieldErrors[0].code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors[0].message").value("Invalid input"));
    }

    @Test
    @DisplayName("Уншигдахгүй JSON → 400 VALIDATION_FAILED")
    void unreadableBody() throws Exception {
        mvc.perform(post("/probe/notes").contentType(MediaType.APPLICATION_JSON).content("{not json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("Үл мэдэгдэх алдаа → 500 INTERNAL, биед stack ба дотоод мессеж байхгүй")
    void unknownError() throws Exception {
        MvcResult result = mvc.perform(get("/probe/boom"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL"))
                .andExpect(jsonPath("$.message").value("Алдаа гарлаа"))
                .andReturn();
        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(body).doesNotContain("SELECT", "IllegalStateException", "at mn.aura", "trace\"", "exception");
    }

    @Test
    @DisplayName("Handler-гүй зам → 404 NOT_FOUND JSON")
    void noHandler() throws Exception {
        mvc.perform(get("/probe/does-not-exist"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    @DisplayName("ErrorCode нь гэрээний (openapi.yaml) ErrorCode enum-тэй яг тэнцүү")
    void errorCodeMatchesContract() {
        assertThat(Arrays.stream(ErrorCode.values()).map(Enum::name))
                .containsExactlyElementsOf(Arrays.stream(mn.aura.couple.api.model.ErrorCode.values()).map(Enum::name).toList());
    }
}
