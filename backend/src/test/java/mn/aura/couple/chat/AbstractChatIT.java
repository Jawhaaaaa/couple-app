package mn.aura.couple.chat;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import mn.aura.couple.media.app.UploadSessionService;

/** Чатын IT-ийн туслах: мессеж илгээх, медиа (DB-д шууд эсвэл бодит upload). */
abstract class AbstractChatIT extends AbstractSpaceIT {

    private static final HttpClient HTTP = HttpClient.newHttpClient();

    protected JsonNode text(TestUser u, String text) {
        return ok(call(u, "POST", "/messages", body("clientMessageId", UUID.randomUUID().toString(), "kind", "TEXT",
                "text", text)), 201);
    }

    protected HttpResponse<String> post(TestUser u, Object... kv) {
        Object[] all = Arrays.copyOf(kv, kv.length + 2);
        all[kv.length] = "clientMessageId";
        all[kv.length + 1] = UUID.randomUUID().toString();
        return call(u, "POST", "/messages", body(all));
    }

    protected UUID coupleSpace(TestUser u) {
        return jdbc.queryForObject("SELECT space_id FROM space_member WHERE user_id = ? AND space_kind = 'COUPLE' "
                + "AND left_at IS NULL", UUID.class, u.id());
    }

    /** Хосын space-д READY медиа (S3 объектгүй — URL л үүснэ). */
    protected UUID media(TestUser u, String kind, String mime) {
        UUID space = coupleSpace(u);
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO media (id, space_id, owner_id, kind, mime, size_bytes, s3_key, status) "
                + "VALUES (?, ?, ?, ?, ?, 1000, ?, 'READY')", id, space, u.id(), kind, mime,
                "spaces/" + space + "/" + id + "/original");
        jdbc.update("UPDATE space SET storage_bytes = storage_bytes + 1000 WHERE id = ?", space);
        return id;
    }

    /** Бодит chunk upload → `MediaRef`. */
    protected JsonNode upload(TestUser u, byte[] bytes, String name, String mime, String purpose) throws Exception {
        JsonNode s = ok(call(u, "POST", "/uploads", body("purpose", purpose, "fileName", name, "mime", mime,
                "totalBytes", bytes.length)), 201);
        String id = s.path("id").asText();
        int size = UploadSessionService.CHUNK_SIZE;
        for (int i = 0; i < s.path("totalChunks").asInt(); i++) {
            HttpResponse<String> r = chunk(u, id, i, Arrays.copyOfRange(bytes, i * size, Math.min(bytes.length, (i + 1) * size)));
            assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        }
        return ok(call(u, "POST", "/uploads/" + id + "/complete"), 200);
    }

    protected HttpResponse<String> chunk(TestUser u, String uploadId, int index, byte[] part) throws Exception {
        return HTTP.send(HttpRequest.newBuilder(URI.create(url("/api/v1/uploads/" + uploadId + "/chunks/" + index)))
                        .header("Authorization", "Bearer " + u.token()).header("Content-Type", "application/octet-stream")
                        .PUT(HttpRequest.BodyPublishers.ofByteArray(part)).build(),
                HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    }

    protected JsonNode messages(TestUser u, String query) {
        return ok(call(u, "GET", "/messages" + (query == null ? "" : "?" + query)), 200);
    }

    protected JsonNode find(JsonNode page, String id) {
        for (JsonNode m : page.path("items")) {
            if (id.equals(m.path("id").asText())) {
                return m;
            }
        }
        return null;
    }
}
