package mn.aura.couple.chat;

import static mn.aura.couple.HttpTestClient.json;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.ByteArrayOutputStream;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import mn.aura.couple.realtime.StompTestClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ChatMessageIT extends AbstractChatIT {

    @Test
    @DisplayName("AC-27 AC-29 AC-176 B-д chat.message.created; төлөв SENT → DELIVERED (/app/chat.delivered) → READ, A-д chat.receipt")
    void statuses() throws Exception {
        TestUser a = user("cm-a");
        TestUser b = user("cm-b");
        pair(a, b);
        try (StompTestClient aClient = StompTestClient.connect(port, a.token()).events();
             StompTestClient bClient = StompTestClient.connect(port, b.token()).events()) {
            Thread.sleep(300);
            JsonNode sent = text(a, "Сайн уу, хайраа");
            assertThat(sent.path("status").asText()).isEqualTo("SENT");
            assertThat(sent.path("deleted").asBoolean()).isFalse();
            String id = sent.path("id").asText();

            JsonNode created = bClient.next("chat.message.created", 2000);
            assertThat(created).isNotNull();
            assertThat(created.path("payload").path("text").asText()).isEqualTo("Сайн уу, хайраа");
            assertThat(created.path("payload").path("sender").path("id").asText()).isEqualTo(a.id().toString());

            bClient.send("/app/chat.delivered", Map.of("upToMessageId", id));
            JsonNode delivered = aClient.next("chat.receipt", 3000);
            assertThat(delivered).isNotNull();
            assertThat(delivered.path("payload").path("status").asText()).isEqualTo("DELIVERED");
            assertThat(delivered.path("payload").path("upToMessageId").asText()).isEqualTo(id);
            assertThat(find(messages(a, null), id).path("status").asText()).isEqualTo("DELIVERED");

            ok(call(b, "POST", "/messages/read", body("upToMessageId", id)), 204);
            JsonNode read = aClient.next("chat.receipt", 3000);
            assertThat(read.path("payload").path("status").asText()).isEqualTo("READ");
            assertThat(find(messages(a, null), id).path("status").asText()).isEqualTo("READ");
        }
    }

    @Test
    @DisplayName("AC-28 ижил clientMessageId давтан ирвэл 200 + анхны мессеж, жагсаалтад нэг л удаа, илгээсэн дарааллаар")
    void idempotent() {
        TestUser a = user("ci-a");
        TestUser b = user("ci-b");
        pair(a, b);
        List<String> ids = new ArrayList<>();
        for (int i = 1; i <= 3; i++) {
            String json = body("clientMessageId", UUID.randomUUID().toString(), "kind", "TEXT", "text", "мессеж " + i);
            JsonNode first = ok(call(a, "POST", "/messages", json), 201);
            JsonNode again = ok(call(a, "POST", "/messages", json), 200);
            assertThat(again.path("id").asText()).isEqualTo(first.path("id").asText());
            ids.add(first.path("id").asText());
        }
        JsonNode items = messages(b, null).path("items");
        assertThat(items).hasSize(3);
        for (int i = 0; i < 3; i++) {
            assertThat(items.get(i).path("id").asText()).isEqualTo(ids.get(i));
            assertThat(items.get(i).path("text").asText()).isEqualTo("мессеж " + (i + 1));
        }
    }

    @Test
    @DisplayName("AC-30 AC-176 устгасан мессежийн агуулга, медиа, реакц API-д 0; медиа серверээс устна; push-д агуулга орохгүй")
    void deleteErasesContent() throws Exception {
        TestUser a = user("cd-a");
        TestUser b = user("cd-b");
        pair(a, b);
        UUID image = media(a, "IMAGE", "image/jpeg");
        JsonNode m = ok(post(a, "kind", "IMAGE", "mediaId", image.toString(), "text", "Нууц зураг"), 201);
        String id = m.path("id").asText();
        ok(call(b, "PUT", "/messages/" + id + "/reaction", body("emoji", "LOVE")), 200);

        HttpResponse<String> foreign = call(b, "DELETE", "/messages/" + id);
        assertThat(foreign.statusCode()).isEqualTo(403);
        assertThat(code(foreign)).isEqualTo("NOT_OWNER");

        try (StompTestClient bClient = StompTestClient.connect(port, b.token()).events()) {
            Thread.sleep(300);
            ok(call(a, "DELETE", "/messages/" + id), 204);
            JsonNode deleted = bClient.next("chat.message.deleted", 2000);
            assertThat(deleted.path("payload").path("messageId").asText()).isEqualTo(id);
        }
        ok(call(a, "DELETE", "/messages/" + id), 204);

        JsonNode seen = find(messages(b, null), id);
        assertThat(seen.path("deleted").asBoolean()).isTrue();
        assertThat(seen.hasNonNull("text")).isFalse();
        assertThat(seen.hasNonNull("media")).isFalse();
        assertThat(seen.path("reactions")).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM media WHERE id = ?", Integer.class, image)).isZero();
        assertThat(jdbc.queryForObject("SELECT text FROM chat_message WHERE id = ?::uuid", String.class, id)).isNull();

        HttpResponse<String> edit = call(a, "PATCH", "/messages/" + id, body("text", "дахиад"));
        assertThat(edit.statusCode()).isEqualTo(409);
        assertThat(code(edit)).isEqualTo("MESSAGE_DELETED");

        // B offline байсан тул мэдэгдэл үүссэн — зөвхөн нэр, мессежийн бичвэр хаана ч алга
        List<String> params = jdbc.queryForList("SELECT params::text FROM notification WHERE user_id = ? AND type = 'MESSAGE_NEW'",
                String.class, b.id());
        assertThat(params).isNotEmpty();
        assertThat(params).allSatisfy(p -> assertThat(p).doesNotContain("Нууц зураг"));
    }

    @Test
    @DisplayName("AC-87 50 MB хүртэлх PDF-ийг B татна, байршил газрын зурагт; 51 MB 413, .exe .apk .js 415")
    void filesAndLocation() throws Exception {
        TestUser a = user("cf-a");
        TestUser b = user("cf-b");
        pair(a, b);
        byte[] pdf = "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n"
                .getBytes(StandardCharsets.US_ASCII);
        JsonNode ref = upload(a, pdf, "Тасалбар.pdf", "application/pdf", "FILE");
        assertThat(ref.path("kind").asText()).isEqualTo("FILE");
        String fileMsg = ok(post(a, "kind", "FILE", "mediaId", ref.path("id").asText()), 201).path("id").asText();
        JsonNode seen = find(messages(b, null), fileMsg);
        assertThat(seen.path("media").path("fileName").asText()).isEqualTo("Тасалбар.pdf");
        assertThat(seen.path("media").path("mime").asText()).isEqualTo("application/pdf");
        assertThat(seen.path("media").path("urls").path("original").asText()).startsWith("http");

        HttpResponse<String> limit = call(a, "POST", "/uploads", body("purpose", "FILE", "fileName", "big.pdf",
                "mime", "application/pdf", "totalBytes", 50L * 1024 * 1024));
        assertThat(limit.statusCode()).isEqualTo(201);
        ok(call(a, "DELETE", "/uploads/" + json(limit).path("id").asText()), 204);
        HttpResponse<String> big = call(a, "POST", "/uploads", body("purpose", "FILE", "fileName", "big.pdf",
                "mime", "application/pdf", "totalBytes", 51L * 1024 * 1024));
        assertThat(big.statusCode()).isEqualTo(413);
        assertThat(code(big)).isEqualTo("MEDIA_TOO_LARGE");

        byte[] exe = new byte[2048];
        exe[0] = 'M';
        exe[1] = 'Z';
        assertForbidden(a, exe, "setup.exe", "application/octet-stream");
        assertForbidden(a, apk(), "app.apk", "application/vnd.android.package-archive");
        HttpResponse<String> js = call(a, "POST", "/uploads", body("purpose", "FILE", "fileName", "x.js",
                "mime", "application/javascript", "totalBytes", 20));
        assertThat(js.statusCode()).isEqualTo(415);
        assertThat(code(js)).isEqualTo("MEDIA_TYPE_FORBIDDEN");

        // Зураг биш медиаг IMAGE мессежээр илгээх → 415
        HttpResponse<String> mismatch = post(a, "kind", "IMAGE", "mediaId", ref.path("id").asText());
        assertThat(mismatch.statusCode()).isEqualTo(415);

        JsonNode loc = ok(post(a, "kind", "LOCATION", "location", Map.of("name", "Хустайн нуруу", "lat", 47.8, "lon", 106.0)), 201);
        JsonNode locSeen = find(messages(b, null), loc.path("id").asText());
        assertThat(locSeen.path("kind").asText()).isEqualTo("LOCATION");
        assertThat(locSeen.path("location").path("name").asText()).isEqualTo("Хустайн нуруу");
        assertThat(locSeen.path("location").path("lat").asDouble()).isEqualTo(47.8);
        assertThat(post(a, "kind", "LOCATION").statusCode()).isEqualTo(400);
    }

    private void assertForbidden(TestUser u, byte[] bytes, String name, String mime) throws Exception {
        HttpResponse<String> s = call(u, "POST", "/uploads", body("purpose", "FILE", "fileName", name, "mime", mime,
                "totalBytes", bytes.length));
        if (s.statusCode() == 415) {
            assertThat(code(s)).isEqualTo("MEDIA_TYPE_FORBIDDEN");
            return;
        }
        HttpResponse<String> r = chunk(u, json(s).path("id").asText(), 0, bytes);
        assertThat(r.statusCode()).as(name).isEqualTo(415);
        assertThat(code(r)).isEqualTo("MEDIA_TYPE_FORBIDDEN");
    }

    private static byte[] apk() throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            zip.putNextEntry(new ZipEntry("AndroidManifest.xml"));
            zip.write(new byte[]{3, 0, 8, 0});
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("classes.dex"));
            zip.write("dex\n035".getBytes(StandardCharsets.US_ASCII));
            zip.closeEntry();
        }
        return out.toByteArray();
    }

    @Test
    @DisplayName("AC-88 reply-д ишлэл; ишлэлээр around хуудас; A засвал хоёр талд editedAt; B-гийн засвар 403 NOT_OWNER")
    void replyAndEdit() throws Exception {
        TestUser a = user("cr-a");
        TestUser b = user("cr-b");
        pair(a, b);
        String m = text(a, "Маргааш кино үзэх үү?").path("id").asText();
        for (int i = 0; i < 40; i++) {
            text(b, "дүүргэгч " + i);
        }
        JsonNode reply = ok(post(b, "kind", "TEXT", "text", "Тэгье!", "replyToId", m), 201);
        assertThat(reply.path("replyTo").path("id").asText()).isEqualTo(m);
        assertThat(reply.path("replyTo").path("text").asText()).isEqualTo("Маргааш кино үзэх үү?");
        assertThat(reply.path("replyTo").path("senderId").asText()).isEqualTo(a.id().toString());

        JsonNode latest = messages(a, "limit=10");
        assertThat(find(latest, m)).isNull();
        assertThat(latest.path("hasMoreBefore").asBoolean()).isTrue();
        assertThat(latest.path("hasMoreAfter").asBoolean()).isFalse();
        JsonNode around = messages(a, "around=" + m + "&limit=10");
        assertThat(find(around, m)).isNotNull();
        assertThat(around.path("hasMoreBefore").asBoolean()).isFalse();
        assertThat(around.path("hasMoreAfter").asBoolean()).isTrue();

        HttpResponse<String> foreign = call(b, "PATCH", "/messages/" + m, body("text", "Би засъя"));
        assertThat(foreign.statusCode()).isEqualTo(403);
        assertThat(code(foreign)).isEqualTo("NOT_OWNER");

        try (StompTestClient bClient = StompTestClient.connect(port, b.token()).events()) {
            Thread.sleep(300);
            JsonNode edited = ok(call(a, "PATCH", "/messages/" + m, body("text", "Маргааш 19:00-д кино үзэх үү?")), 200);
            assertThat(edited.hasNonNull("editedAt")).isTrue();
            JsonNode updated = bClient.next("chat.message.updated", 2000);
            assertThat(updated.path("payload").path("id").asText()).isEqualTo(m);
            assertThat(updated.path("payload").path("text").asText()).isEqualTo("Маргааш 19:00-д кино үзэх үү?");
        }
        JsonNode seen = find(messages(b, "around=" + m), m);
        assertThat(seen.hasNonNull("editedAt")).isTrue();
    }

    @Test
    @DisplayName("Хуудаслалт: before/after нь илгээсэн дарааллаар, hasMoreBefore/hasMoreAfter зөв; өөр хосын мессеж 404")
    void pagination() {
        TestUser a = user("cp-a");
        TestUser b = user("cp-b");
        pair(a, b);
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < 7; i++) {
            ids.add(text(i % 2 == 0 ? a : b, "m" + i).path("id").asText());
        }
        JsonNode last = messages(a, "limit=3");
        assertThat(last.path("items").get(0).path("id").asText()).isEqualTo(ids.get(4));
        assertThat(last.path("items").get(2).path("id").asText()).isEqualTo(ids.get(6));
        JsonNode older = messages(a, "before=" + ids.get(4) + "&limit=3");
        assertThat(older.path("items").get(0).path("id").asText()).isEqualTo(ids.get(1));
        assertThat(older.path("hasMoreBefore").asBoolean()).isTrue();
        assertThat(older.path("hasMoreAfter").asBoolean()).isTrue();
        JsonNode newer = messages(a, "after=" + ids.get(4));
        assertThat(newer.path("items")).hasSize(2);
        assertThat(newer.path("hasMoreAfter").asBoolean()).isFalse();
        assertThat(newer.path("hasMoreBefore").asBoolean()).isTrue();

        TestUser c = user("cp-c");
        TestUser d = user("cp-d");
        pair(c, d);
        assertThat(call(c, "GET", "/messages?around=" + ids.get(0)).statusCode()).isEqualTo(404);
        assertThat(call(c, "PUT", "/messages/" + ids.get(0) + "/reaction", body("emoji", "LOVE")).statusCode()).isEqualTo(404);
        assertThat(post(c, "kind", "TEXT", "text", "x", "replyToId", ids.get(0)).statusCode()).isEqualTo(404);
    }

    @Test
    @DisplayName("Реакц хүн тутам нэг; хамтрагчид chat.reaction (mine нь харж буй хүнээр); SOLO-д 409 NOT_PAIRED")
    void reactions() throws Exception {
        TestUser a = user("cx-a");
        TestUser b = user("cx-b");
        pair(a, b);
        String m = text(a, "Би чамд хайртай").path("id").asText();
        try (StompTestClient aClient = StompTestClient.connect(port, a.token()).events()) {
            Thread.sleep(300);
            JsonNode mine = ok(call(b, "PUT", "/messages/" + m + "/reaction", body("emoji", "HEART_EYES")), 200);
            assertThat(mine.get(0).path("mine").asBoolean()).isTrue();
            JsonNode event = aClient.next("chat.reaction", 2000);
            assertThat(event.path("payload").path("messageId").asText()).isEqualTo(m);
            assertThat(event.path("payload").path("reactions").get(0).path("emoji").asText()).isEqualTo("HEART_EYES");
            assertThat(event.path("payload").path("reactions").get(0).path("mine").asBoolean()).isFalse();
        }
        ok(call(b, "PUT", "/messages/" + m + "/reaction", body("emoji", "KISS")), 200);
        JsonNode r = find(messages(a, null), m).path("reactions");
        assertThat(r).hasSize(1);
        assertThat(r.get(0).path("emoji").asText()).isEqualTo("KISS");
        assertThat(ok(call(b, "DELETE", "/messages/" + m + "/reaction"), 200)).isEmpty();

        TestUser solo = user("cx-solo");
        HttpResponse<String> s = call(solo, "GET", "/messages");
        assertThat(s.statusCode()).isEqualTo(409);
        assertThat(code(s)).isEqualTo("NOT_PAIRED");
    }

    @Test
    @DisplayName("AC-177 «бичиж байна» тэгш: B унтраавал A-гийнх B-д, B-гийнх A-д ирэхгүй; асаалттай үед ирнэ")
    void typingSymmetric() throws Exception {
        TestUser a = user("ct-a");
        TestUser b = user("ct-b");
        pair(a, b);
        try (StompTestClient aClient = StompTestClient.connect(port, a.token()).events();
             StompTestClient bClient = StompTestClient.connect(port, b.token()).events()) {
            Thread.sleep(300);
            bClient.send("/app/typing", Map.of("typing", true));
            assertThat(aClient.next("chat.typing", 3000)).isNotNull();

            jdbc.update("UPDATE users SET typing_visible = false WHERE id = ?", a.id());
            bClient.send("/app/typing", Map.of("typing", true));
            assertThat(aClient.next("chat.typing", 1500)).isNull();
            aClient.send("/app/typing", Map.of("typing", true));
            assertThat(bClient.next("chat.typing", 1500)).isNull();
        }
    }
}
