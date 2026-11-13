package mn.aura.couple.chat;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import mn.aura.couple.chat.app.DisappearingMessageJob;
import mn.aura.couple.realtime.StompTestClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class DisappearingMessageIT extends AbstractChatIT {

    @Autowired
    DisappearingMessageJob job;

    @Test
    @DisplayName("AC-92 1 минутын мессеж B уншаагүй бол хугацаа эхлэхгүй; уншсанаас 60 с-д хоёр талаас ба серверээс алга, chat.expired")
    void expiresSixtySecondsAfterRead() throws Exception {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("dm-a");
        TestUser b = user("dm-b");
        pair(a, b);
        UUID media = media(a, "IMAGE", "image/jpeg");
        JsonNode sent = ok(post(a, "kind", "IMAGE", "mediaId", media.toString(), "text", "нууц", "disappearSeconds", 60), 201);
        String id = sent.path("id").asText();
        assertThat(sent.path("disappearSeconds").asInt()).isEqualTo(60);
        assertThat(sent.path("expiresAt").isNull() || sent.path("expiresAt").isMissingNode()).isTrue();

        // Уншаагүй — хугацаа өнгөрсөн ч алга болохгүй
        clock.set(Instant.parse("2026-11-07T04:10:00Z"));
        assertThat(job.runOnce()).isZero();
        assertThat(find(messages(b, null), id)).isNotNull();

        ok(call(b, "POST", "/messages/read", body("upToMessageId", id)), 204);
        JsonNode read = find(messages(a, null), id);
        assertThat(Duration.between(Instant.parse("2026-11-07T04:10:00Z"), Instant.parse(read.path("expiresAt").asText())))
                .isBetween(Duration.ofSeconds(60), Duration.ofSeconds(61));

        clock.set(Instant.parse("2026-11-07T04:10:55Z"));
        assertThat(job.runOnce()).isZero();
        assertThat(find(messages(a, null), id)).isNotNull();

        try (StompTestClient aClient = StompTestClient.connect(port, a.token()).events();
             StompTestClient bClient = StompTestClient.connect(port, b.token()).events()) {
            Thread.sleep(300);
            clock.set(Instant.parse("2026-11-07T04:11:02Z"));
            // Ажил гүйхээс өмнө ч API-д гарахгүй
            assertThat(find(messages(b, null), id)).isNull();
            assertThat(job.runOnce()).isEqualTo(1);
            assertThat(aClient.next("chat.expired", 3000).path("payload").path("messageId").asText()).isEqualTo(id);
            assertThat(bClient.next("chat.expired", 3000).path("payload").path("messageId").asText()).isEqualTo(id);
        }
        assertThat(find(messages(a, null), id)).isNull();
        assertThat(find(messages(b, null), id)).isNull();
        var row = jdbc.queryForMap("SELECT text, media_id, location, deleted_at FROM chat_message WHERE id = ?::uuid", id);
        assertThat(row.get("text")).isNull();
        assertThat(row.get("media_id")).isNull();
        assertThat(row.get("deleted_at")).isNotNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM media WHERE id = ?", Integer.class, media)).isZero();
        assertThat(job.runOnce()).isZero();
    }

    @Test
    @DisplayName("AC-30 хугацаа нь дууссан мессеж хайлт, pin, around, засах/реакцад гарахгүй")
    void expiredHiddenEverywhere() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("dh-a");
        TestUser b = user("dh-b");
        pair(a, b);
        String id = ok(post(a, "kind", "TEXT", "text", "Тэрэлжийн нууц төлөвлөгөө", "disappearSeconds", 60), 201)
                .path("id").asText();
        ok(call(a, "PUT", "/messages/" + id + "/pin"), 204);
        ok(call(b, "POST", "/messages/read", body("upToMessageId", id)), 204);
        clock.set(Instant.parse("2026-11-07T04:02:00Z"));
        job.runOnce();

        assertThat(ok(call(a, "GET", "/messages/search?q=Тэрэлж"), 200).path("items")).isEmpty();
        assertThat(ok(call(a, "GET", "/messages/pinned"), 200)).isEmpty();
        assertThat(call(a, "GET", "/messages?around=" + id).statusCode()).isEqualTo(200);
        assertThat(find(ok(call(a, "GET", "/messages?around=" + id), 200), id)).isNull();
        assertThat(call(a, "PATCH", "/messages/" + id, body("text", "засвар")).statusCode()).isEqualTo(404);
        assertThat(call(b, "PUT", "/messages/" + id + "/reaction", body("emoji", "LOVE")).statusCode()).isEqualTo(404);
        assertThat(call(b, "POST", "/messages/" + id + "/screenshot").statusCode()).isEqualTo(404);
    }

    @Test
    @DisplayName("AC-92 хосын анхдагч хугацаа: PUT /chat/settings → дараагийн мессеж 1 цагтай; 0 бол унтраастай; буруу утга 400")
    void chatSettings() {
        TestUser a = user("ds-a");
        TestUser b = user("ds-b");
        pair(a, b);
        assertThat(ok(call(a, "PUT", "/chat/settings", body("disappearSeconds", 3600)), 200)
                .path("disappearSeconds").asInt()).isEqualTo(3600);
        assertThat(text(b, "цагийн мессеж").path("disappearSeconds").asInt()).isEqualTo(3600);
        // Мессеж бүр өөрөө дарж болно
        assertThat(ok(post(b, "kind", "TEXT", "text", "минут", "disappearSeconds", 60), 201)
                .path("disappearSeconds").asInt()).isEqualTo(60);

        ok(call(b, "PUT", "/chat/settings", body("disappearSeconds", 0)), 200);
        JsonNode plain = text(a, "энгийн");
        assertThat(plain.path("disappearSeconds").isNull() || plain.path("disappearSeconds").isMissingNode()).isTrue();

        assertThat(call(a, "PUT", "/chat/settings", body("disappearSeconds", 120)).statusCode()).isEqualTo(400);
    }

    @Test
    @DisplayName("AC-92 дэлгэцийн зураг: хүлээн авагч мэдэгдвэл илгээгчид SCREENSHOT_TAKEN нэг удаа; өөрийнхөө мессежид мэдэгдэлгүй")
    void screenshotNotifiesSenderOnce() {
        TestUser a = user("dss-a");
        TestUser b = user("dss-b");
        pair(a, b);
        String id = ok(post(a, "kind", "TEXT", "text", "хадгалж болохгүй", "disappearSeconds", 3600), 201)
                .path("id").asText();
        ok(call(a, "POST", "/messages/" + id + "/screenshot"), 204);
        assertThat(screenshotNotices(a)).isZero();

        ok(call(b, "POST", "/messages/" + id + "/screenshot"), 204);
        ok(call(b, "POST", "/messages/" + id + "/screenshot"), 204);
        assertThat(screenshotNotices(a)).isEqualTo(1);
        assertThat(screenshotNotices(b)).isZero();
        assertThat(jdbc.queryForObject("SELECT screenshot_at IS NOT NULL FROM chat_message WHERE id = ?::uuid",
                Boolean.class, id)).isTrue();
    }

    private int screenshotNotices(TestUser u) {
        int n = 0;
        for (JsonNode item : ok(call(u, "GET", "/notifications"), 200).path("items")) {
            if ("SCREENSHOT_TAKEN".equals(item.path("type").asText())) {
                n++;
            }
        }
        return n;
    }
}
