package mn.aura.couple.lists;

import static mn.aura.couple.HttpTestClient.json;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import mn.aura.couple.realtime.StompTestClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SharedListIT extends AbstractSpaceIT {

    @Test
    @DisplayName("AC-41 bucket зүйл version 3: A, B зэрэг засах → нэг нь хадгалагдана, нөгөөд 409 + серверийн хувилбар ба хэн; аль ч өөрчлөлт алдагдахгүй")
    void concurrentEditConflict() {
        TestUser a = user("ls-a");
        TestUser b = user("ls-b");
        pair(a, b);
        JsonNode item = add(a, "bucket", "Хөвсгөлд очих", null);
        String id = item.path("id").asText();
        for (int v = 0; v < 3; v++) {
            ok(call(a, "PATCH", "/list-items/" + id, "{\"description\":\"засвар " + v + "\",\"version\":" + v + "}"), 200);
        }
        assertThat(ok(call(b, "GET", "/lists/bucket/items"), 200).path(0).path("version").asLong()).isEqualTo(3);

        ok(call(a, "PATCH", "/list-items/" + id, "{\"title\":\"Хөвсгөл — зун\",\"version\":3}"), 200);
        HttpResponse<String> stale = call(b, "PATCH", "/list-items/" + id, "{\"title\":\"Хөвсгөл — өвөл\",\"version\":3}");
        assertThat(stale.statusCode()).isEqualTo(409);
        JsonNode err = json(stale);
        assertThat(err.path("code").asText()).isEqualTo("VERSION_CONFLICT");
        assertThat(err.path("details").path("current").path("title").asText()).isEqualTo("Хөвсгөл — зун");
        assertThat(err.path("details").path("currentVersion").asLong()).isEqualTo(4);
        assertThat(err.path("details").path("updatedBy").asText()).isEqualTo(a.id().toString());

        // B «Миний хувилбар»-ыг сонговол серверийн version-оор дахин хадгална — A-гийнх чимээгүй дарагдсан биш, сонгосон
        JsonNode mine = ok(call(b, "PATCH", "/list-items/" + id, "{\"title\":\"Хөвсгөл — өвөл\",\"version\":4}"), 200);
        assertThat(mine.path("title").asText()).isEqualTo("Хөвсгөл — өвөл");
        assertThat(mine.path("version").asLong()).isEqualTo(5);
    }

    @Test
    @DisplayName("AC-131 1 с зөрүүтэй засвар: хоёр дахь хадгалагчид 409 VERSION_CONFLICT, version заавал (байхгүй бол 400)")
    void secondSaverGetsConflict() {
        TestUser a = user("lsc-a");
        TestUser b = user("lsc-b");
        pair(a, b);
        String id = add(a, "todo", "Түрээсээ төлөх", null).path("id").asText();
        ok(call(b, "PATCH", "/list-items/" + id, "{\"done\":true,\"version\":0}"), 200);
        HttpResponse<String> second = call(a, "PATCH", "/list-items/" + id, "{\"title\":\"Түрээс\",\"version\":0}");
        assertThat(second.statusCode()).isEqualTo(409);
        assertThat(json(second).path("details").path("current").path("doneBy").asText()).isEqualTo(b.id().toString());
        assertThat(call(a, "PATCH", "/list-items/" + id, "{\"title\":\"Түрээс\"}").statusCode()).isEqualTo(400);
    }

    @Test
    @DisplayName("AC-107 B тэмдэглэхэд хэн, хэзээ харагдана; дууссан нь доор; «Дууссаныг цэвэрлэх» нь жагсаалтаас гаргана")
    void doneAndClear() throws Exception {
        TestUser a = user("lsd-a");
        TestUser b = user("lsd-b");
        pair(a, b);
        JsonNode milk = add(a, "shopping", "Сүү", null);
        add(a, "shopping", "Талх", null);
        add(a, "shopping", "Өндөг", null);
        try (StompTestClient aClient = StompTestClient.connect(port, a.token()).events()) {
            Thread.sleep(300);
            JsonNode done = ok(call(b, "PATCH", "/list-items/" + milk.path("id").asText(), "{\"done\":true,\"version\":0}"), 200);
            assertThat(done.path("doneBy").asText()).isEqualTo(b.id().toString());
            assertThat(done.path("doneAt").asText()).isNotBlank();
            JsonNode event = aClient.next("list.updated", 3000);
            assertThat(event).isNotNull();
            assertThat(event.path("payload").path("listKind").asText()).isEqualTo("shopping");
            assertThat(event.path("payload").path("item").path("doneBy").asText()).isEqualTo(b.id().toString());
        }
        JsonNode list = ok(call(a, "GET", "/lists/shopping/items"), 200);
        assertThat(titles(list)).containsExactly("Талх", "Өндөг", "Сүү");
        assertThat(ok(call(a, "GET", "/lists/todo/items"), 200)).isEmpty();

        assertThat(ok(call(a, "POST", "/lists/shopping/clear-done"), 200).path("cleared").asInt()).isEqualTo(1);
        assertThat(titles(ok(call(b, "GET", "/lists/shopping/items"), 200))).containsExactly("Талх", "Өндөг");
        assertThat(call(a, "PATCH", "/list-items/" + milk.path("id").asText(), "{\"done\":false,\"version\":1}").statusCode())
                .isEqualTo(404);
    }

    @Test
    @DisplayName("AC-109 хоёулаа санал өгсөн нь «bothWant» ба дээд талд; A чирж эрэмбэлэхэд дараалал хоёр талд ижил")
    void votesAndOrder() {
        TestUser a = user("lsv-a");
        TestUser b = user("lsv-b");
        pair(a, b);
        String first = add(a, "wishlist", "Дюна", "MOVIE").path("id").asText();
        String second = add(a, "wishlist", "Мастер ба Маргарита", "BOOK").path("id").asText();
        String third = add(b, "wishlist", "Улаан мөрөн", "PLACE").path("id").asText();
        ok(call(a, "PUT", "/list-items/" + third + "/vote"), 200);
        JsonNode both = ok(call(b, "PUT", "/list-items/" + third + "/vote"), 200);
        assertThat(both.path("bothWant").asBoolean()).isTrue();
        assertThat(both.path("votes")).hasSize(2);
        assertThat(ok(call(b, "PUT", "/list-items/" + third + "/vote"), 200).path("votes")).hasSize(2); // давхардахгүй

        JsonNode list = ok(call(a, "GET", "/lists/wishlist/items"), 200);
        assertThat(titles(list)).containsExactly("Улаан мөрөн", "Дюна", "Мастер ба Маргарита");
        assertThat(list.path(1).path("wishType").asText()).isEqualTo("MOVIE");

        JsonNode reordered = ok(call(a, "PUT", "/lists/wishlist/order",
                "{\"itemIds\":[\"" + third + "\",\"" + second + "\",\"" + first + "\"]}"), 200);
        assertThat(titles(reordered)).containsExactly("Улаан мөрөн", "Мастер ба Маргарита", "Дюна");
        assertThat(titles(ok(call(b, "GET", "/lists/wishlist/items"), 200)))
                .containsExactly("Улаан мөрөн", "Мастер ба Маргарита", "Дюна");

        // Хуучин жагсаалтаар эрэмбэлэх (шинэ зүйл орсон) → 409
        add(b, "wishlist", "Шинэ", null);
        HttpResponse<String> stale = call(a, "PUT", "/lists/wishlist/order",
                "{\"itemIds\":[\"" + first + "\",\"" + second + "\",\"" + third + "\"]}");
        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(json(stale).path("details").path("current").path("items")).hasSize(4);

        JsonNode undone = ok(call(a, "DELETE", "/list-items/" + third + "/vote"), 200);
        assertThat(undone.path("bothWant").asBoolean()).isFalse();
    }

    @Test
    @DisplayName("AC-106 bucket дуусгах: doneAt огноотой «Дууссан» хэсэгт үлдэнэ; clientId-аар давтан илгээлт нэг зүйл")
    void bucketDoneKeepsDate() {
        TestUser a = user("lsb-a");
        String clientId = UUID.randomUUID().toString();
        String bodyJson = "{\"title\":\"Шүхрээр үсрэх\",\"clientId\":\"" + clientId + "\"}";
        JsonNode item = ok(call(a, "POST", "/lists/bucket/items", bodyJson), 201);
        assertThat(ok(call(a, "POST", "/lists/bucket/items", bodyJson), 201).path("id").asText())
                .isEqualTo(item.path("id").asText());
        JsonNode done = ok(call(a, "PATCH", "/list-items/" + item.path("id").asText(), "{\"done\":true,\"version\":0}"), 200);
        assertThat(done.path("doneAt").asText()).isNotBlank();
        JsonNode list = ok(call(a, "GET", "/lists/bucket/items"), 200);
        assertThat(list).hasSize(1);
        assertThat(list.path(0).path("doneAt").asText()).isEqualTo(done.path("doneAt").asText());
    }

    @Test
    @DisplayName("AC-131 өөр хосын жагсаалтын зүйл → 404; мэдэгдэхгүй жагсаалтын төрөл → 404")
    void isolation() {
        TestUser a = user("lsi-a");
        TestUser b = user("lsi-b");
        pair(a, b);
        TestUser c = user("lsi-c");
        TestUser d = user("lsi-d");
        pair(c, d);
        String id = add(a, "todo", "Нууц", null).path("id").asText();
        assertThat(call(c, "PATCH", "/list-items/" + id, "{\"title\":\"x\",\"version\":0}").statusCode()).isEqualTo(404);
        assertThat(call(c, "DELETE", "/list-items/" + id).statusCode()).isEqualTo(404);
        assertThat(call(c, "PUT", "/list-items/" + id + "/vote").statusCode()).isEqualTo(404);
        assertThat(ok(call(c, "GET", "/lists/todo/items"), 200)).isEmpty();
        assertThat(call(a, "GET", "/lists/movies/items").statusCode()).isEqualTo(404);
        ok(call(b, "DELETE", "/list-items/" + id), 204);
        assertThat(ok(call(a, "GET", "/lists/todo/items"), 200)).isEmpty();
    }

    private JsonNode add(TestUser u, String kind, String title, String wishType) {
        String wish = wishType == null ? "" : ",\"wishType\":\"" + wishType + "\"";
        return ok(call(u, "POST", "/lists/" + kind + "/items",
                "{\"title\":\"" + title + "\",\"clientId\":\"" + UUID.randomUUID() + "\"" + wish + "}"), 201);
    }

    private static List<String> titles(JsonNode list) {
        List<String> out = new ArrayList<>();
        list.forEach(n -> out.add(n.path("title").asText()));
        return out;
    }
}
