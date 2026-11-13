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

class AudioTranscodeIT extends AbstractSpaceIT {

    private static final HttpClient HTTP = HttpClient.newHttpClient();
    private static final DockerCommandRunner FFMPEG = new DockerCommandRunner();

    @Test
    @DisplayName("AC-32 AC-158 хөтчийн webm/opus дуут мессеж → AAC m4a, урт, 64 цэгийн долгион, metadata-гүй READY")
    void webmToAac() throws Exception {
        TestUser a = user("aud-a");
        TestUser b = user("aud-b");
        pair(a, b);
        JsonNode media = upload(a, FFMPEG.testAudio(10, "voice.webm"), "voice.webm", "audio/webm", 10_000);
        assertThat(media.path("status").asText()).isEqualTo("PROCESSING");
        String id = media.path("id").asText();

        JsonNode ready = awaitProcessed(a, id);
        assertThat(ready.path("status").asText()).isEqualTo("READY");
        assertThat(ready.path("mime").asText()).isEqualTo("audio/mp4");
        assertThat(ready.path("durationMs").asLong()).isBetween(9_800L, 10_300L);
        JsonNode wave = ready.path("waveform");
        assertThat(wave.size()).isEqualTo(64);
        // Эхний хагас чимээгүй, сүүлийн хагас дуутай
        assertThat(wave.get(5).asDouble()).isLessThan(0.05);
        assertThat(wave.get(60).asDouble()).isGreaterThan(0.5);
        for (JsonNode v : wave) {
            assertThat(v.asDouble()).isBetween(0.0, 1.0);
        }

        // Хамтрагч ч ижил формат авч тоглуулна (дуут мессеж)
        String msg = ok(call(a, "POST", "/messages", body("clientMessageId", java.util.UUID.randomUUID().toString(),
                "kind", "VOICE", "mediaId", id)), 201).path("id").asText();
        assertThat(msg).isNotBlank();
        JsonNode forB = ok(call(b, "GET", "/media/" + id), 200);
        byte[] out = getBytes(URI.create(forB.path("urls").path("original").asText())).body();
        Path dir = Files.createTempDirectory("aura-probe-");
        Files.write(dir.resolve("out.m4a"), out);
        var probe = FFMPEG.run(dir, List.of("ffprobe", "-v", "error", "-show_entries",
                "stream=codec_name,channels:format_tags", "-of", "default=nw=1", "out.m4a"));
        assertThat(probe.stdout()).contains("codec_name=aac").contains("channels=1");
        assertThat(probe.stdout()).doesNotContain("location");
    }

    @Test
    @DisplayName("AC-32 iOS-ийн m4a (AAC) дуу ч мөн нэг формат руу орж READY")
    void m4aStaysAac() throws Exception {
        TestUser a = user("aud4-a");
        String id = upload(a, FFMPEG.testAudio(4, "voice.m4a"), "voice.m4a", "audio/mp4", 4_000).path("id").asText();
        JsonNode ready = awaitProcessed(a, id);
        assertThat(ready.path("status").asText()).isEqualTo("READY");
        assertThat(ready.path("mime").asText()).isEqualTo("audio/mp4");
        assertThat(ready.path("waveform").size()).isEqualTo(64);
    }

    @Test
    @DisplayName("AC-32 бодит урт 5 минутаас хэтэрвэл (client богино гэж зарласан ч) FAILED")
    void tooLong() throws Exception {
        TestUser a = user("audl-a");
        String id = upload(a, FFMPEG.testAudio(302, "long.webm"), "long.webm", "audio/webm", 10_000).path("id").asText();
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

    private JsonNode upload(TestUser u, byte[] bytes, String name, String mime, int durationMs) throws Exception {
        JsonNode s = ok(call(u, "POST", "/uploads", body("purpose", "VOICE", "fileName", name, "mime", mime,
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
