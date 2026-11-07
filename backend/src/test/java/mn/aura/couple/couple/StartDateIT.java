package mn.aura.couple.couple;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpResponse;
import java.time.Instant;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class StartDateIT extends AbstractSpaceIT {

    @Test
    @DisplayName("AC-65 A 2024-10-24, B 2024-10-25 → MISMATCH хоёуланд; ижил болмогц CONFIRMED")
    void proposeAndConfirm() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("sd-a");
        TestUser b = user("sd-b");
        pair(a, b);

        JsonNode afterA = ok(call(a, "PUT", "/couple/start-date", body("date", "2024-10-24")), 200);
        assertThat(afterA.path("startDateStatus").asText()).isEqualTo("PENDING");
        assertThat(afterA.path("myProposal").asText()).isEqualTo("2024-10-24");
        assertThat(afterA.path("startDate").isMissingNode() || afterA.path("startDate").isNull()).isTrue();

        JsonNode afterB = ok(call(b, "PUT", "/couple/start-date", body("date", "2024-10-25")), 200);
        assertThat(afterB.path("startDateStatus").asText()).isEqualTo("MISMATCH");
        assertThat(afterB.path("partnerProposal").asText()).isEqualTo("2024-10-24");
        JsonNode aView = ok(call(a, "GET", "/couple"), 200);
        assertThat(aView.path("startDateStatus").asText()).isEqualTo("MISMATCH");
        assertThat(aView.path("partnerProposal").asText()).isEqualTo("2024-10-25");

        JsonNode agreed = ok(call(a, "PUT", "/couple/start-date", body("date", "2024-10-25")), 200);
        assertThat(agreed.path("startDateStatus").asText()).isEqualTo("CONFIRMED");
        assertThat(agreed.path("startDate").asText()).isEqualTo("2024-10-25");
        assertThat(ok(call(b, "GET", "/couple"), 200).path("startDateStatus").asText()).isEqualTo("CONFIRMED");

        // Дараа нь өөрчилбөл дахин батлах хүртэл тоолуур баталгаагүй
        JsonNode changed = ok(call(b, "PUT", "/couple/start-date", body("date", "2024-10-20")), 200);
        assertThat(changed.path("startDateStatus").asText()).isEqualTo("MISMATCH");
    }

    @Test
    @DisplayName("AC-65 ирээдүйн огноо (хосын бүсийн өнөөдрөөс хойш) → 400")
    void futureRejected() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("sdf-a");
        TestUser b = user("sdf-b");
        pair(a, b);
        HttpResponse<String> r = call(a, "PUT", "/couple/start-date", body("date", "2026-11-08"));
        assertThat(r.statusCode()).isEqualTo(400);
        ok(call(a, "PUT", "/couple/start-date", body("date", "2026-11-07")), 200);
    }

    @Test
    @DisplayName("AC-127 тасалж буй хосын бичих үйлдэл → 423 SPACE_READ_ONLY")
    void readOnlyWhileBreaking() {
        TestUser a = user("ro-a");
        TestUser b = user("ro-b");
        var space = pair(a, b);
        jdbc.update("UPDATE space SET status = 'BREAKING' WHERE id = ?", space);
        HttpResponse<String> r = call(a, "PUT", "/couple/start-date", body("date", "2024-10-24"));
        assertThat(r.statusCode()).isEqualTo(423);
        assertThat(code(r)).isEqualTo("SPACE_READ_ONLY");
        assertThat(call(a, "GET", "/couple").statusCode()).isEqualTo(200);
    }
}
