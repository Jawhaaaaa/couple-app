package mn.aura.couple.anniversary;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class CelebrationIT extends AbstractSpaceIT {

    @Test
    @DisplayName("AC-39 AC-MO-02 тоолуур 1000 болох өдөр A, B тус бүрд нэг удаа (GAP-23 — сервер тэмдэглэнэ)")
    void milestoneOncePerUser() {
        clock.set(Instant.parse("2027-07-20T04:00:00Z"));
        TestUser a = user("cl-a");
        TestUser b = user("cl-b");
        UUID space = pair(a, b);
        // SD-01: 2024-10-24-нд эхэлсэн хосын 1000 дахь өдөр = 2027-07-20 (SD-06)
        jdbc.update("UPDATE space SET start_date = '2024-10-24', start_date_confirmed = true WHERE id = ?", space);
        assertThat(ok(call(a, "GET", "/dashboard"), 200).path("counter").path("days").asInt()).isEqualTo(1000);

        JsonNode forA = ok(call(a, "GET", "/me/celebrations"), 200);
        JsonNode milestone = only(forA, "milestone:days:1000");
        assertThat(milestone.path("kind").asText()).isEqualTo("MILESTONE");
        assertThat(milestone.path("days").asInt()).isEqualTo(1000);
        only(ok(call(b, "GET", "/me/celebrations"), 200), "milestone:days:1000");

        ok(call(a, "POST", "/me/celebrations/milestone:days:1000/seen"), 204);
        ok(call(a, "POST", "/me/celebrations/milestone:days:1000/seen"), 204); // idempotent
        assertThat(keys(ok(call(a, "GET", "/me/celebrations"), 200))).doesNotContain("milestone:days:1000");
        // B хараахан үзээгүй — түүнд хэвээр
        only(ok(call(b, "GET", "/me/celebrations"), 200), "milestone:days:1000");
        ok(call(b, "POST", "/me/celebrations/milestone:days:1000/seen"), 204);
        assertThat(keys(ok(call(b, "GET", "/me/celebrations"), 200))).doesNotContain("milestone:days:1000");

        // Маргааш баяр байхгүй
        clock.set(Instant.parse("2027-07-21T04:00:00Z"));
        assertThat(keys(ok(call(fresh(b), "GET", "/me/celebrations"), 200))).doesNotContain("milestone:days:1000");
    }

    @Test
    @DisplayName("AC-39 давтагдах ойн өдөр ANNIVERSARY баяр — ирэх жил дахин гарна")
    void recurringAnniversary() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("cr-a");
        TestUser b = user("cr-b");
        pair(a, b);
        JsonNode an = ok(call(a, "POST", "/anniversaries",
                AnniversaryIT.anniversary("Анх уулзсан", "2025-11-07", "FIRST_MET", true, "[]")), 201);
        String key = "anniversary:custom:" + an.path("id").asText() + ":2026";
        JsonNode c = only(ok(call(b, "GET", "/me/celebrations"), 200), key);
        assertThat(c.path("kind").asText()).isEqualTo("ANNIVERSARY");
        assertThat(c.path("title").asText()).isEqualTo("Анх уулзсан");
        ok(call(b, "POST", "/me/celebrations/" + key + "/seen"), 204);
        assertThat(keys(ok(call(b, "GET", "/me/celebrations"), 200))).doesNotContain(key);

        clock.set(Instant.parse("2027-11-07T04:00:00Z"));
        only(ok(call(fresh(b), "GET", "/me/celebrations"), 200), "anniversary:custom:" + an.path("id").asText() + ":2027");
    }

    private static JsonNode only(JsonNode list, String key) {
        for (JsonNode c : list) {
            if (key.equals(c.path("eventKey").asText())) {
                return c;
            }
        }
        throw new AssertionError(key + " олдсонгүй: " + list);
    }

    private static java.util.List<String> keys(JsonNode list) {
        java.util.List<String> out = new java.util.ArrayList<>();
        list.forEach(c -> out.add(c.path("eventKey").asText()));
        return out;
    }
}
