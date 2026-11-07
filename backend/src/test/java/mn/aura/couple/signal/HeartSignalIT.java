package mn.aura.couple.signal;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import mn.aura.couple.realtime.StompTestClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class HeartSignalIT extends AbstractSpaceIT {

    @Test
    @DisplayName("AC-19 минутад 10 дохио; 11 дэх нь 429 (+retryAfterSeconds); минутын дараа дахин")
    void rateLimit() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("hs-a");
        TestUser b = user("hs-b");
        pair(a, b);
        for (int i = 0; i < 10; i++) {
            ok(call(a, "POST", "/signals", signal("HEART", null)), 201);
        }
        HttpResponse<String> eleventh = call(a, "POST", "/signals", signal("HEART", null));
        assertThat(eleventh.statusCode()).isEqualTo(429);
        assertThat(code(eleventh)).isEqualTo("RATE_LIMITED");
        assertThat(mn.aura.couple.HttpTestClient.json(eleventh).path("retryAfterSeconds").asInt()).isBetween(1, 60);
        clock.set(Instant.parse("2026-11-07T04:01:01Z"));
        ok(call(a, "POST", "/signals", signal("HEART", null)), 201);
    }

    @Test
    @DisplayName("AC-78 өнөөдрийн илгээсэн/хүлээн авсан тоо хоёр талд толин тусгал, хосын 00:00-д тэглэгдэнэ")
    void dailyCounts() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("hc-a");
        TestUser b = user("hc-b");
        pair(a, b);
        for (int i = 0; i < 5; i++) {
            ok(call(a, "POST", "/signals", signal("HEART", null)), 201);
        }
        for (int i = 0; i < 3; i++) {
            ok(call(b, "POST", "/signals", signal("HUG", null)), 201);
        }
        JsonNode da = ok(call(a, "GET", "/dashboard"), 200).path("signalsToday");
        JsonNode db = ok(call(b, "GET", "/dashboard"), 200).path("signalsToday");
        assertThat(da.path("sent").asInt()).isEqualTo(5);
        assertThat(da.path("received").asInt()).isEqualTo(3);
        assertThat(db.path("sent").asInt()).isEqualTo(3);
        assertThat(db.path("received").asInt()).isEqualTo(5);

        clock.set(Instant.parse("2026-11-07T16:00:01Z")); // УБ 00:00
        a = fresh(a);
        JsonNode next = ok(call(a, "GET", "/dashboard"), 200).path("signalsToday");
        assertThat(next.path("sent").asInt()).isZero();
        assertThat(next.path("received").asInt()).isZero();
    }

    @Test
    @DisplayName("AC-17 AC-18 нээлттэй апп-д signal.received; хаалттай үеийн 3 зүрх нэг нэгтгэл; seen-ийн дараа хоосон")
    void realtimeAndUnseen() throws Exception {
        TestUser a = user("hu-a");
        TestUser b = user("hu-b");
        pair(a, b);
        try (StompTestClient bClient = StompTestClient.connect(port, b.token()).events()) {
            Thread.sleep(300);
            ok(call(a, "POST", "/signals", signal("HEART", null)), 201);
            JsonNode e = bClient.next("signal.received", 2000);
            assertThat(e).isNotNull();
            assertThat(e.path("payload").path("kind").asText()).isEqualTo("HEART");
        }
        ok(call(a, "POST", "/signals", signal("HEART", null)), 201);
        ok(call(a, "POST", "/signals", signal("THINKING", "Чамайг санаж байна")), 201);
        JsonNode unseen = ok(call(b, "GET", "/signals/unseen"), 200);
        assertThat(unseen.path("count").asInt()).isEqualTo(3);
        assertThat(unseen.path("lastText").asText()).isEqualTo("Чамайг санаж байна");
        assertThat(ok(call(b, "GET", "/dashboard"), 200).path("unseenSignals").path("count").asInt()).isEqualTo(3);
        ok(call(b, "POST", "/signals/seen"), 204);
        assertThat(ok(call(b, "GET", "/signals/unseen"), 200).path("count").asInt()).isZero();
        assertThat(ok(call(a, "GET", "/signals/unseen"), 200).path("count").asInt()).isZero();
    }

    @Test
    @DisplayName("AC-77 «Чамайг бодож байна» 80-аас урт текст → TEXT_TOO_LONG; ижил clientId давтагдахгүй")
    void textLimitAndIdempotency() {
        TestUser a = user("ht-a");
        TestUser b = user("ht-b");
        pair(a, b);
        HttpResponse<String> tooLong = call(a, "POST", "/signals", signal("THINKING", "ж".repeat(81)));
        assertThat(tooLong.statusCode()).isEqualTo(400);
        assertThat(code(tooLong)).isEqualTo("TEXT_TOO_LONG");
        String body = signal("THINKING", "ж".repeat(80));
        String id1 = ok(call(a, "POST", "/signals", body), 201).path("id").asText();
        String id2 = ok(call(a, "POST", "/signals", body), 201).path("id").asText();
        assertThat(id2).isEqualTo(id1);
    }

    private String signal(String kind, String text) {
        return text == null ? body("kind", kind, "clientId", UUID.randomUUID().toString())
                : body("kind", kind, "text", text, "clientId", UUID.randomUUID().toString());
    }
}
