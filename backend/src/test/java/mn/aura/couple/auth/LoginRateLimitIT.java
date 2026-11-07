package mn.aura.couple.auth;

import static mn.aura.couple.HttpTestClient.json;
import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.time.Duration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** T-18: нэвтрэх оролдлогын хязгаар (DD-AURA-029). */
@DisplayName("Нэвтрэлтийн хязгаар — LoginRateLimiter")
class LoginRateLimitIT extends AbstractAuthIT {

    @Test
    @DisplayName("AC-05 нэг IP + имэйлээс 15 мин дотор 11 дэх оролдлого → 429 RATE_LIMITED + Retry-After, ойлгомжтой мессеж")
    void eleventhAttemptIsRateLimited() {
        String email = email("brute");
        registerVerified(email);
        for (int i = 1; i <= 10; i++) {
            HttpResponse<String> r = login(email, "Wrong-Password-" + i);
            assertThat(r.statusCode()).as("оролдлого " + i).isEqualTo(401);
            assertThat(code(r)).isEqualTo("AUTH_INVALID_CREDENTIALS");
        }
        HttpResponse<String> eleventh = login(email, PASSWORD, "Accept-Language", "en");
        assertThat(eleventh.statusCode()).isEqualTo(429);
        assertThat(code(eleventh)).isEqualTo("RATE_LIMITED");
        int retryAfter = json(eleventh).path("retryAfterSeconds").asInt();
        assertThat(retryAfter).isBetween(1, 15 * 60);
        assertThat(eleventh.headers().firstValue("Retry-After")).contains(String.valueOf(retryAfter));
        assertThat(json(eleventh).path("message").asText()).isNotBlank().isNotEqualTo("RATE_LIMITED");

        // Өөр имэйл (ижил IP) хязгаарлагдахгүй
        String other = email("innocent");
        registerVerified(other);
        assertThat(login(other, PASSWORD).statusCode()).isEqualTo(200);

        // Цонх дуусахад дахин нэвтэрнэ
        advance(Duration.ofSeconds(retryAfter + 1));
        assertThat(login(email, PASSWORD).statusCode()).isEqualTo(200);
    }

    @Test
    @DisplayName("AC-05 амжилттай нэвтрэлт тоолуурыг цэвэрлэнэ; бүртгэлгүй имэйл 401 (ижил код)")
    void successResetsCounter() {
        String email = email("reset-counter");
        registerVerified(email);
        for (int i = 0; i < 9; i++) {
            assertThat(login(email, "nope-" + i).statusCode()).isEqualTo(401);
        }
        assertThat(login(email, PASSWORD).statusCode()).isEqualTo(200);
        for (int i = 0; i < 9; i++) {
            assertThat(login(email, "nope-" + i).statusCode()).isEqualTo(401);
        }
        assertThat(login(email, PASSWORD).statusCode()).isEqualTo(200);
        HttpResponse<String> unknown = login(email("ghost"), PASSWORD);
        assertThat(unknown.statusCode()).isEqualTo(401);
        assertThat(code(unknown)).isEqualTo("AUTH_INVALID_CREDENTIALS");
    }
}
