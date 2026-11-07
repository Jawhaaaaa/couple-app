package mn.aura.couple.media;

import static mn.aura.couple.HttpTestClient.getBytes;
import static org.assertj.core.api.Assertions.assertThat;

import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.exif.GpsDirectory;
import com.fasterxml.jackson.databind.JsonNode;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Random;
import mn.aura.couple.AbstractSpaceIT;
import mn.aura.couple.media.app.ImageProcessorFixtures;
import mn.aura.couple.media.app.UploadSessionService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class UploadResumeIT extends AbstractSpaceIT {

    private static final HttpClient HTTP = HttpClient.newHttpClient();

    @Test
    @DisplayName("AC-20 тасарсан upload эхнээс биш үргэлжилнэ: хүлээн авсан chunk-ийг сервер санана")
    void resumeAfterDrop() throws Exception {
        TestUser a = user("up-a");
        byte[] file = pdf(UploadSessionService.CHUNK_SIZE + 700_000);
        JsonNode session = ok(call(a, "POST", "/uploads", body("purpose", "FILE", "fileName", "report.pdf",
                "mime", "application/pdf", "totalBytes", file.length)), 201);
        String id = session.path("id").asText();
        assertThat(session.path("totalChunks").asInt()).isEqualTo(2);
        assertThat(session.path("chunkSize").asInt()).isEqualTo(UploadSessionService.CHUNK_SIZE);

        assertThat(chunk(a, id, 0, Arrays.copyOfRange(file, 0, UploadSessionService.CHUNK_SIZE)).statusCode()).isEqualTo(200);
        // «Сүлжээ тасарлаа» — client дахин асуухад 0 дахь chunk хадгалагдсан
        JsonNode resumed = ok(call(a, "GET", "/uploads/" + id), 200);
        assertThat(resumed.path("receivedChunks").toString()).isEqualTo("[0]");
        assertThat(call(a, "POST", "/uploads/" + id + "/complete").statusCode()).isEqualTo(409);

        HttpResponse<String> wrongSize = chunk(a, id, 1, new byte[10]);
        assertThat(wrongSize.statusCode()).isEqualTo(409);
        assertThat(chunk(a, id, 1, Arrays.copyOfRange(file, UploadSessionService.CHUNK_SIZE, file.length)).statusCode())
                .isEqualTo(200);
        JsonNode media = ok(call(a, "POST", "/uploads/" + id + "/complete"), 200);
        assertThat(media.path("kind").asText()).isEqualTo("FILE");
        assertThat(media.path("mime").asText()).isEqualTo("application/pdf");
        assertThat(media.path("sizeBytes").asLong()).isEqualTo(file.length);
        assertThat(getBytes(URI.create(media.path("urls").path("original").asText())).body()).isEqualTo(file);
        // Давтан complete нь ижил медиа
        assertThat(ok(call(a, "POST", "/uploads/" + id + "/complete"), 200).path("id").asText())
                .isEqualTo(media.path("id").asText());
        assertThat(ok(call(a, "GET", "/media/" + media.path("id").asText()), 200).path("id").asText())
                .isEqualTo(media.path("id").asText());
    }

    @Test
    @DisplayName("AC-21 AC-172 зураг: GPS EXIF хасагдаж 3 хувилбар + blurhash-тай READY")
    void imageProcessed() throws Exception {
        TestUser a = user("upi-a");
        byte[] jpeg = ImageProcessorFixtures.jpegWithGps(1200, 900);
        String id = ok(call(a, "POST", "/uploads", body("purpose", "MEMORY", "fileName", "IMG_0001.jpg",
                "mime", "image/jpeg", "totalBytes", jpeg.length)), 201).path("id").asText();
        ok(chunk(a, id, 0, jpeg), 200);
        JsonNode media = ok(call(a, "POST", "/uploads/" + id + "/complete"), 200);
        assertThat(media.path("status").asText()).isEqualTo("READY");
        assertThat(media.path("blurhash").asText()).isNotBlank();
        assertThat(media.path("urls").path("sm").asText()).isNotBlank();
        assertThat(media.path("urls").path("md").asText()).isNotBlank();
        assertThat(media.path("urls").path("lg").asText()).isNotBlank();
        byte[] stored = getBytes(URI.create(media.path("urls").path("original").asText())).body();
        assertThat(ImageMetadataReader.readMetadata(new ByteArrayInputStream(stored))
                .getFirstDirectoryOfType(GpsDirectory.class)).isNull();
    }

    @Test
    @DisplayName("AC-129 «.jpg» нэртэй HTML файл эхний chunk дээр 415; ангилал зөрвөл (дуу → AVATAR) 415")
    void contentSniffing() {
        TestUser a = user("ups-a");
        byte[] html = "<!doctype html><html><script>alert(1)</script></html>".getBytes(StandardCharsets.UTF_8);
        String id = ok(call(a, "POST", "/uploads", body("purpose", "MEMORY", "fileName", "cat.jpg",
                "mime", "image/jpeg", "totalBytes", html.length)), 201).path("id").asText();
        HttpResponse<String> r = chunk(a, id, 0, html);
        assertThat(r.statusCode()).isEqualTo(415);
        assertThat(code(r)).isEqualTo("MEDIA_TYPE_FORBIDDEN");
        assertThat(call(a, "GET", "/uploads/" + id).statusCode()).isEqualTo(410);
        assertThat(call(a, "POST", "/uploads", body("purpose", "AVATAR", "fileName", "a.m4a", "mime", "audio/mp4",
                "totalBytes", 1000)).statusCode()).isEqualTo(415);
        assertThat(call(a, "POST", "/uploads", body("purpose", "CHAT", "fileName", "x.apk",
                "mime", "application/vnd.android.package-archive", "totalBytes", 1000)).statusCode()).isEqualTo(415);
    }

    @Test
    @DisplayName("AC-172 AC-87 хязгаар: видео > 60 с, файл > 50 MB, профайлын зураг > 10 MB")
    void limits() {
        TestUser a = user("upl-a");
        HttpResponse<String> longVideo = call(a, "POST", "/uploads", body("purpose", "MEMORY", "fileName", "v.mp4",
                "mime", "video/mp4", "totalBytes", 1000, "durationMs", 61_000));
        assertThat(code(longVideo)).isEqualTo("VIDEO_TOO_LONG");
        assertThat(call(a, "POST", "/uploads", body("purpose", "FILE", "fileName", "big.pdf", "mime", "application/pdf",
                "totalBytes", 51L * 1024 * 1024)).statusCode()).isEqualTo(413);
        assertThat(call(a, "POST", "/uploads", body("purpose", "AVATAR", "fileName", "a.jpg", "mime", "image/jpeg",
                "totalBytes", 11L * 1024 * 1024)).statusCode()).isEqualTo(413);
        HttpResponse<String> longVoice = call(a, "POST", "/uploads", body("purpose", "VOICE", "fileName", "v.m4a",
                "mime", "audio/mp4", "totalBytes", 1000, "durationMs", 5 * 60_000 + 1));
        assertThat(code(longVoice)).isEqualTo("AUDIO_TOO_LONG");
    }

    private HttpResponse<String> chunk(TestUser u, String id, int index, byte[] bytes) {
        try {
            return HTTP.send(HttpRequest.newBuilder(URI.create(url("/api/v1/uploads/" + id + "/chunks/" + index)))
                    .header("Authorization", "Bearer " + u.token())
                    .header("Content-Type", "application/octet-stream")
                    .PUT(HttpRequest.BodyPublishers.ofByteArray(bytes)).build(), HttpResponse.BodyHandlers.ofString());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    static byte[] pdf(int size) {
        byte[] out = new byte[size];
        new Random(7).nextBytes(out);
        byte[] head = "%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n".getBytes(StandardCharsets.ISO_8859_1);
        System.arraycopy(head, 0, out, 0, head.length);
        return out;
    }
}
