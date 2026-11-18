package mn.aura.couple.memory;

import static mn.aura.couple.HttpTestClient.json;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpResponse;
import java.util.UUID;
import mn.aura.couple.realtime.StompTestClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class MemoryIT extends AbstractMemoryIT {

    @Test
    @DisplayName("AC-22 B нь A-гийн дурсамжийг засах/устгах API → 403; харах, сэтгэгдэл, реакц хоёуланд адил")
    void onlyAuthorEdits() throws Exception {
        TestUser a = user("mem-a");
        TestUser b = user("mem-b");
        pair(a, b);
        try (StompTestClient bClient = StompTestClient.connect(port, b.token()).events()) {
            Thread.sleep(300);
            JsonNode m = memory(a, "Тэрэлжийн аялал", "2026-10-03", "\"description\":\"Анхны аялал\",\"tags\":[\"Аялал\",\"#өвөл\"]");
            assertThat(bClient.next("memory.created", 5000)).isNotNull();
            String id = m.path("id").asText();
            assertThat(m.path("tags").toString()).contains("аялал").contains("өвөл");
            assertThat(m.path("visibility").asText()).isEqualTo("SHARED");

            assertThat(ok(call(b, "GET", "/memories/" + id), 200).path("title").asText()).isEqualTo("Тэрэлжийн аялал");
            HttpResponse<String> edit = call(b, "PATCH", "/memories/" + id, "{\"title\":\"Өөр\",\"version\":0}");
            assertThat(edit.statusCode()).isEqualTo(403);
            assertThat(json(edit).path("code").asText()).isEqualTo("NOT_OWNER");
            assertThat(call(b, "DELETE", "/memories/" + id).statusCode()).isEqualTo(403);

            JsonNode comment = ok(call(b, "POST", "/memories/" + id + "/comments",
                    body("text", "Ямар гоё өдөр байсан бэ", "clientId", UUID.randomUUID().toString())), 201);
            assertThat(call(a, "PATCH", "/comments/" + comment.path("id").asText(),
                    "{\"text\":\"x\",\"version\":0}").statusCode()).isEqualTo(403);
            JsonNode reactions = ok(call(b, "PUT", "/memories/" + id + "/reaction", body("emoji", "HEART_EYES")), 200);
            assertThat(reactions.path(0).path("emoji").asText()).isEqualTo("HEART_EYES");
            assertThat(reactions.path(0).path("mine").asBoolean()).isTrue();
            ok(call(b, "PUT", "/memories/" + id + "/reaction", body("emoji", "KISS")), 200);
            JsonNode detail = ok(call(a, "GET", "/memories/" + id), 200);
            assertThat(detail.path("reactions")).hasSize(1);
            assertThat(detail.path("reactions").path(0).path("emoji").asText()).isEqualTo("KISS");
            assertThat(detail.path("comments").path(0).path("text").asText()).isEqualTo("Ямар гоё өдөр байсан бэ");
            assertThat(detail.path("commentCount").asInt()).isEqualTo(1);
        }
    }

    @Test
    @DisplayName("AC-131 1 с зөрүүтэй засварт хоёр дахь нь 409 VERSION_CONFLICT + серверийн хувилбар, чимээгүй дарагдахгүй")
    void versionConflict() {
        TestUser a = user("memv-a");
        String id = memory(a, "Эхний гарчиг", "2026-10-03", null).path("id").asText();
        ok(call(a, "PATCH", "/memories/" + id, "{\"title\":\"Утаснаас\",\"version\":0}"), 200);
        HttpResponse<String> stale = call(a, "PATCH", "/memories/" + id, "{\"title\":\"Таблетаас\",\"version\":0}");
        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(json(stale).path("code").asText()).isEqualTo("VERSION_CONFLICT");
        assertThat(json(stale).path("details").path("current").path("title").asText()).isEqualTo("Утаснаас");
        assertThat(ok(call(a, "GET", "/memories/" + id), 200).path("version").asLong()).isEqualTo(1);
    }

    @Test
    @DisplayName("AC-82 хоёр өнцөг: тус тусдаа бичвэр, өөрийнхөө л засна (бусдынх 409/өөр мөр биш)")
    void perspectives() {
        TestUser a = user("memp-a");
        TestUser b = user("memp-b");
        pair(a, b);
        String id = memory(a, "Хустай", "2026-09-01", null).path("id").asText();
        ok(call(a, "PUT", "/memories/" + id + "/perspective", body("text", "Би тахийг анх харсан")), 200);
        JsonNode bp = ok(call(b, "PUT", "/memories/" + id + "/perspective", body("text", "Салхи их байсан")), 200);
        JsonNode detail = ok(call(a, "GET", "/memories/" + id), 200);
        assertThat(detail.path("perspectives")).hasSize(2);
        // B өөрийнхөө өнцгийг засахад version шаардлагатай; хуучин version → 409
        assertThat(call(b, "PUT", "/memories/" + id + "/perspective", "{\"text\":\"Засвар\",\"version\":5}").statusCode())
                .isEqualTo(409);
        ok(call(b, "PUT", "/memories/" + id + "/perspective",
                "{\"text\":\"Засвар\",\"version\":" + bp.path("version").asLong() + "}"), 200);
        // A-гийн устгал зөвхөн A-гийн өнцгийг устгана
        ok(call(a, "DELETE", "/memories/" + id + "/perspective"), 204);
        JsonNode after = ok(call(b, "GET", "/memories/" + id), 200);
        assertThat(after.path("perspectives")).hasSize(1);
        assertThat(after.path("perspectives").path(0).path("text").asText()).isEqualTo("Засвар");
    }

    @Test
    @DisplayName("AC-83 «Дуртай» хүн бүрийнх тусдаа")
    void favoritesPerUser() {
        TestUser a = user("memf-a");
        TestUser b = user("memf-b");
        pair(a, b);
        String id = memory(a, "Дуртай", "2026-08-01", null).path("id").asText();
        memory(a, "Энгийн", "2026-08-02", null);
        ok(call(a, "PUT", "/memories/" + id + "/favorite"), 204);
        assertThat(ok(call(a, "GET", "/memories?favorite=true"), 200).path("items")).hasSize(1);
        assertThat(ok(call(b, "GET", "/memories?favorite=true"), 200).path("items")).isEmpty();
        assertThat(ok(call(b, "GET", "/memories/" + id), 200).path("myFavorite").asBoolean()).isFalse();
        ok(call(a, "DELETE", "/memories/" + id + "/favorite"), 204);
        assertThat(ok(call(a, "GET", "/memories?favorite=true"), 200).path("items")).isEmpty();
    }

    @Test
    @DisplayName("AC-67 ганцаараа 3 дурсамж: «Үгүй» → B-д 0, A-гийн «Хувийн»-д 3; «Тийм» → B-д 3")
    void soloShare() {
        TestUser a = user("ms-a");
        TestUser b = user("ms-b");
        for (int i = 1; i <= 3; i++) {
            assertThat(memory(a, "Ганцаараа " + i, "2026-07-0" + i, null).path("visibility").asText()).isEqualTo("PRIVATE");
        }
        pair(a, b);
        assertThat(ok(call(a, "GET", "/couple"), 200).path("soloShare").path("pendingCount").asInt()).isEqualTo(3);
        ok(call(a, "POST", "/couple/solo-share", body("share", false)), 200);
        assertThat(ok(call(b, "GET", "/memories"), 200).path("items")).isEmpty();
        JsonNode privateOnes = ok(call(a, "GET", "/memories?scope=private"), 200).path("items");
        assertThat(privateOnes).hasSize(3);
        assertThat(privateOnes.path(0).path("visibility").asText()).isEqualTo("PRIVATE");
        assertThat(call(b, "GET", "/memories/" + privateOnes.path(0).path("id").asText()).statusCode()).isEqualTo(404);

        TestUser c = user("ms-c");
        TestUser d = user("ms-d");
        for (int i = 1; i <= 3; i++) {
            memory(c, "Хуваалцах " + i, "2026-07-0" + i, null);
        }
        pair(c, d);
        assertThat(ok(call(c, "POST", "/couple/solo-share", body("share", true)), 200).path("movedCount").asInt()).isEqualTo(3);
        JsonNode shared = ok(call(d, "GET", "/memories"), 200).path("items");
        assertThat(shared).hasSize(3);
        assertThat(shared.path(0).path("visibility").asText()).isEqualTo("SHARED");
    }

    @Test
    @DisplayName("AC-172 21 медиа → MEDIA_LIMIT_EXCEEDED; ижил clientId давтагдахгүй (outbox)")
    void limitsAndIdempotency() {
        TestUser a = user("ml-a");
        StringBuilder media = new StringBuilder();
        for (int i = 0; i < 21; i++) {
            media.append(i == 0 ? "" : ",").append("{\"mediaId\":\"").append(image(a)).append("\"}");
        }
        String base = "\"title\":\"x\",\"occurredOn\":\"2026-01-01\",\"dateSource\":\"MANUAL\",\"locationSource\":\"NONE\","
                + "\"tags\":[],\"groupIds\":[]";
        HttpResponse<String> tooMany = call(a, "POST", "/memories",
                "{\"clientId\":\"" + UUID.randomUUID() + "\"," + base + ",\"media\":[" + media + "]}");
        assertThat(tooMany.statusCode()).isEqualTo(400);
        assertThat(json(tooMany).path("code").asText()).isEqualTo("MEDIA_LIMIT_EXCEEDED");

        String clientId = UUID.randomUUID().toString();
        String once = "{\"clientId\":\"" + clientId + "\"," + base + ",\"media\":[{\"mediaId\":\"" + image(a) + "\"}]}";
        String id1 = ok(call(a, "POST", "/memories", once), 201).path("id").asText();
        String id2 = ok(call(a, "POST", "/memories", once), 201).path("id").asText();
        assertThat(id2).isEqualTo(id1);
    }
}
