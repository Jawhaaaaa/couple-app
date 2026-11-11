package mn.aura.couple.chat;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URLEncoder;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import mn.aura.couple.realtime.StompTestClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ChatSearchIT extends AbstractChatIT {

    @Test
    @DisplayName("AC-89 AC-30 «Тэрэлж» хайлт: тодруулгатай, шинээс хуучин, cursor-оор; устгасан ба дууссан мессеж, өөр хос орохгүй")
    void search() {
        TestUser a = user("cs-a");
        TestUser b = user("cs-b");
        pair(a, b);
        String first = text(a, "Тэрэлж явах уу? тэрэлж гоё шүү").path("id").asText();
        text(b, "Өнөөдөр бороотой");
        String second = text(b, "ТЭРЭЛЖ-д майхантай очъё").path("id").asText();
        String deleted = text(a, "Тэрэлжийн нууц").path("id").asText();
        ok(call(a, "DELETE", "/messages/" + deleted), 204);
        String expired = text(b, "Тэрэлж — алга болох").path("id").asText();
        jdbc.update("UPDATE chat_message SET expires_at = now() - interval '1 minute', disappear_seconds = 60 WHERE id = ?::uuid",
                expired);

        JsonNode page = search(b, "тэрэлж", null);
        List<String> ids = ids(page);
        assertThat(ids).containsExactly(second, first);
        JsonNode hit = page.path("items").get(1);
        assertThat(hit.path("message").path("text").asText()).isEqualTo("Тэрэлж явах уу? тэрэлж гоё шүү");
        assertThat(hit.path("highlights").toString()).isEqualTo("[[0,6],[16,22]]");
        assertThat(page.path("items").get(0).path("highlights").toString()).isEqualTo("[[0,6]]");
        assertThat(page.hasNonNull("nextCursor")).isFalse();

        JsonNode p1 = ok(call(b, "GET", "/messages/search?q=" + enc("тэрэлж") + "&limit=1"), 200);
        assertThat(ids(p1)).containsExactly(second);
        String cursor = p1.path("nextCursor").asText();
        assertThat(cursor).isNotBlank();
        JsonNode p2 = ok(call(b, "GET", "/messages/search?q=" + enc("тэрэлж") + "&limit=1&cursor=" + cursor), 200);
        assertThat(ids(p2)).containsExactly(first);

        // `%` нь wildcard биш
        assertThat(search(a, "%", null).path("items")).isEmpty();

        TestUser c = user("cs-c");
        TestUser d = user("cs-d");
        pair(c, d);
        assertThat(search(c, "тэрэлж", null).path("items")).isEmpty();
    }

    @Test
    @DisplayName("AC-89 «Огноо руу үсрэх» 2026-10-01 — хосын бүсийн тэр өдрийн эхний мессеж төвтэй; мессежгүй өдөр дараагийнх")
    void jumpToDate() {
        TestUser a = user("cj-a");
        TestUser b = user("cj-b");
        pair(a, b);
        String sept = at(text(a, "9 сарын сүүл"), "2026-09-30T10:00:00Z");
        // Улаанбаатар (UTC+8): 2026-10-01 00:30 нь UTC-ээр 2026-09-30T16:30
        String octFirst = at(text(b, "10 сарын нэгний шөнө"), "2026-09-30T16:30:00Z");
        String octLater = at(text(a, "10 сарын нэгний орой"), "2026-10-01T11:00:00Z");
        String nov = at(text(b, "11 сар"), "2026-11-05T02:00:00Z");

        JsonNode page = ok(call(a, "GET", "/messages/jump?date=2026-10-01"), 200);
        List<String> ids = ids(page.path("items"));
        assertThat(ids).contains(sept, octFirst, octLater, nov);
        assertThat(ids.indexOf(octFirst)).isEqualTo(ids.indexOf(sept) + 1);

        JsonNode gap = ok(call(a, "GET", "/messages/jump?date=2026-10-20"), 200);
        assertThat(ids(gap.path("items"))).contains(nov);

        JsonNode future = ok(call(a, "GET", "/messages/jump?date=2030-01-01"), 200);
        assertThat(ids(future.path("items"))).contains(nov);
    }

    @Test
    @DisplayName("AC-90 A pin хийнэ, B-д chat.pinned ба жагсаалтад; B хасаж чадна (тэнцүү эрх); устгасан мессежийн pin арилна")
    void pins() throws Exception {
        TestUser a = user("cpin-a");
        TestUser b = user("cpin-b");
        pair(a, b);
        String m1 = text(a, "Wi-Fi нууц үг: aura2026").path("id").asText();
        String m2 = text(b, "Ээжийн төрсөн өдөр 3 сарын 8").path("id").asText();

        try (StompTestClient bClient = StompTestClient.connect(port, b.token()).events()) {
            Thread.sleep(300);
            ok(call(a, "PUT", "/messages/" + m1 + "/pin"), 204);
            JsonNode event = bClient.next("chat.pinned", 2000);
            assertThat(event.path("payload").path("messageId").asText()).isEqualTo(m1);
            assertThat(event.path("payload").path("pinned").asBoolean()).isTrue();
        }
        ok(call(a, "PUT", "/messages/" + m1 + "/pin"), 204);
        ok(call(a, "PUT", "/messages/" + m2 + "/pin"), 204);

        JsonNode pinned = ok(call(b, "GET", "/messages/pinned"), 200);
        assertThat(ids(pinned)).containsExactly(m2, m1);
        assertThat(pinned.get(0).hasNonNull("pinnedAt")).isTrue();
        assertThat(find(messages(b, null), m1).hasNonNull("pinnedAt")).isTrue();

        try (StompTestClient aClient = StompTestClient.connect(port, a.token()).events()) {
            Thread.sleep(300);
            ok(call(b, "DELETE", "/messages/" + m1 + "/pin"), 204);
            JsonNode event = aClient.next("chat.pinned", 2000);
            assertThat(event.path("payload").path("pinned").asBoolean()).isFalse();
        }
        assertThat(ids(ok(call(a, "GET", "/messages/pinned"), 200))).containsExactly(m2);

        ok(call(b, "DELETE", "/messages/" + m2), 204);
        assertThat(ok(call(a, "GET", "/messages/pinned"), 200)).isEmpty();
        assertThat(call(a, "PUT", "/messages/" + m2 + "/pin").statusCode()).isEqualTo(404);

        TestUser c = user("cpin-c");
        TestUser d = user("cpin-d");
        pair(c, d);
        assertThat(call(c, "PUT", "/messages/" + m1 + "/pin").statusCode()).isEqualTo(404);
        assertThat(call(c, "DELETE", "/messages/" + m1 + "/pin").statusCode()).isEqualTo(404);
    }

    @Test
    @DisplayName("S-44 медиа: төрлөөр (IMAGE, FILE, VOICE, LINK), шинээс хуучин, cursor; устгасан мессеж орохгүй")
    void media() {
        TestUser a = user("cmd-a");
        TestUser b = user("cmd-b");
        pair(a, b);
        String img = ok(post(a, "kind", "IMAGE", "mediaId", media(a, "IMAGE", "image/jpeg").toString()), 201).path("id").asText();
        String img2 = ok(post(b, "kind", "IMAGE", "mediaId", media(b, "IMAGE", "image/jpeg").toString()), 201).path("id").asText();
        String file = ok(post(a, "kind", "FILE", "mediaId", media(a, "FILE", "application/pdf").toString()), 201).path("id").asText();
        String voice = ok(post(b, "kind", "VOICE", "mediaId", media(b, "AUDIO", "audio/mp4").toString()), 201).path("id").asText();
        String link = text(a, "Энийг хар: https://aura.example.mn/plan").path("id").asText();
        text(a, "Холбоосгүй энгийн бичвэр");
        String gone = ok(post(a, "kind", "IMAGE", "mediaId", media(a, "IMAGE", "image/jpeg").toString()), 201).path("id").asText();
        ok(call(a, "DELETE", "/messages/" + gone), 204);

        assertThat(ids(ok(call(b, "GET", "/messages/media?kind=IMAGE"), 200).path("items"))).containsExactly(img2, img);
        assertThat(ids(ok(call(b, "GET", "/messages/media?kind=FILE"), 200).path("items"))).containsExactly(file);
        assertThat(ids(ok(call(b, "GET", "/messages/media?kind=VOICE"), 200).path("items"))).containsExactly(voice);
        assertThat(ids(ok(call(b, "GET", "/messages/media?kind=LINK"), 200).path("items"))).containsExactly(link);
        assertThat(ids(ok(call(b, "GET", "/messages/media"), 200).path("items"))).containsExactly(link, voice, file, img2, img);

        JsonNode p1 = ok(call(b, "GET", "/messages/media?kind=IMAGE&limit=1"), 200);
        assertThat(ids(p1.path("items"))).containsExactly(img2);
        JsonNode p2 = ok(call(b, "GET", "/messages/media?kind=IMAGE&limit=1&cursor=" + p1.path("nextCursor").asText()), 200);
        assertThat(ids(p2.path("items"))).containsExactly(img);
        assertThat(p2.hasNonNull("nextCursor")).isFalse();

        HttpResponse<String> bad = call(b, "GET", "/messages/media?kind=VIDEO");
        assertThat(bad.statusCode()).isEqualTo(400);
    }

    private JsonNode search(TestUser u, String q, String cursor) {
        return ok(call(u, "GET", "/messages/search?q=" + enc(q) + (cursor == null ? "" : "&cursor=" + cursor)), 200);
    }

    private String at(JsonNode message, String instant) {
        String id = message.path("id").asText();
        jdbc.update("UPDATE chat_message SET created_at = ? WHERE id = ?::uuid", Timestamp.from(Instant.parse(instant)), id);
        return id;
    }

    private static List<String> ids(JsonNode arrayOrPage) {
        JsonNode items = arrayOrPage.has("items") ? arrayOrPage.path("items") : arrayOrPage;
        List<String> out = new ArrayList<>();
        for (JsonNode n : items) {
            out.add(n.has("message") ? n.path("message").path("id").asText() : n.path("id").asText());
        }
        return out;
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}
