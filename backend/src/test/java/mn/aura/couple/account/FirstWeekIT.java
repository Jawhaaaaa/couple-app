package mn.aura.couple.account;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FirstWeekIT extends AbstractSpaceIT {

    @Test
    @DisplayName("AC-134 шинэ хос: өдөрт нэг даалгавар (first-week.json), дуусгах/алгасах хэрэглэгч тутам, 8 дахь өдөр алга")
    void dailyTasks() {
        // UB 10:00 — хосын өдөр солигдох цэгээс хол
        clock.set(Instant.parse("2026-11-10T02:00:00Z"));
        TestUser a = user("fw-a");
        TestUser b = user("fw-b");
        JsonNode solo = ok(call(a, "GET", "/me/first-week-tasks"), 200);
        assertThat(solo.path("visible").asBoolean()).isFalse();
        assertThat(solo.has("today")).isFalse();

        pair(a, b);
        JsonNode s = ok(call(a, "GET", "/me/first-week-tasks"), 200);
        assertThat(s.path("day").asInt()).isEqualTo(1);
        assertThat(s.path("visible").asBoolean()).isTrue();
        assertThat(s.path("today").path("taskKey").asText()).isEqualTo("fw-1");
        assertThat(s.path("today").path("day").asInt()).isEqualTo(1);
        assertThat(s.path("today").path("status").isMissingNode() || s.path("today").path("status").isNull()).isTrue();

        s = ok(call(a, "PUT", "/me/first-week-tasks/fw-1", body("status", "DONE")), 200);
        assertThat(s.path("today").path("status").asText()).isEqualTo("DONE");
        // Хамтрагч тус тусдаа
        assertThat(ok(call(b, "GET", "/me/first-week-tasks"), 200).path("today").path("status").isMissingNode()).isTrue();
        assertThat(call(a, "PUT", "/me/first-week-tasks/fw-2", body("status", "DONE")).statusCode()).isEqualTo(404);
        assertThat(call(a, "PUT", "/me/first-week-tasks/unknown", body("status", "DONE")).statusCode()).isEqualTo(404);
        assertThat(call(a, "PUT", "/me/first-week-tasks/fw-1", body("status", "HIDDEN")).statusCode()).isEqualTo(400);

        advance(Duration.ofDays(1));
        a = fresh(a);
        s = ok(call(a, "GET", "/me/first-week-tasks"), 200);
        assertThat(s.path("day").asInt()).isEqualTo(2);
        assertThat(s.path("today").path("taskKey").asText()).isEqualTo("fw-2");
        s = ok(call(a, "PUT", "/me/first-week-tasks/fw-2", body("status", "SKIPPED")), 200);
        assertThat(s.path("today").path("status").asText()).isEqualTo("SKIPPED");

        advance(Duration.ofDays(5));
        a = fresh(a);
        s = ok(call(a, "GET", "/me/first-week-tasks"), 200);
        assertThat(s.path("day").asInt()).isEqualTo(7);
        assertThat(s.path("visible").asBoolean()).isTrue();
        assertThat(s.path("today").path("taskKey").asText()).isEqualTo("fw-7");

        advance(Duration.ofDays(1));
        a = fresh(a);
        s = ok(call(a, "GET", "/me/first-week-tasks"), 200);
        assertThat(s.path("visible").asBoolean()).isFalse();
        assertThat(s.path("day").asInt()).isEqualTo(7);
        assertThat(s.has("today")).isFalse();
    }

    @Test
    @DisplayName("AC-134 «Нуух» (firstWeekHidden) — даалгавар харагдахгүй")
    void hide() {
        TestUser a = user("fw-h");
        TestUser b = user("fw-hb");
        pair(a, b);
        assertThat(ok(call(a, "GET", "/me/first-week-tasks"), 200).path("visible").asBoolean()).isTrue();
        ok(call(a, "PATCH", "/me/preferences", body("firstWeekHidden", true)), 200);
        JsonNode s = ok(call(a, "GET", "/me/first-week-tasks"), 200);
        assertThat(s.path("visible").asBoolean()).isFalse();
        assertThat(s.has("today")).isFalse();
        assertThat(ok(call(b, "GET", "/me/first-week-tasks"), 200).path("visible").asBoolean()).isTrue();
    }
}
