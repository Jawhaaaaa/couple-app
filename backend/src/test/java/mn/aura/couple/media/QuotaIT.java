package mn.aura.couple.media;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class QuotaIT extends AbstractSpaceIT {

    private static final long GB10 = 10_737_418_240L;

    @Test
    @DisplayName("AC-200 80%-иас давахад quotaWarning, 10 GB хэтрэхэд 507 STORAGE_QUOTA_EXCEEDED, хэрэглээ /storage/usage-д")
    void quota() {
        TestUser a = user("q-a");
        UUID solo = soloSpace(a);
        jdbc.update("UPDATE space SET storage_bytes = ? WHERE id = ?", (long) (GB10 * 0.8) - 100, solo);
        JsonNode warn = ok(call(a, "POST", "/uploads", body("purpose", "FILE", "fileName", "a.pdf", "mime", "application/pdf",
                "totalBytes", 1000)), 201);
        assertThat(warn.path("quotaWarning").asBoolean()).isTrue();
        JsonNode usage = ok(call(a, "GET", "/storage/usage"), 200);
        assertThat(usage.path("warning").asBoolean()).isTrue();
        assertThat(usage.path("quotaBytes").asLong()).isEqualTo(GB10);

        jdbc.update("UPDATE space SET storage_bytes = ? WHERE id = ?", GB10 - 500, solo);
        HttpResponse<String> full = call(a, "POST", "/uploads", body("purpose", "FILE", "fileName", "b.pdf",
                "mime", "application/pdf", "totalBytes", 1000));
        assertThat(full.statusCode()).isEqualTo(507);
        assertThat(code(full)).isEqualTo("STORAGE_QUOTA_EXCEEDED");
    }

    @Test
    @DisplayName("AC-20 24 цагаас хуучин дуусаагүй upload цуцлагдаж квот буцна; цуцлах ч квот буцаана")
    void cleanupReleasesQuota() {
        TestUser a = user("qc-a");
        UUID solo = soloSpace(a);
        long before = used(solo);
        String id = ok(call(a, "POST", "/uploads", body("purpose", "FILE", "fileName", "c.pdf", "mime", "application/pdf",
                "totalBytes", 4000)), 201).path("id").asText();
        assertThat(used(solo)).isEqualTo(before + 4000);
        ok(call(a, "DELETE", "/uploads/" + id), 204);
        assertThat(used(solo)).isEqualTo(before);

        String id2 = ok(call(a, "POST", "/uploads", body("purpose", "FILE", "fileName", "d.pdf", "mime", "application/pdf",
                "totalBytes", 3000)), 201).path("id").asText();
        advance(Duration.ofHours(25));
        mn.aura.couple.HttpTestClient.send("POST", url("/api/v1/test/jobs/uploadCleanup/run"), null);
        assertThat(used(solo)).isEqualTo(before);
        a = fresh(a);
        assertThat(call(a, "GET", "/uploads/" + id2).statusCode()).isEqualTo(410);
    }

    private long used(UUID space) {
        return jdbc.queryForObject("SELECT storage_bytes FROM space WHERE id = ?", Long.class, space);
    }
}
