package mn.aura.couple.notification;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class WebPushIT extends AbstractSpaceIT {

    private static final java.time.Instant DAYTIME = java.time.Instant.parse("2026-11-07T04:00:00Z");

    @Test
    @DisplayName("AC-154 subscription бүртгэгдэж push (VAPID, aes128gcm) хамтрагчийн endpoint руу явна; 410 → subscription устна")
    void deliverAndCleanup() throws Exception {
        clock.set(DAYTIME); // «Бүү саад бол» (23:00–07:00 УБ) цонхноос гадуур
        TestUser a = user("wp-a");
        TestUser b = user("wp-b");
        pair(a, b);
        assertThat(ok(call(b, "GET", "/push/vapid-public-key"), 200).path("publicKey").asText()).isNotBlank();
        PushTestDevice device = PushTestDevice.create(this::url);
        String subId = ok(call(b, "POST", "/push-subscriptions", device.subscriptionJson()), 201).path("id").asText();

        ok(call(a, "POST", "/couple/theme-proposals", body("theme", "OCEAN")), 201);
        List<JsonNode> got = device.await(1, 5000);
        assertThat(got).hasSize(1);
        assertThat(got.get(0).path("type").asText()).isEqualTo("THEME_PROPOSED");
        assertThat(got.get(0).path("deepLink").asText()).isEqualTo("/settings/couple");
        JsonNode raw = device.rawFirst().path("headers");
        assertThat(raw.path("content-encoding").asText()).isEqualTo("aes128gcm");
        assertThat(raw.path("authorization").asText()).startsWith("vapid t=");

        device.respondWith(410);
        String proposal = ok(call(b, "GET", "/couple"), 200).path("pendingThemeProposal").path("id").asText();
        ok(call(b, "POST", "/couple/theme-proposals/" + proposal + "/decline"), 204);
        // B-д биш A-д явах мэдэгдэл; B-д дахин нэгийг үүсгэнэ
        ok(call(a, "POST", "/couple/theme-proposals", body("theme", "FOREST")), 201);
        device.await(2, 5000);
        long deadline = System.currentTimeMillis() + 5000;
        Integer left = 1;
        while (left > 0 && System.currentTimeMillis() < deadline) {
            Thread.sleep(100);
            left = jdbc.queryForObject("SELECT count(*) FROM push_subscription WHERE id = ?::uuid", Integer.class, subId);
        }
        assertThat(left).isZero();
    }

    @Test
    @DisplayName("AC-154 зөвшөөрөгдөөгүй push endpoint (SSRF) татгалзагдана")
    void endpointAllowlist() {
        TestUser a = user("wpa-a");
        String json = "{\"kind\":\"WEB\",\"endpoint\":\"http://169.254.169.254/latest\",\"keys\":{\"p256dh\":\"x\",\"auth\":\"y\"},"
                + "\"localReminders\":false}";
        assertThat(call(a, "POST", "/push-subscriptions", json).statusCode()).isEqualTo(400);
    }
}
