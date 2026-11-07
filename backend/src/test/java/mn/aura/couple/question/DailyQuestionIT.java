package mn.aura.couple.question;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpResponse;
import java.time.Instant;
import mn.aura.couple.AbstractSpaceIT;
import mn.aura.couple.realtime.StompTestClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class DailyQuestionIT extends AbstractSpaceIT {

    @Test
    @DisplayName("AC-15 A хариулсны дараа ч B хариулах хүртэл хариулт аль ч API-д харагдахгүй; B хариулмагц хоёуланд")
    void revealOnlyAfterBoth() throws Exception {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("dq-a");
        TestUser b = user("dq-b");
        pair(a, b);
        JsonNode qa = ok(call(a, "GET", "/questions/today"), 200);
        JsonNode qb = ok(call(b, "GET", "/questions/today"), 200);
        assertThat(qa.path("question").path("id").asText()).isEqualTo(qb.path("question").path("id").asText());
        assertThat(qa.path("coupleDay").asText()).isEqualTo("2026-11-07");

        String secret = "Нууц хариулт-" + a.id();
        JsonNode afterA = ok(call(a, "POST", "/questions/today/answer", body("text", secret)), 200);
        assertThat(afterA.path("myAnswer").path("text").asText()).isEqualTo(secret);
        assertThat(afterA.path("partnerAnswered").asBoolean()).isFalse();
        assertThat(afterA.has("partnerAnswer")).isFalse();

        HttpResponse<String> bView = call(b, "GET", "/questions/today");
        assertThat(bView.body()).doesNotContain(secret);
        assertThat(ok(bView, 200).path("partnerAnswered").asBoolean()).isTrue();
        assertThat(call(b, "GET", "/questions/history").body()).doesNotContain(secret);
        assertThat(call(b, "GET", "/dashboard").body()).doesNotContain(secret);

        try (StompTestClient aClient = StompTestClient.connect(port, a.token()).events()) {
            Thread.sleep(300);
            JsonNode afterB = ok(call(b, "POST", "/questions/today/answer", body("text", "Миний хариулт")), 200);
            assertThat(afterB.path("partnerAnswer").path("text").asText()).isEqualTo(secret);
            JsonNode revealed = aClient.next("question.revealed", 5000);
            assertThat(revealed).isNotNull();
            assertThat(revealed.path("payload").path("partnerAnswer").path("text").asText()).isEqualTo("Миний хариулт");
            assertThat(revealed.path("payload").path("myAnswer").path("text").asText()).isEqualTo(secret);
        }
        HttpResponse<String> again = call(a, "POST", "/questions/today/answer", body("text", "дахин"));
        assertThat(again.statusCode()).isEqualTo(409);
        assertThat(code(again)).isEqualTo("ALREADY_ANSWERED");
    }

    @Test
    @DisplayName("AC-75 хосын бүсийн 00:00-д солигдож, өнгөрсөн асуулт түүхэнд хоёр хариулттайгаа")
    void dayRollsAtCoupleMidnight() {
        clock.set(Instant.parse("2026-11-07T15:30:00Z")); // УБ 23:30
        TestUser a = user("dqd-a");
        TestUser b = user("dqd-b");
        pair(a, b);
        String first = ok(call(a, "GET", "/questions/today"), 200).path("question").path("id").asText();
        ok(call(a, "POST", "/questions/today/answer", body("text", "А-гийн")), 200);
        ok(call(b, "POST", "/questions/today/answer", body("text", "Б-гийн")), 200);

        clock.set(Instant.parse("2026-11-07T16:00:30Z")); // УБ 00:00:30
        a = fresh(a);
        b = fresh(b);
        JsonNode next = ok(call(a, "GET", "/questions/today"), 200);
        assertThat(next.path("coupleDay").asText()).isEqualTo("2026-11-08");
        assertThat(next.path("question").path("id").asText()).isNotEqualTo(first);
        assertThat(next.path("myAnswer").isMissingNode() || next.path("myAnswer").isNull()).isTrue();

        JsonNode history = ok(call(b, "GET", "/questions/history"), 200);
        assertThat(history.path("items").path(0).path("coupleDay").asText()).isEqualTo("2026-11-07");
        assertThat(history.path("items").path(0).path("myAnswer").path("text").asText()).isEqualTo("Б-гийн");
        assertThat(history.path("items").path(0).path("partnerAnswer").path("text").asText()).isEqualTo("А-гийн");
    }
}
