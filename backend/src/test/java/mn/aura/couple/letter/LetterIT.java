package mn.aura.couple.letter;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import mn.aura.couple.letter.app.LetterDeliveryJob;
import mn.aura.couple.realtime.StompTestClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class LetterIT extends AbstractSpaceIT {

    private static final String SECRET = "Чамд нууцхан хэлэх зүйл байна";

    @Autowired
    LetterDeliveryJob job;

    private UUID image(TestUser u, UUID space) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO media (id, space_id, owner_id, kind, mime, size_bytes, s3_key, status) "
                + "VALUES (?, ?, ?, 'IMAGE', 'image/jpeg', 1000, ?, 'READY')", id, space, u.id(), "spaces/" + space + "/" + id);
        return id;
    }

    @Test
    @DisplayName("AC-43 AC-182 товлосон захидлын агуулга хүргэхээс өмнө B-гийн API, WS, мэдэгдэлд 0 — зөвхөн teaser")
    void hiddenUntilDelivered() throws Exception {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("let-a");
        TestUser b = user("let-b");
        UUID space = pair(a, b);
        UUID img = image(a, space);
        JsonNode letter = ok(call(a, "POST", "/letters", body("template", "PAPER_2", "body", SECRET, "mediaIds", List.of(img),
                "deliverAt", "2026-11-10T00:00:00Z", "occasionLabel", "1000 дахь өдөр", "draft", false)), 201);
        String id = letter.path("id").asText();
        assertThat(letter.path("status").asText()).isEqualTo("SCHEDULED");

        assertThat(call(b, "GET", "/letters/" + id).statusCode()).isEqualTo(404);
        JsonNode upcoming = ok(call(b, "GET", "/letters?box=upcoming"), 200);
        assertThat(upcoming.size()).isEqualTo(1);
        assertThat(upcoming.get(0).path("occasionLabel").asText()).isEqualTo("1000 дахь өдөр");
        assertThat(upcoming.toString()).doesNotContain(SECRET).doesNotContain("PAPER_2").doesNotContain(img.toString());
        assertThat(ok(call(b, "GET", "/letters?box=inbox"), 200).size()).isZero();
        JsonNode dash = ok(call(b, "GET", "/dashboard"), 200);
        assertThat(dash.path("incomingLetters").size()).isEqualTo(1);
        assertThat(dash.toString()).doesNotContain(SECRET);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification WHERE user_id = ? AND type = 'LETTER_DELIVERED'",
                Integer.class, b.id())).isZero();
        job.runOnce();
        assertThat(call(b, "GET", "/letters/" + id).statusCode()).isEqualTo(404);
    }

    @Test
    @DisplayName("AC-44 хүргэх агшин T болоход ≤ 1 мин-д хүргэгдэж B-д мэдэгдэл, letter.delivered; уншсаныг A мэдэнэ")
    void deliveredOnTime() throws Exception {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("letd-a");
        TestUser b = user("letd-b");
        pair(a, b);
        String id = ok(call(a, "POST", "/letters", body("template", "PAPER_1", "body", SECRET, "mediaIds", List.of(),
                "deliverAt", "2026-11-07T04:05:00Z", "draft", false)), 201).path("id").asText();
        clock.set(Instant.parse("2026-11-07T04:04:59Z"));
        job.runOnce();
        assertThat(call(b, "GET", "/letters/" + id).statusCode()).isEqualTo(404);
        try (StompTestClient bClient = StompTestClient.connect(port, b.token()).events();
             StompTestClient aClient = StompTestClient.connect(port, a.token()).events()) {
            Thread.sleep(300);
            clock.set(Instant.parse("2026-11-07T04:05:15Z")); // 15 с тутмын ажил — T + 15 с
            assertThat(job.runOnce()).isPositive();
            JsonNode ev = bClient.next("letter.delivered", 3000).path("payload");
            assertThat(ev.path("id").asText()).isEqualTo(id);
            assertThat(ev.toString()).doesNotContain(SECRET);
            JsonNode got = ok(call(b, "GET", "/letters/" + id), 200);
            assertThat(got.path("body").asText()).isEqualTo(SECRET);
            assertThat(got.path("status").asText()).isEqualTo("DELIVERED");
            assertThat(java.time.Duration.between(Instant.parse("2026-11-07T04:05:00Z"),
                    Instant.parse(got.path("deliveredAt").asText()))).isLessThanOrEqualTo(java.time.Duration.ofMinutes(1));
            assertThat(ok(call(b, "POST", "/letters/" + id + "/read"), 200).path("status").asText()).isEqualTo("READ");
            assertThat(aClient.next("letter.read", 3000).path("payload").path("letterId").asText()).isEqualTo(id);
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification WHERE user_id = ? AND type = 'LETTER_DELIVERED'",
                Integer.class, b.id())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT params::text FROM notification WHERE user_id = ? AND type = 'LETTER_DELIVERED'",
                String.class, b.id())).doesNotContain(SECRET);
        List<String> inbox = new ArrayList<>();
        ok(call(b, "GET", "/letters?box=inbox"), 200).forEach(l -> inbox.add(l.path("id").asText()));
        assertThat(inbox).containsExactly(id);
        assertThat(ok(call(a, "GET", "/letters?box=sent"), 200).get(0).path("status").asText()).isEqualTo("READ");
    }

    @Test
    @DisplayName("AC-112 AC-111 хүргэгдээгүйг A засна, цуцлахад B-гийн тэмдэг алга; хүргэгдсэний дараа засахгүй; 6 дахь зураг татгалзана")
    void editCancelLimits() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("lete-a");
        TestUser b = user("lete-b");
        UUID space = pair(a, b);
        List<UUID> six = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            six.add(image(a, space));
        }
        assertThat(code(call(a, "POST", "/letters", body("template", "PAPER_3", "body", "x", "mediaIds", six, "draft", false))))
                .isEqualTo("MEDIA_LIMIT_EXCEEDED");
        JsonNode l = ok(call(a, "POST", "/letters", body("template", "PAPER_3", "body", "Анхны", "mediaIds", six.subList(0, 5),
                "deliverAt", "2026-11-20T00:00:00Z", "draft", false)), 201);
        String id = l.path("id").asText();
        assertThat(l.path("media").size()).isEqualTo(5);
        JsonNode edited = ok(call(a, "PATCH", "/letters/" + id, body("body", "Зассан", "version", l.path("version").asLong())), 200);
        assertThat(edited.path("body").asText()).isEqualTo("Зассан");
        assertThat(call(b, "PATCH", "/letters/" + id, body("body", "x", "version", 1)).statusCode()).isEqualTo(404);
        assertThat(ok(call(b, "GET", "/letters?box=upcoming"), 200).size()).isEqualTo(1);
        ok(call(a, "DELETE", "/letters/" + id), 204);
        assertThat(ok(call(b, "GET", "/letters?box=upcoming"), 200).size()).isZero();
        assertThat(ok(call(b, "GET", "/dashboard"), 200).path("incomingLetters").size()).isZero();

        String now = ok(call(a, "POST", "/letters", body("template", "PAPER_1", "body", "Шууд", "mediaIds", List.of(),
                "draft", false)), 201).path("id").asText();
        JsonNode delivered = ok(call(b, "GET", "/letters/" + now), 200);
        assertThat(delivered.path("status").asText()).isEqualTo("DELIVERED");
        assertThat(code(call(a, "PATCH", "/letters/" + now, body("body", "Өөр", "version", delivered.path("version").asLong()))))
                .isEqualTo("LETTER_ALREADY_DELIVERED");
        assertThat(code(call(a, "DELETE", "/letters/" + now))).isEqualTo("LETTER_ALREADY_DELIVERED");
        assertThat(code(call(b, "PATCH", "/letters/" + now, body("body", "Өөр", "version", 0)))).isEqualTo("NOT_OWNER");
    }
}
