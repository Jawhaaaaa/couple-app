package mn.aura.couple.common;

import static mn.aura.couple.HttpTestClient.send;
import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import mn.aura.couple.AbstractIntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** AC-195: CORS зөвхөн тохируулсан origin-д (`aura.cors.allowed-origins`, test: http://allowed.example). */
@DisplayName("CORS")
class CorsIT extends AbstractIntegrationTest {

    private static final String ALLOWED = "http://allowed.example";
    private static final String EVIL = "http://evil.example";

    private HttpResponse<String> preflight(String path, String origin) {
        return send("OPTIONS", url(path), null,
                "Origin", origin,
                "Access-Control-Request-Method", "POST",
                "Access-Control-Request-Headers", "content-type,authorization");
    }

    @Test
    @DisplayName("AC-195 зөвшөөрсөн origin-ий preflight → ACAO толгой, credentials=true")
    void allowedOriginPreflight() {
        HttpResponse<String> r = preflight("/api/v1/auth/login", ALLOWED);
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(r.headers().firstValue("Access-Control-Allow-Origin")).hasValue(ALLOWED);
        assertThat(r.headers().firstValue("Access-Control-Allow-Credentials")).hasValue("true");
    }

    @Test
    @DisplayName("AC-195 зөвшөөрсөн origin-ий энгийн хүсэлтэд ACAO толгой (401 хариунд ч)")
    void allowedOriginActualRequest() {
        HttpResponse<String> r = send("GET", url("/api/v1/me"), null, "Origin", ALLOWED);
        assertThat(r.statusCode()).isEqualTo(401);
        assertThat(r.headers().firstValue("Access-Control-Allow-Origin")).hasValue(ALLOWED);
    }

    @Test
    @DisplayName("AC-195 бусад origin-ий preflight → 403, ACAO толгойгүй")
    void otherOriginRejected() {
        HttpResponse<String> r = preflight("/api/v1/auth/login", EVIL);
        assertThat(r.statusCode()).isEqualTo(403);
        assertThat(r.headers().firstValue("Access-Control-Allow-Origin")).isEmpty();

        HttpResponse<String> actual = send("GET", url("/api/v1/me"), null, "Origin", EVIL);
        assertThat(actual.headers().firstValue("Access-Control-Allow-Origin")).isEmpty();
    }

    @Test
    @DisplayName("AC-195 CORS зөвхөн /api/** — actuator-т ACAO толгой байхгүй")
    void actuatorHasNoCors() {
        HttpResponse<String> r = send("GET", url("/actuator/health"), null, "Origin", ALLOWED);
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(r.headers().firstValue("Access-Control-Allow-Origin")).isEmpty();
    }

    @Test
    @DisplayName("AC-195 токенгүй хамгаалагдсан endpoint → 401 TOKEN_INVALID ApiError")
    void unauthorizedIsApiError() {
        HttpResponse<String> r = send("GET", url("/api/v1/me"), null);
        assertThat(r.statusCode()).isEqualTo(401);
        assertThat(mn.aura.couple.HttpTestClient.json(r).path("code").asText()).isEqualTo("TOKEN_INVALID");
        assertThat(mn.aura.couple.HttpTestClient.json(r).path("traceId").asText()).hasSize(32);
    }
}
