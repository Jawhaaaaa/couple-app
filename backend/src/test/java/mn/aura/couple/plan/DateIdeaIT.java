package mn.aura.couple.plan;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class DateIdeaIT extends AbstractSpaceIT {

    @Test
    @DisplayName("AC-179 бүх талбартай санаа хадгалагдаж ангиллаар шүүгдэнэ; гарчиггүй бол title талбарын алдаа")
    void createFilterAndValidate() {
        TestUser a = user("di-a");
        TestUser b = user("di-b");
        pair(a, b);
        JsonNode created = ok(call(a, "POST", "/ideas", body("title", "Тэрэлж рүү аялал", "description", "Амралтын өдөр",
                "category", "TRAVEL", "budgetMnt", 120000, "url", "https://aura.example.mn/terelj", "setting", "OUTDOOR",
                "place", Map.of("name", "Тэрэлж", "lat", 47.98, "lon", 107.45), "clientId", UUID.randomUUID().toString())),
                201);
        assertThat(created.path("title").asText()).isEqualTo("Тэрэлж рүү аялал");
        assertThat(created.path("budgetMnt").asLong()).isEqualTo(120000);
        assertThat(created.path("place").path("name").asText()).isEqualTo("Тэрэлж");
        assertThat(created.path("url").asText()).isEqualTo("https://aura.example.mn/terelj");
        assertThat(created.path("author").path("id").asText()).isEqualTo(a.id().toString());
        ok(call(a, "POST", "/ideas", body("title", "Гэрийн кино", "category", "HOME", "setting", "HOME",
                "clientId", UUID.randomUUID().toString())), 201);

        List<String> travel = titles(ok(call(b, "GET", "/ideas?category=TRAVEL"), 200));
        assertThat(travel).containsExactly("Тэрэлж рүү аялал");
        assertThat(titles(ok(call(b, "GET", "/ideas"), 200))).hasSize(2);
        assertThat(titles(ok(call(b, "GET", "/ideas?q=" + java.net.URLEncoder.encode("кино", java.nio.charset.StandardCharsets.UTF_8)), 200))).containsExactly("Гэрийн кино");

        HttpResponse<String> noTitle = call(a, "POST", "/ideas", body("category", "FOOD",
                "clientId", UUID.randomUUID().toString()));
        assertThat(noTitle.statusCode()).isEqualTo(400);
        assertThat(code(noTitle)).isEqualTo("VALIDATION_FAILED");
        assertThat(mn.aura.couple.HttpTestClient.json(noTitle).path("fieldErrors").get(0).path("field").asText())
                .isEqualTo("title");
        HttpResponse<String> blank = call(a, "POST", "/ideas", body("title", "   ", "category", "FOOD",
                "clientId", UUID.randomUUID().toString()));
        assertThat(blank.statusCode()).isEqualTo(400);
    }

    @Test
    @DisplayName("AC-179 зөвхөн зохиогч засна (403 NOT_OWNER), хуучин version → 409; ижил clientId давтагдахгүй")
    void ownershipVersionIdempotency() {
        TestUser a = user("do-a");
        TestUser b = user("do-b");
        pair(a, b);
        String body = body("title", "Бууз чимхэх", "category", "FOOD", "clientId", UUID.randomUUID().toString());
        JsonNode idea = ok(call(a, "POST", "/ideas", body), 201);
        assertThat(ok(call(a, "POST", "/ideas", body), 201).path("id").asText()).isEqualTo(idea.path("id").asText());
        String id = idea.path("id").asText();

        HttpResponse<String> other = call(b, "PATCH", "/ideas/" + id, body("title", "Миний", "version", 0));
        assertThat(other.statusCode()).isEqualTo(403);
        assertThat(code(other)).isEqualTo("NOT_OWNER");
        JsonNode updated = ok(call(a, "PATCH", "/ideas/" + id, body("title", "Хуушуур хийх", "version", 0)), 200);
        assertThat(updated.path("version").asLong()).isEqualTo(1);
        HttpResponse<String> stale = call(a, "PATCH", "/ideas/" + id, body("title", "Хуучин", "version", 0));
        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(code(stale)).isEqualTo("VERSION_CONFLICT");

        assertThat(call(b, "DELETE", "/ideas/" + id).statusCode()).isEqualTo(403);
        ok(call(a, "DELETE", "/ideas/" + id), 204);
        assertThat(call(a, "GET", "/ideas/" + id).statusCode()).isEqualTo(404);
    }

    @Test
    @DisplayName("AC-98 GET /ideas/random — шүүлтэд тохирохыг л буцаана; тохирох алга бол 204")
    void randomEndpoint() {
        TestUser a = user("dr-a");
        TestUser b = user("dr-b");
        pair(a, b);
        ok(call(a, "POST", "/ideas", body("title", "Кино үдэш", "category", "HOME", "setting", "HOME",
                "budgetMnt", 20000, "clientId", UUID.randomUUID().toString())), 201);
        ok(call(a, "POST", "/ideas", body("title", "Ресторан", "category", "FOOD", "setting", "OUTDOOR",
                "budgetMnt", 200000, "clientId", UUID.randomUUID().toString())), 201);
        for (int i = 0; i < 10; i++) {
            JsonNode pick = ok(call(b, "GET", "/ideas/random?setting=HOME&maxBudget=50000"), 200);
            assertThat(pick.path("idea").path("title").asText()).isEqualTo("Кино үдэш");
            assertThat(pick.path("candidates").asInt()).isEqualTo(1);
        }
        assertThat(call(b, "GET", "/ideas/random?category=SPORT").statusCode()).isEqualTo(204);
        JsonNode withLib = ok(call(b, "GET", "/ideas/random?setting=HOME&maxBudget=50000&includeLibrary=true"), 200);
        assertThat(withLib.path("candidates").asInt()).isGreaterThan(1);
    }

    @Test
    @DisplayName("AC-179 өөр хосын санаа 404")
    void isolation() {
        TestUser a = user("dx-a");
        TestUser b = user("dx-b");
        pair(a, b);
        TestUser c = user("dx-c");
        TestUser d = user("dx-d");
        pair(c, d);
        String id = ok(call(a, "POST", "/ideas", body("title", "Нууц", "category", "OTHER",
                "clientId", UUID.randomUUID().toString())), 201).path("id").asText();
        assertThat(call(c, "GET", "/ideas/" + id).statusCode()).isEqualTo(404);
        assertThat(call(c, "PATCH", "/ideas/" + id, body("title", "x", "version", 0)).statusCode()).isEqualTo(404);
        assertThat(titles(ok(call(c, "GET", "/ideas"), 200))).isEmpty();
    }

    private static List<String> titles(JsonNode arr) {
        List<String> out = new ArrayList<>();
        arr.forEach(n -> out.add(n.path("title").asText()));
        return out;
    }
}
