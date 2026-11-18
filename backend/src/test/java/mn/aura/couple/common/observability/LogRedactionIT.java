package mn.aura.couple.common.observability;

import static mn.aura.couple.HttpTestClient.send;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.http.HttpResponse;
import java.util.List;
import mn.aura.couple.AbstractIntegrationTest;
import mn.aura.itprobe.ObservabilityProbe;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

/** AC-196, INV-11: хэрэглэгчийн текст логт бичигдэхгүй; лог JSON (AC-202). */
@ExtendWith(OutputCaptureExtension.class)
@Import(ObservabilityProbe.class)
@TestPropertySource(properties = {
        // Spring-ийн вэб/security DEBUG асаалттай үед ч body логт гарахгүй байх ёстой
        "logging.level.org.springframework.web=DEBUG",
        "logging.level.org.springframework.security=DEBUG"
})
@DisplayName("Логийн нууцлал")
class LogRedactionIT extends AbstractIntegrationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String SECRET = "nuuts-zahidal-7f3a9c Миний хайрт чамдаа";

    @Test
    @DisplayName("AC-196 @Sensitive текст хүсэлтийн дараа логт 0 удаа, DTO-ийн бусад талбар харагдана")
    void sensitiveTextAbsentFromLogs(CapturedOutput output) throws Exception {
        String body = MAPPER.writeValueAsString(new ObservabilityProbe.SecretNote("ойн баяр", SECRET));
        HttpResponse<String> r = send("POST", url("/it/notes"), body);
        assertThat(r.statusCode()).isEqualTo(200);

        String logs = output.getAll();
        assertThat(logs).contains("ProbeController");
        assertThat(logs).doesNotContain("nuuts-zahidal-7f3a9c");
        assertThat(logs).doesNotContain("Миний хайрт");
        assertThat(logs).contains("text=" + LogRedaction.MASK);
    }

    @Test
    @DisplayName("AC-202 логийн мөр JSON: @timestamp, level, logger_name, message, traceId")
    void logsAreJson(CapturedOutput output) throws Exception {
        String body = MAPPER.writeValueAsString(new ObservabilityProbe.SecretNote("json", SECRET));
        HttpResponse<String> r = send("POST", url("/it/notes"), body);
        String traceId = r.headers().firstValue("X-Trace-Id").orElseThrow();

        List<JsonNode> probeLines = output.getOut().lines()
                .filter(l -> l.startsWith("{") && l.contains("ProbeController"))
                .map(LogRedactionIT::parse)
                .toList();
        assertThat(probeLines).isNotEmpty();
        JsonNode line = probeLines.get(probeLines.size() - 1);
        assertThat(line.has("@timestamp")).isTrue();
        assertThat(line.path("level").asText()).isEqualTo("INFO");
        assertThat(line.path("message").asText()).contains("text=***");
        assertThat(line.path("traceId").asText()).isEqualTo(traceId);
    }

    @Test
    @DisplayName("AC-196 LogRedaction.toString/redact нь @Sensitive талбарыг далдална")
    void redactionUtility() {
        var note = new ObservabilityProbe.SecretNote("гарчиг", SECRET);
        assertThat(note.toString()).isEqualTo("SecretNote[title=гарчиг, text=***]");
        assertThat(LogRedaction.redact(note)).containsEntry("text", "***").containsEntry("title", "гарчиг");
    }

    private static JsonNode parse(String line) {
        try {
            return MAPPER.readTree(line);
        } catch (Exception e) {
            throw new AssertionError("JSON биш лог: " + line, e);
        }
    }
}
