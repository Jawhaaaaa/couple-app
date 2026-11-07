package mn.aura.couple.memory;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class MemorySearchIT extends AbstractMemoryIT {

    @Test
    @DisplayName("AC-175 шүүлт: текст (тайлбар, сэтгэгдэл, шошго), огноо, шошго, хэн нэмсэн, байршил; сарын тоо; cursor")
    void filters() {
        TestUser a = user("ms1-a");
        TestUser b = user("ms1-b");
        pair(a, b);
        String m1 = memory(a, "Тэрэлж", "2026-10-03", "\"description\":\"Өвлийн аялал\",\"tags\":[\"аялал\"],"
                + "\"location\":{\"name\":\"Тэрэлж\",\"lat\":47.98,\"lon\":107.45},\"locationSource\":\"MANUAL\"")
                .path("id").asText();
        String m2 = memory(b, "Кино", "2026-09-10", null).path("id").asText();
        ok(call(a, "POST", "/memories/" + m2 + "/comments", body("text", "Дараагийн аялал хаашаа вэ",
                "clientId", UUID.randomUUID().toString())), 201);
        memory(b, "Хоол", "2026-08-01", "\"tags\":[\"хоол\"]");

        assertThat(ids(call(a, "GET", "/memories?q=" + enc("аялал")))).containsExactlyInAnyOrder(m1, m2);
        assertThat(ids(call(a, "GET", "/memories?tag=" + enc("аялал")))).containsExactly(m1);
        assertThat(ids(call(a, "GET", "/memories?author=partner"))).hasSize(2);
        assertThat(ids(call(a, "GET", "/memories?from=2026-09-01&to=2026-09-30"))).containsExactly(m2);
        assertThat(ids(call(a, "GET", "/memories?hasLocation=true"))).containsExactly(m1);
        assertThat(ids(call(a, "GET", "/memories?place=" + enc("тэрэ")))).containsExactly(m1);

        JsonNode page1 = ok(call(a, "GET", "/memories?limit=2"), 200);
        assertThat(page1.path("items")).hasSize(2);
        assertThat(page1.path("items").path(0).path("id").asText()).isEqualTo(m1); // шинээс хуучин
        JsonNode page2 = ok(call(a, "GET", "/memories?limit=2&cursor=" + page1.path("nextCursor").asText()), 200);
        assertThat(page2.path("items")).hasSize(1);

        JsonNode months = ok(call(b, "GET", "/memories/months"), 200);
        assertThat(months.path(0).path("year").asInt()).isEqualTo(2026);
        assertThat(months.path(0).path("month").asInt()).isEqualTo(10);
        assertThat(months.path(0).path("count").asInt()).isEqualTo(1);
        assertThat(ok(call(a, "GET", "/memory-tags"), 200).toString()).contains("аялал").contains("хоол");
        JsonNode places = ok(call(b, "GET", "/memories/places"), 200);
        assertThat(places.path(0).path("placeName").asText()).isEqualTo("Тэрэлж");
        assertThat(places.path(0).path("memoryIds").path(0).asText()).isEqualTo(m1);
    }

    @Test
    @DisplayName("AC-25 10 000 дурсамжтай хос дээр «аялал» хайлт ≤ 500 ms (trgm индекс)")
    void performance() {
        TestUser a = user("msp-a");
        TestUser b = user("msp-b");
        UUID space = pair(a, b);
        jdbc.update("""
                INSERT INTO memory (id, space_id, author_id, client_id, title, description, occurred_on, search_text)
                SELECT gen_random_uuid(), ?, ?, gen_random_uuid(), 'Дурсамж ' || g,
                       CASE WHEN g % 50 = 0 THEN 'Хамтын аялал ' || g ELSE 'Энгийн өдөр ' || g END,
                       date '2020-01-01' + (g % 2000),
                       lower('Дурсамж ' || g || ' ' || CASE WHEN g % 50 = 0 THEN 'хамтын аялал' ELSE 'энгийн өдөр' END)
                  FROM generate_series(1, 10000) g
                """, space, a.id());
        jdbc.execute("ANALYZE memory");
        call(a, "GET", "/memories?q=" + enc("аялал")); // халаалт
        long start = System.nanoTime();
        JsonNode r = ok(call(a, "GET", "/memories?q=" + enc("аялал")), 200);
        long ms = (System.nanoTime() - start) / 1_000_000;
        assertThat(r.path("items")).hasSize(30);
        assertThat(ms).as("хайлтын хугацаа").isLessThanOrEqualTo(500);
    }

    private static java.util.List<String> ids(java.net.http.HttpResponse<String> r) {
        java.util.List<String> out = new java.util.ArrayList<>();
        mn.aura.couple.HttpTestClient.json(r).path("items").forEach(n -> out.add(n.path("id").asText()));
        return out;
    }

    private static String enc(String s) {
        return java.net.URLEncoder.encode(s, java.nio.charset.StandardCharsets.UTF_8);
    }
}
