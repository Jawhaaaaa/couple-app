package mn.aura.couple.media.app;

import static mn.aura.couple.HttpTestClient.getBytes;
import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;
import mn.aura.couple.AbstractIntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** AC-195, DD-AURA-013: медиа зөвхөн хугацаатай signed URL-аар; дууссан нь S3-аас 403. */
@DisplayName("Presigned URL")
class SignedUrlIT extends AbstractIntegrationTest {

    @Autowired
    MediaStorageService storage;

    private String upload() {
        String key = MediaStorageService.key(UUID.randomUUID(), UUID.randomUUID(), "original");
        storage.put(key, "aura-media-bytes".getBytes(StandardCharsets.UTF_8), "image/jpeg");
        return key;
    }

    @Test
    @DisplayName("AC-195 анхдагч хугацаа 15 мин, presigned URL-аар татахад 200")
    void presignedDownload() {
        assertThat(storage.presignTtl()).isEqualTo(Duration.ofMinutes(15));
        String key = upload();
        URI url = storage.presignGet(key);
        assertThat(url.getQuery()).contains("X-Amz-Signature=").contains("X-Amz-Expires=900");

        HttpResponse<byte[]> r = getBytes(url);
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(new String(r.body(), StandardCharsets.UTF_8)).isEqualTo("aura-media-bytes");
        // Safari (iPhone PWA) `aws-chunked` Content-Encoding-той зургийг ачаалдаггүй (AC-219)
        assertThat(r.headers().firstValue("Content-Encoding").orElse("")).doesNotContain("aws-chunked");
        assertThat(r.headers().firstValue("Content-Type")).hasValue("image/jpeg");
    }

    @Test
    @DisplayName("AC-195 хугацаа дууссан presigned URL → 403")
    void expiredUrlForbidden() throws Exception {
        String key = upload();
        URI url = storage.presignGet(key, Duration.ofSeconds(1));
        Thread.sleep(3_000);
        assertThat(getBytes(url).statusCode()).isEqualTo(403);
    }

    @Test
    @DisplayName("AC-195 bucket private — гарын үсэггүй URL → 403")
    void unsignedForbidden() {
        String key = upload();
        URI signed = storage.presignGet(key);
        URI unsigned = URI.create(signed.toString().substring(0, signed.toString().indexOf('?')));
        assertThat(getBytes(unsigned).statusCode()).isEqualTo(403);
    }
}
