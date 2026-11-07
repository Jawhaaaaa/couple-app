package mn.aura.couple.memory;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import mn.aura.couple.HttpTestClient;
import mn.aura.couple.media.app.ImageProcessorFixtures;
import mn.aura.couple.media.app.MediaStorageService;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class MemoryExportIT extends AbstractMemoryIT {

    @Autowired
    MediaStorageService storage;

    @Test
    @DisplayName("AC-26 PDF номд Монгол текст (Ө Ү) зөв, зураг бүр тайлбартайгаа; AC-126 бэлэн болоход мэдэгдэл, 7 хоногийн дараа 410")
    void pdfBook() throws Exception {
        TestUser a = user("pdf-a");
        TestUser b = user("pdf-b");
        pair(a, b);
        String id = memory(a, "Өнөөдөр Үүрийн гэгээ", "2026-10-03", "\"description\":\"Өглөөний нар Үүлэн дундуур\"")
                .path("id").asText();
        jdbc.update("UPDATE memory_media SET alt_text = 'Хоёулаа уулан дээр' WHERE memory_id = ?::uuid", id);
        putRealImage(id);

        JsonNode export = ok(call(a, "POST", "/exports", body("kind", "BOOK_PDF", "locale", "mn")), 202);
        assertThat(export.path("status").asText()).isEqualTo("QUEUED");
        assertThat(call(a, "POST", "/exports", body("kind", "ALBUM_ZIP", "locale", "mn")).statusCode()).isEqualTo(429);
        JsonNode ready = awaitReady(a, export.path("id").asText());
        assertThat(ready.path("expiresAt").asText()).isNotBlank();

        byte[] pdf = download(a, ready.path("id").asText());
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(doc);
            assertThat(text).contains("Өнөөдөр Үүрийн гэгээ").contains("Өглөөний нар Үүлэн дундуур")
                    .contains("Хоёулаа уулан дээр").contains("2026 оны 10 сар");
            assertThat(doc.getNumberOfPages()).isGreaterThanOrEqualTo(2);
        }
        assertThat(ok(call(a, "GET", "/notifications"), 200).path("items").toString()).contains("EXPORT_READY");

        advance(Duration.ofDays(7).plusMinutes(1));
        a = fresh(a);
        HttpResponse<String> expired = call(a, "GET", "/exports/" + ready.path("id").asText() + "/download");
        assertThat(expired.statusCode()).isEqualTo(410);
        assertThat(code(expired)).isEqualTo("EXPORT_EXPIRED");
    }

    @Test
    @DisplayName("AC-85 бүлгийн цомгийн ZIP-д бүх анхны файл YYYY-MM-DD_гарчиг_N.jpg нэртэй")
    void albumZip() throws Exception {
        TestUser a = user("zip-a");
        TestUser b = user("zip-b");
        pair(a, b);
        String gid = ok(call(a, "POST", "/memory-groups", body("name", "Анхны аялал")), 201).path("id").asText();
        String json = "\"groupIds\":[\"" + gid + "\"],\"media\":[{\"mediaId\":\"" + image(a) + "\"},{\"mediaId\":\"" + image(a) + "\"}]";
        String m1 = memory(a, "Анхны аялал", "2025-06-01", json).path("id").asText();
        memory(b, "Гэртээ", "2025-06-02", null); // бүлэгт ороогүй
        for (String key : jdbc.queryForList("SELECT x.s3_key FROM memory_media mm JOIN media x ON x.id = mm.media_id "
                + "WHERE mm.memory_id = ?::uuid", String.class, m1)) {
            storage.put(key, "jpeg-bytes".getBytes(StandardCharsets.UTF_8), "image/jpeg");
        }
        String exportId = ok(call(a, "POST", "/exports", body("kind", "ALBUM_ZIP", "groupId", gid, "locale", "mn")), 202)
                .path("id").asText();
        awaitReady(a, exportId);
        List<String> names = new ArrayList<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(download(a, exportId)), StandardCharsets.UTF_8)) {
            for (ZipEntry e = zip.getNextEntry(); e != null; e = zip.getNextEntry()) {
                names.add(e.getName());
            }
        }
        assertThat(names).containsExactly("2025-06-01_Анхны аялал_1.jpg", "2025-06-01_Анхны аялал_2.jpg");
        assertThat(call(b, "GET", "/exports/" + exportId).statusCode()).isEqualTo(404);
    }

    private void putRealImage(String memoryId) throws Exception {
        String key = jdbc.queryForObject("SELECT x.s3_key FROM memory_media mm JOIN media x ON x.id = mm.media_id "
                + "WHERE mm.memory_id = ?::uuid", String.class, memoryId);
        storage.put(key, ImageProcessorFixtures.jpegWithGps(400, 300), "image/jpeg");
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

}
