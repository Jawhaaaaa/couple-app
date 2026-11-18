package mn.aura.couple.lists;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.util.List;
import mn.aura.couple.AbstractSpaceIT;
import mn.aura.couple.lists.app.GoalService;
import mn.aura.couple.realtime.StompTestClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class GoalIT extends AbstractSpaceIT {

    @Test
    @DisplayName("AC-108 UT явц: 4 алхмаас 2 → 50%; мөнгөн 1 000 000-аас 250 000 + 150 000 → 40%; 100%-иар хязгаарлана")
    void progressFormula() {
        assertThat(GoalService.progress(null, 0, 2, 4)).isEqualByComparingTo(BigDecimal.valueOf(50));
        assertThat(GoalService.progress(1_000_000L, 400_000, 0, 3)).isEqualByComparingTo(BigDecimal.valueOf(40));
        assertThat(GoalService.progress(1_000_000L, 1_500_000, 0, 0)).isEqualByComparingTo(BigDecimal.valueOf(100));
        assertThat(GoalService.progress(null, 0, 0, 0)).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(GoalService.progress(null, 0, 1, 3)).isEqualByComparingTo(new BigDecimal("33.3"));
    }

    @Test
    @DisplayName("AC-108 4 алхамтай зорилгод 2 алхам дуусгахад «2/4»; мөнгөн зорилгод 250 000 + 150 000 → 40%")
    void stepsAndMoney() {
        TestUser a = user("goal-a");
        TestUser b = user("goal-b");
        pair(a, b);
        JsonNode g = ok(call(a, "POST", "/goals", body("title", "Аялалд бэлдэх",
                "steps", List.of("Виз", "Тасалбар", "Буудал", "Даатгал"))), 201);
        String id = g.path("id").asText();
        assertThat(g.path("steps").size()).isEqualTo(4);
        ok(call(a, "PATCH", "/goal-steps/" + g.path("steps").get(0).path("id").asText(), body("done", true)), 200);
        JsonNode two = ok(call(b, "PATCH", "/goal-steps/" + g.path("steps").get(1).path("id").asText(), body("done", true)), 200);
        assertThat(two.path("stepsDone").asInt()).isEqualTo(2);
        assertThat(two.path("progressPercent").asDouble()).isEqualTo(50.0);
        assertThat(two.path("steps").get(1).path("doneBy").asText()).isEqualTo(b.id().toString());
        JsonNode summary = ok(call(b, "GET", "/goals"), 200).get(0);
        assertThat(summary.path("stepsDone").asInt()).isEqualTo(2);
        assertThat(summary.path("stepsTotal").asInt()).isEqualTo(4);

        String money = ok(call(a, "POST", "/goals", body("title", "Машин", "targetAmountMnt", 1_000_000, "steps", List.of())), 201)
                .path("id").asText();
        ok(call(a, "POST", "/goals/" + money + "/contributions", body("amountMnt", 250_000)), 201);
        JsonNode m = ok(call(b, "POST", "/goals/" + money + "/contributions", body("amountMnt", 150_000)), 201);
        assertThat(m.path("progressPercent").asDouble()).isEqualTo(40.0);
        for (JsonNode t : m.path("totals")) {
            long expected = t.path("userId").asText().equals(a.id().toString()) ? 250_000 : 150_000;
            assertThat(t.path("amount").asLong()).isEqualTo(expected);
        }
        // Бусдын хандивыг устгахгүй
        String bContribution = m.path("contributions").get(1).path("id").asText();
        assertThat(code(call(a, "DELETE", "/goal-contributions/" + bContribution))).isEqualTo("NOT_OWNER");
        ok(call(b, "DELETE", "/goal-contributions/" + bContribution), 204);
        assertThat(ok(call(a, "GET", "/goals/" + money), 200).path("progressPercent").asDouble()).isEqualTo(25.0);

        // Бүх алхам → completedAt
        JsonNode full = null;
        for (int i = 2; i < 4; i++) {
            full = ok(call(a, "PATCH", "/goal-steps/" + g.path("steps").get(i).path("id").asText(), body("done", true)), 200);
        }
        assertThat(full.path("completedAt").asText()).isNotBlank();
        assertThat(id).isEqualTo(full.path("id").asText());
    }

    @Test
    @DisplayName("AC-42 A хандив нэмэхэд B-д goal.updated (явц ба «хэн хэд»); version зөрчил 409; өөр хос 404")
    void realtimeAndConflict() throws Exception {
        TestUser a = user("goalr-a");
        TestUser b = user("goalr-b");
        TestUser c = user("goalr-c");
        pair(a, b);
        JsonNode g = ok(call(a, "POST", "/goals", body("title", "Хадгаламж", "targetAmountMnt", 500_000, "steps", List.of())), 201);
        String id = g.path("id").asText();
        try (StompTestClient bClient = StompTestClient.connect(port, b.token()).events()) {
            Thread.sleep(300);
            ok(call(a, "POST", "/goals/" + id + "/contributions", body("amountMnt", 100_000)), 201);
            JsonNode ev = bClient.next("goal.updated", 3000).path("payload");
            assertThat(ev.path("progressPercent").asDouble()).isEqualTo(20.0);
            assertThat(ev.path("totals").toString()).contains(a.id().toString());
        }
        long v = g.path("version").asLong();
        ok(call(a, "PATCH", "/goals/" + id, body("title", "Хадгаламж 2027", "version", v)), 200);
        JsonNode conflict = ok(call(b, "PATCH", "/goals/" + id, body("title", "Өөр", "version", v)), 409);
        assertThat(conflict.path("details").path("current").path("title").asText()).isEqualTo("Хадгаламж 2027");
        assertThat(call(c, "GET", "/goals/" + id).statusCode()).isEqualTo(404);
        ok(call(b, "DELETE", "/goals/" + id), 204);
        assertThat(ok(call(a, "GET", "/goals"), 200).size()).isZero();
    }
}
