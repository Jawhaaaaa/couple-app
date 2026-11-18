package mn.aura.couple.memory;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.UUID;
import mn.aura.couple.HttpTestClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class MemoryRecapIT extends AbstractMemoryIT {

    @Test
    @DisplayName("AC-84 ойн өдөр ≥ 5 дурсамжтай жилд story үүсч нүүрэнд карт; < 5 бол үүсэхгүй")
    void recapOnAnniversary() {
        clock.set(Instant.parse("2026-11-06T04:00:00Z"));
        TestUser a = user("rc-a");
        TestUser b = user("rc-b");
        pair(a, b);
        ok(call(a, "PUT", "/couple/start-date", body("date", "2025-11-07")), 200);
        ok(call(b, "PUT", "/couple/start-date", body("date", "2025-11-07")), 200);
        String[] dates = {"2025-12-01", "2026-01-15", "2026-03-08", "2026-06-20", "2026-09-09", "2026-10-30"};
        String fav = null;
        for (String d : dates) {
            String id = memory(a, "Дурсамж " + d, d, null).path("id").asText();
            fav = fav == null ? id : fav;
        }
        ok(call(b, "PUT", "/memories/" + fav + "/favorite"), 204);

        TestUser c = user("rc-c");
        TestUser d = user("rc-d");
        pair(c, d);
        ok(call(c, "PUT", "/couple/start-date", body("date", "2025-11-07")), 200);
        ok(call(d, "PUT", "/couple/start-date", body("date", "2025-11-07")), 200);
        for (int i = 1; i <= 4; i++) {
            memory(c, "Цөөн " + i, "2026-0" + i + "-01", null);
        }

        clock.set(Instant.parse("2026-11-07T01:00:00Z")); // УБ 09:00, 1 жилийн ой
        HttpTestClient.send("POST", url("/api/v1/test/jobs/memoryRecap/run"), null);
        a = fresh(a);
        c = fresh(c);
        JsonNode recaps = ok(call(a, "GET", "/recaps"), 200);
        assertThat(recaps).hasSize(1);
        assertThat(recaps.path(0).path("anniversaryOn").asText()).isEqualTo("2026-11-07");
        assertThat(recaps.path(0).path("yearLabel").asText()).isEqualTo("1 дэх жил");
        JsonNode recap = ok(call(a, "GET", "/recaps/" + recaps.path(0).path("id").asText()), 200);
        assertThat(recap.path("slides").path(0).path("kind").asText()).isEqualTo("TITLE");
        long memorySlides = 0;
        for (JsonNode s : recap.path("slides")) {
            memorySlides += "MEMORY".equals(s.path("kind").asText()) ? 1 : 0;
        }
        assertThat(memorySlides).isBetween(5L, 6L);
        assertThat(recap.toString()).contains(fav);
        assertThat(ok(call(a, "GET", "/dashboard"), 200).path("recap").path("id").asText())
                .isEqualTo(recaps.path(0).path("id").asText());

        assertThat(ok(call(c, "GET", "/recaps"), 200)).isEmpty();
        // Давтан ажиллавал шинэ хураангуй үүсэхгүй
        HttpTestClient.send("POST", url("/api/v1/test/jobs/memoryRecap/run"), null);
        assertThat(ok(call(a, "GET", "/recaps"), 200)).hasSize(1);
        assertThat(call(c, "GET", "/recaps/" + recaps.path(0).path("id").asText()).statusCode()).isEqualTo(404);
        assertThat(UUID.fromString(recaps.path(0).path("id").asText())).isNotNull();
    }
}
