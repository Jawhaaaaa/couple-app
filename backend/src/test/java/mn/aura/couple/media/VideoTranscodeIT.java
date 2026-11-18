package mn.aura.couple.media;

import static mn.aura.couple.HttpTestClient.getBytes;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import mn.aura.couple.AbstractSpaceIT;
import mn.aura.couple.HttpTestClient;
import mn.aura.couple.media.app.UploadSessionService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class VideoTranscodeIT extends AbstractSpaceIT {

    private static final HttpClient HTTP = HttpClient.newHttpClient();
    private static final DockerCommandRunner FFMPEG = new DockerCommandRunner();

    @Test
    @DisplayName("AC-24 AC-172 видео: хөрвүүлэлт дуустал PROCESSING, дараа нь H.264 720p, poster-той, metadata-гүй READY")
    void transcode() throws Exception {
        TestUser a = user("vid-a");
        byte[] video = FFMPEG.testVideo(3);
        JsonNode media = upload(a, video, "clip.mp4", 3000);
        assertThat(media.path("status").asText()).isEqualTo("PROCESSING");
        String id = media.path("id").asText();

        JsonNode ready = awaitProcessed(a, id);
        assertThat(ready.path("status").asText()).isEqualTo("READY");
        assertThat(ready.path("mime").asText()).isEqualTo("video/mp4");
        assertThat(ready.path("height").asInt()).isEqualTo(720);
        assertThat(ready.path("width").asInt()).isEqualTo(1280);
        assertThat(ready.path("durationMs").asLong()).isBetween(2900L, 3200L);
        assertThat(ready.path("urls").path("poster").asText()).isNotBlank();

        byte[] out = getBytes(URI.create(ready.path("urls").path("original").asText())).body();
        Path dir = Files.createTempDirectory("aura-probe-");
        Files.write(dir.resolve("out.mp4"), out);
        var probe = FFMPEG.run(dir, List.of("ffprobe", "-v", "error", "-show_entries",
                "stream=codec_name:format_tags", "-of", "default=nw=1", "out.mp4"));
        assertThat(probe.stdout()).contains("codec_name=h264").contains("codec_name=aac");
        assertThat(probe.stdout()).doesNotContain("location");
    }

    @Test
    @DisplayName("AC-172 дурсамжийн видео 60 с-ээс урт бол (клиент худал хэлсэн ч) FAILED")
    void tooLong() throws Exception {
        TestUser a = user("vidl-a");
        byte[] video = FFMPEG.testVideo(62);
        String id = upload(a, video, "long.mp4", 30_000).path("id").asText();
        assertThat(awaitProcessed(a, id).path("status").asText()).isEqualTo("FAILED");
    }

    /** Ажлыг шууд ажиллуулна; 5 с тутмын хуваарь түрүүлж авсан бол дуустал хүлээнэ. */
    private JsonNode awaitProcessed(TestUser u, String id) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 180_000;
        JsonNode m;
        do {
            HttpTestClient.send("POST", url("/api/v1/test/jobs/jobs/run"), null);
            m = ok(call(u, "GET", "/media/" + id), 200);
            if (!"PROCESSING".equals(m.path("status").asText())) {
                return m;
            }
            Thread.sleep(500);
        } while (System.currentTimeMillis() < deadline);
        return m;
    }

    private JsonNode upload(TestUser u, byte[] bytes, String name, int durationMs) throws Exception {
        JsonNode s = ok(call(u, "POST", "/uploads", body("purpose", "MEMORY", "fileName", name, "mime", "video/mp4",
                "totalBytes", bytes.length, "durationMs", durationMs)), 201);
        String id = s.path("id").asText();
        int size = UploadSessionService.CHUNK_SIZE;
        for (int i = 0; i < s.path("totalChunks").asInt(); i++) {
            byte[] part = Arrays.copyOfRange(bytes, i * size, Math.min(bytes.length, (i + 1) * size));
            HttpResponse<String> r = HTTP.send(HttpRequest.newBuilder(URI.create(url("/api/v1/uploads/" + id + "/chunks/" + i)))
                    .header("Authorization", "Bearer " + u.token()).header("Content-Type", "application/octet-stream")
                    .PUT(HttpRequest.BodyPublishers.ofByteArray(part)).build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        }
        return ok(call(u, "POST", "/uploads/" + id + "/complete"), 200);
    }
}
