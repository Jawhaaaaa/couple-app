package mn.aura.couple.anniversary;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import mn.aura.couple.realtime.StompTestClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class GiftIdeaIT extends AbstractSpaceIT {

    static final String SECRET = "Мөнгөн бугуйвч — нууц";

    @Test
    @DisplayName("AC-40 A-гийн нууц бэлгийн санаа B-гийн аль ч endpoint, WS-д 0 (INV-04)")
    void secretFromPartner() throws Exception {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("gi-a");
        TestUser b = user("gi-b");
        UUID space = pair(a, b);
        jdbc.update("UPDATE space SET start_date = '2024-10-24', start_date_confirmed = true WHERE id = ?", space);
        JsonNode an = ok(call(a, "POST", "/anniversaries",
                AnniversaryIT.anniversary("Ой", "2026-12-07", "ANNIVERSARY", true, "[7]")), 201);
        String custom = "custom:" + an.path("id").asText();

        JsonNode idea;
        try (StompTestClient bClient = StompTestClient.connect(port, b.token()).events()) {
            Thread.sleep(300);
            idea = ok(call(a, "POST", "/gift-ideas", "{\"occasionKey\":\"days:1000\",\"text\":\"" + SECRET + "\"}"), 201);
            ok(call(a, "POST", "/gift-ideas", "{\"occasionKey\":\"" + custom + "\",\"text\":\"" + SECRET + " 2\"}"), 201);
            ok(call(a, "PATCH", "/gift-ideas/" + idea.path("id").asText(), "{\"done\":true}"), 200);
            assertThat(bClient.drain(1000).toString()).doesNotContain(SECRET);
        }
        assertThat(idea.path("done").asBoolean()).isFalse();

        // A өөрийнхөө жагсаалтад
        assertThat(ok(call(a, "GET", "/gift-ideas"), 200)).hasSize(2);
        assertThat(ok(call(a, "GET", "/gift-ideas?occasionKey=days:1000"), 200).get(0).path("done").asBoolean()).isTrue();

        // B — бүх endpoint-д 0
        assertThat(ok(call(b, "GET", "/gift-ideas"), 200)).isEmpty();
        assertThat(ok(call(b, "GET", "/gift-ideas?occasionKey=days:1000"), 200)).isEmpty();
        for (String path : new String[] {"/anniversaries", "/anniversaries?from=2024-01-01", "/occasions/days:1000",
                "/occasions/" + custom, "/anniversaries/" + an.path("id").asText(), "/dashboard", "/me/celebrations",
                "/notifications"}) {
            String body = call(b, "GET", path).body();
            assertThat(body).as(path).doesNotContain(SECRET);
        }
        assertThat(code(call(b, "PATCH", "/gift-ideas/" + idea.path("id").asText(), "{\"text\":\"x\"}"))).isEqualTo("NOT_FOUND");
        assertThat(code(call(b, "DELETE", "/gift-ideas/" + idea.path("id").asText()))).isEqualTo("NOT_FOUND");
        assertThat(ok(call(a, "GET", "/gift-ideas"), 200)).hasSize(2);

        // Устгах — зөвхөн эзэн
        ok(call(a, "DELETE", "/gift-ideas/" + idea.path("id").asText()), 204);
        assertThat(ok(call(a, "GET", "/gift-ideas"), 200)).hasSize(1);
        // Ой устахад түүний бэлгийн санаа ч устна
        ok(call(a, "DELETE", "/anniversaries/" + an.path("id").asText()), 204);
        assertThat(ok(call(a, "GET", "/gift-ideas"), 200)).isEmpty();
    }
}
