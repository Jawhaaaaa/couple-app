package mn.aura.couple.letter;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;
import mn.aura.couple.AbstractSpaceIT;
import mn.aura.couple.letter.app.LetterDeliveryJob;
import mn.aura.couple.realtime.StompTestClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class TimeCapsuleIT extends AbstractSpaceIT {

    @Autowired
    LetterDeliveryJob job;

    @Test
    @DisplayName("AC-45 GAP-15 хоёулаа битүүмжилсний дараа түгжинэ; нээх огноо хүртэл үүсгэгч ч уншихгүй; огноо болоход хоёуланд нээгдэнэ")
    void sealAndOpen() throws Exception {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("cap-a");
        TestUser b = user("cap-b");
        pair(a, b);
        assertThat(call(a, "POST", "/capsules", body("title", "Өнгөрсөн", "openOn", "2026-11-07")).statusCode()).isEqualTo(400);
        JsonNode c = ok(call(a, "POST", "/capsules", body("title", "2027 оны бид", "openOn", "2026-11-20")), 201);
        String id = c.path("id").asText();
        assertThat(c.path("status").asText()).isEqualTo("WRITING");
        assertThat(c.path("parts").size()).isEqualTo(2);

        ok(call(a, "PUT", "/capsules/" + id + "/my-part", body("body", "А-гийн нууц", "mediaIds", List.of())), 200);
        JsonNode mine = ok(call(a, "GET", "/capsules/" + id), 200);
        assertThat(mine.toString()).doesNotContain("А-гийн нууц");
        ok(call(a, "POST", "/capsules/" + id + "/seal"), 200);
        assertThat(code(call(a, "PUT", "/capsules/" + id + "/my-part", body("body", "Өөр", "mediaIds", List.of()))))
                .isEqualTo("CAPSULE_SEALED");
        assertThat(code(call(a, "POST", "/capsules/" + id + "/seal"))).isEqualTo("CAPSULE_SEALED");
        // Ганцаараа битүүмжилсэн — хараахан түгжигдээгүй, B бичиж болно
        assertThat(ok(call(b, "GET", "/capsules/" + id), 200).path("status").asText()).isEqualTo("WRITING");
        ok(call(b, "PUT", "/capsules/" + id + "/my-part", body("body", "Б-гийн нууц", "mediaIds", List.of())), 200);
        JsonNode sealed = ok(call(b, "POST", "/capsules/" + id + "/seal"), 200);
        assertThat(sealed.path("status").asText()).isEqualTo("SEALED");
        for (JsonNode p : sealed.path("parts")) {
            assertThat(p.path("sealed").asBoolean()).isTrue();
            assertThat(p.has("body")).isFalse();
        }

        clock.set(Instant.parse("2026-11-19T15:00:00Z")); // УБ 11-19 23:00 — хараахан биш
        a = fresh(a);
        b = fresh(b);
        job.runOnce();
        JsonNode before = ok(call(a, "GET", "/capsules/" + id), 200);
        assertThat(before.toString()).doesNotContain("А-гийн нууц").doesNotContain("Б-гийн нууц");
        assertThat(ok(call(b, "GET", "/capsules"), 200).get(0).path("status").asText()).isEqualTo("SEALED");

        clock.set(Instant.parse("2026-11-19T15:59:59Z"));
        b = fresh(b);
        try (StompTestClient bClient = StompTestClient.connect(port, b.token()).events()) {
            Thread.sleep(300);
            clock.set(Instant.parse("2026-11-19T16:00:30Z")); // УБ 11-20 00:00:30
            assertThat(job.runOnce()).isPositive();
            assertThat(bClient.next("capsule.opened", 3000).path("payload").path("capsuleId").asText()).isEqualTo(id);
        }
        JsonNode opened = ok(call(b, "GET", "/capsules/" + id), 200);
        assertThat(opened.path("status").asText()).isEqualTo("OPENED");
        assertThat(opened.toString()).contains("А-гийн нууц").contains("Б-гийн нууц");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification WHERE type = 'CAPSULE_OPENED' AND user_id IN (?, ?)",
                Integer.class, a.id(), b.id())).isEqualTo(2);

        TestUser c2 = user("cap-c");
        TestUser d2 = user("cap-d");
        pair(c2, d2);
        assertThat(call(c2, "GET", "/capsules/" + id).statusCode()).isEqualTo(404);
    }
}
