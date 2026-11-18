package mn.aura.couple.export;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import mn.aura.couple.AbstractSpaceIT;
import mn.aura.couple.HttpTestClient;
import mn.aura.couple.media.app.ImageProcessorFixtures;
import mn.aura.couple.media.app.MediaStorageService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class DataExportIT extends AbstractSpaceIT {

    @Autowired
    MediaStorageService storage;

    private UUID memoryWithImage(UUID space, TestUser author, String title) throws Exception {
        UUID media = UUID.randomUUID();
        String key = MediaStorageService.key(space, media, "original");
        jdbc.update("INSERT INTO media (id, space_id, owner_id, kind, mime, size_bytes, s3_key, status) "
                + "VALUES (?, ?, ?, 'IMAGE', 'image/jpeg', 1000, ?, 'READY')", media, space, author.id(), key);
        storage.put(key, ImageProcessorFixtures.jpegWithGps(200, 150), "image/jpeg");
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO memory (id, space_id, author_id, client_id, title, occurred_on) VALUES (?, ?, ?, ?, ?, '2026-10-01')",
                id, space, author.id(), UUID.randomUUID(), title);
        jdbc.update("INSERT INTO memory_media (memory_id, media_id, position) VALUES (?, ?, 0)", id, media);
        return media;
    }

    private void message(UUID space, TestUser sender, String text, String extraCol, String extraVal) {
        jdbc.update("INSERT INTO chat_message (id, space_id, sender_id, client_message_id, kind, text"
                + (extraCol == null ? "" : ", " + extraCol) + ") VALUES (?, ?, ?, ?, 'TEXT', ?"
                + (extraCol == null ? "" : ", ?::timestamptz") + ")",
                extraCol == null ? new Object[] {UUID.randomUUID(), space, sender.id(), UUID.randomUUID(), text}
                        : new Object[] {UUID.randomUUID(), space, sender.id(), UUID.randomUUID(), text, extraVal});
    }

    private void letter(UUID space, TestUser from, TestUser to, String body, String status, String deliveredAt) {
        jdbc.update("INSERT INTO letter (id, space_id, author_id, recipient_id, template, body, status, deliver_at, delivered_at) "
                + "VALUES (?, ?, ?, ?, 'PAPER_1', ?, ?, '2027-01-01T00:00:00Z', ?::timestamptz)", UUID.randomUUID(), space,
                from.id(), to.id(), body, status, deliveredAt);
    }

    @Test
    @DisplayName("AC-53 AC-30 AC-126 ZIP: JSON + медиа + HTML; хүргэгдсэн захидал, хуваалцсан сэтгэл санаа орно; B-гийн нууц, хүргэгдээгүй захидал, устгасан/алга болсон мессеж, C2 — 0; имэйл; 7 хоногийн дараа 410")
    void fullExport() throws Exception {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("exp-a");
        TestUser b = user("exp-b");
        TestUser c = user("exp-c");
        TestUser d = user("exp-d");
        UUID c1 = pair(a, b);
        UUID c2 = pair(c, d);
        UUID image = memoryWithImage(c1, a, "Хамтын аялал");
        memoryWithImage(c2, c, "C2-ийн нууц дурсамж");

        message(c1, a, "Энгийн мессеж", null, null);
        message(c1, b, "Устгасан мессеж", "deleted_at", "2026-11-06T00:00:00Z");
        message(c1, b, "Алга болсон мессеж", "expires_at", "2026-11-06T00:00:00Z");
        letter(c1, b, a, "Хүргэгдсэн захидал", "DELIVERED", "2026-11-01T00:00:00Z");
        letter(c1, b, a, "Хүргэгдээгүй нууц захидал", "SCHEDULED", null);
        letter(c1, a, b, "Миний товлосон захидал", "SCHEDULED", null);
        jdbc.update("INSERT INTO check_in (id, user_id, space_id, local_date, level, note, shared) VALUES "
                + "(?, ?, ?, '2026-11-01', 5, 'Хуваалцсан сэтгэл', true), (?, ?, ?, '2026-11-02', 1, 'Хуваалцаагүй нууц сэтгэл', false), "
                + "(?, ?, ?, '2026-11-02', 3, 'Миний тэмдэглэл', false)",
                UUID.randomUUID(), b.id(), c1, UUID.randomUUID(), b.id(), c1, UUID.randomUUID(), a.id(), c1);
        jdbc.update("INSERT INTO gift_idea (id, space_id, owner_id, occasion_key, text) VALUES (?, ?, ?, 'birthday:a', 'B-гийн нууц бэлэг'), "
                + "(?, ?, ?, 'birthday:b', 'Миний бэлгийн санаа')", UUID.randomUUID(), c1, b.id(), UUID.randomUUID(), c1, a.id());
        jdbc.update("INSERT INTO deck_swipe (space_id, user_id, idea_ref, liked) VALUES (?, ?, 'library:lib-007', false)", c1, b.id());

        JsonNode export = ok(call(a, "POST", "/exports", body("kind", "FULL", "locale", "mn")), 202);
        assertThat(export.path("status").asText()).isEqualTo("QUEUED");
        String id = export.path("id").asText();
        JsonNode ready = awaitReady(a, id);
        assertThat(Instant.parse(ready.path("expiresAt").asText())).isAfter(clock.instant().plus(Duration.ofDays(6)));

        Map<String, byte[]> zip = unzip(download(a, id));
        assertThat(zip).containsKeys("index.html", "data/memories.json", "data/messages.json", "data/letters.json",
                "data/checkIns.json", "data/giftIdeas.json", "media/" + image + ".jpg");
        StringBuilder all = new StringBuilder();
        zip.forEach((name, bytes) -> {
            if (name.endsWith(".json") || name.endsWith(".html")) {
                all.append(new String(bytes, StandardCharsets.UTF_8));
            }
        });
        String text = all.toString();
        assertThat(text).contains("Хамтын аялал", "Энгийн мессеж", "Хүргэгдсэн захидал", "Миний товлосон захидал",
                "Хуваалцсан сэтгэл", "Миний тэмдэглэл", "Миний бэлгийн санаа");
        assertThat(text).doesNotContain("Устгасан мессеж", "Алга болсон мессеж", "Хүргэгдээгүй нууц захидал",
                "Хуваалцаагүй нууц сэтгэл", "B-гийн нууц бэлэг", "lib-007", "C2-ийн нууц дурсамж");
        assertThat(new String(zip.get("index.html"), StandardCharsets.UTF_8)).contains("media/" + image + ".jpg");

        // Апп доторх ба имэйл мэдэгдэл
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification WHERE user_id = ? AND type = 'EXPORT_READY'",
                Integer.class, a.id())).isEqualTo(1);
        String link = lastMail(a.email()).link();
        for (int i = 0; i < 50 && !link.endsWith("/settings/data"); i++) {
            Thread.sleep(100); // имэйл commit-ийн дараа async
            link = lastMail(a.email()).link();
        }
        assertThat(link).endsWith("/settings/data");
        assertThat(call(b, "GET", "/exports/" + id).statusCode()).isEqualTo(404);

        // 7 хоног + 1 с → 410
        clock.set(Instant.parse(ready.path("expiresAt").asText()).plusSeconds(1));
        a = fresh(a);
        HttpResponse<String> expired = call(a, "GET", "/exports/" + id + "/download");
        assertThat(expired.statusCode()).isEqualTo(410);
        assertThat(code(expired)).isEqualTo("EXPORT_EXPIRED");
        HttpTestClient.send("POST", url("/api/v1/test/jobs/exportExpiry/run"), null);
        assertThat(ok(call(a, "GET", "/exports/" + id), 200).path("status").asText()).isEqualTo("EXPIRED");
    }

    private JsonNode awaitReady(TestUser u, String id) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 60_000;
        JsonNode e;
        do {
            HttpTestClient.send("POST", url("/api/v1/test/jobs/jobs/run"), null);
            e = ok(call(u, "GET", "/exports/" + id), 200);
            if ("READY".equals(e.path("status").asText()) || "FAILED".equals(e.path("status").asText())) {
                break;
            }
            Thread.sleep(300);
        } while (System.currentTimeMillis() < deadline);
        assertThat(e.path("status").asText()).isEqualTo("READY");
        return e;
    }

    private byte[] download(TestUser u, String id) {
        HttpResponse<String> r = call(u, "GET", "/exports/" + id + "/download");
        assertThat(r.statusCode()).isEqualTo(302);
        return HttpTestClient.getBytes(URI.create(r.headers().firstValue("Location").orElseThrow())).body();
    }

    private static Map<String, byte[]> unzip(byte[] bytes) throws Exception {
        Map<String, byte[]> out = new LinkedHashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes), StandardCharsets.UTF_8)) {
            ZipEntry e;
            while ((e = zip.getNextEntry()) != null) {
                out.put(e.getName(), zip.readAllBytes());
            }
        }
        return out;
    }
}
