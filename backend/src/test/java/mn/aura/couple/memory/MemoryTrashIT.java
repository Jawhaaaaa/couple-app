package mn.aura.couple.memory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import mn.aura.couple.HttpTestClient;
import mn.aura.couple.media.app.MediaStorageService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class MemoryTrashIT extends AbstractMemoryIT {

    @Autowired
    MediaStorageService storage;

    @Test
    @DisplayName("AC-174 устгахын өмнө «Анугийн 2 сэтгэгдэл хамт устна»; устгасан нь timeline-д үгүй, хогийн саванд 30 хоног")
    void previewAndTrash() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("tr-a");
        TestUser b = user("tr-b");
        pair(a, b);
        String id = memory(a, "Устгах", "2026-10-01", null).path("id").asText();
        for (int i = 0; i < 2; i++) {
            ok(call(b, "POST", "/memories/" + id + "/comments", body("text", "сэтгэгдэл " + i,
                    "clientId", UUID.randomUUID().toString())), 201);
        }
        JsonNode preview = ok(call(a, "GET", "/memories/" + id + "/delete-preview"), 200);
        assertThat(preview.path("partnerCommentCount").asInt()).isEqualTo(2);
        assertThat(preview.path("partnerName").asText()).isEqualTo("Бат");
        assertThat(call(b, "GET", "/memories/" + id + "/delete-preview").statusCode()).isEqualTo(403);

        JsonNode entry = ok(call(a, "DELETE", "/memories/" + id), 200);
        assertThat(Instant.parse(entry.path("purgeAfter").asText()))
                .isBetween(Instant.parse("2026-12-07T04:00:00Z"), Instant.parse("2026-12-07T04:01:00Z"));
        assertThat(ok(call(b, "GET", "/memories"), 200).path("items")).isEmpty();
        assertThat(call(b, "GET", "/memories/" + id).statusCode()).isEqualTo(404);
        JsonNode trash = ok(call(a, "GET", "/memories/trash"), 200);
        assertThat(trash.path(0).path("memoryId").asText()).isEqualTo(id);
        assertThat(trash.path(0).path("daysLeft").asInt()).isEqualTo(30);
        assertThat(ok(call(b, "GET", "/memories/trash"), 200)).isEmpty();
    }

    @Test
    @DisplayName("AC-23 сэргээсэн дурсамж сэтгэгдэл, реакцтайгаа; 30 хоногийн дараа storage-оос ч бүрмөсөн устна")
    void restoreAndPurge() {
        TestUser a = user("trp-a");
        TestUser b = user("trp-b");
        UUID space = pair(a, b);
        JsonNode m = memory(a, "Сэргээх", "2026-10-01", null);
        String id = m.path("id").asText();
        ok(call(b, "POST", "/memories/" + id + "/comments", body("text", "хадгалагдана", "clientId", UUID.randomUUID().toString())), 201);
        ok(call(b, "PUT", "/memories/" + id + "/reaction", body("emoji", "LOVE")), 200);
        ok(call(a, "DELETE", "/memories/" + id), 200);
        JsonNode restored = ok(call(a, "POST", "/memories/" + id + "/restore"), 200);
        assertThat(restored.path("comments").path(0).path("text").asText()).isEqualTo("хадгалагдана");
        assertThat(restored.path("reactions").path(0).path("emoji").asText()).isEqualTo("LOVE");

        // Бодит S3 объекттой медиа
        String key = jdbc.queryForObject("SELECT x.s3_key FROM memory_media mm JOIN media x ON x.id = mm.media_id "
                + "WHERE mm.memory_id = ?::uuid", String.class, id);
        storage.put(key, new byte[] {1, 2, 3}, "image/jpeg");
        long usedBefore = jdbc.queryForObject("SELECT storage_bytes FROM space WHERE id = ?", Long.class, space);
        ok(call(a, "DELETE", "/memories/" + id), 200);
        advance(Duration.ofDays(30).plusMinutes(1));
        HttpTestClient.send("POST", url("/api/v1/test/jobs/trashPurge/run"), null);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM memory WHERE id = ?::uuid", Integer.class, id)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM memory_comment WHERE memory_id = ?::uuid", Integer.class, id)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reaction WHERE target_id = ?::uuid", Integer.class, id)).isZero();
        assertThatThrownBy(() -> storage.get(key)).isInstanceOf(Exception.class);
        assertThat(jdbc.queryForObject("SELECT storage_bytes FROM space WHERE id = ?", Long.class, space))
                .isEqualTo(usedBefore - 1000);
        a = fresh(a);
        assertThat(call(a, "POST", "/memories/" + id + "/restore").statusCode()).isEqualTo(404);
    }
}
