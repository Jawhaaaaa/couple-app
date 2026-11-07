package mn.aura.couple.notification;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class NotificationDispatcherIT extends AbstractSpaceIT {

    private static final java.time.Instant DAYTIME = java.time.Instant.parse("2026-11-07T04:00:00Z");

    @Test
    @DisplayName("AC-68 урилга ашиглагдахад үүсгэгчид «… нэгдэх үү?» апп доторх мэдэгдэл ба push")
    void inviteUsed() throws Exception {
        clock.set(DAYTIME); // «Бүү саад бол» (23:00–07:00 УБ) цонхноос гадуур
        TestUser a = user("nd-a");
        TestUser b = user("nd-b");
        PushTestDevice device = PushTestDevice.create(this::url);
        ok(call(a, "POST", "/push-subscriptions", device.subscriptionJson()), 201);
        String code = ok(call(a, "POST", "/invites"), 201).path("code").asText();
        String pairing = ok(call(b, "POST", "/pairings", body("code", code)), 201).path("id").asText();

        JsonNode page = ok(call(a, "GET", "/notifications"), 200);
        assertThat(page.path("unreadCount").asInt()).isEqualTo(1);
        JsonNode n = page.path("items").path(0);
        assertThat(n.path("type").asText()).isEqualTo("INVITE_USED");
        assertThat(n.path("title").asText() + " " + n.path("body").asText()).contains("Бат");
        assertThat(n.path("deepLink").asText()).isEqualTo("/join-confirm?pairing=" + pairing);
        List<JsonNode> pushes = device.await(1, 5000);
        assertThat(pushes).hasSize(1);
        assertThat(pushes.get(0).path("type").asText()).isEqualTo("INVITE_USED");
    }

    @Test
    @DisplayName("AC-10 хос болохоос өмнө цуцлахад хоёуланд апп доторх мэдэгдэл")
    void pairingCancelledBoth() {
        TestUser a = user("ndc-a");
        TestUser e = user("ndc-e");
        String code = ok(call(a, "POST", "/invites"), 201).path("code").asText();
        String id = ok(call(e, "POST", "/pairings", body("code", code)), 201).path("id").asText();
        ok(call(a, "POST", "/pairings/" + id + "/cancel"), 204);
        assertThat(types(a)).contains("PAIRING_CANCELLED");
        assertThat(types(e)).contains("PAIRING_CANCELLED");
    }

    @Test
    @DisplayName("AC-120 уншаагүй тоо, нэгийг уншсан болгох, бүгдийг уншсан болгох, хуудаслалт")
    void readAndPaging() {
        TestUser a = user("ndr-a");
        TestUser b = user("ndr-b");
        pair(a, b);
        for (String theme : new String[] {"OCEAN", "FOREST", "LAVENDER"}) {
            String id = ok(call(a, "POST", "/couple/theme-proposals", body("theme", theme)), 201).path("id").asText();
            ok(call(b, "POST", "/couple/theme-proposals/" + id + "/decline"), 204);
        }
        JsonNode first = ok(call(b, "GET", "/notifications?limit=2"), 200);
        assertThat(first.path("unreadCount").asInt()).isEqualTo(3);
        assertThat(first.path("items")).hasSize(2);
        String cursor = first.path("nextCursor").asText();
        JsonNode second = ok(call(b, "GET", "/notifications?limit=2&cursor=" + cursor), 200);
        assertThat(second.path("items")).hasSize(1);
        assertThat(second.path("nextCursor").isNull() || second.path("nextCursor").isMissingNode()).isTrue();

        ok(call(b, "POST", "/notifications/" + first.path("items").path(0).path("id").asText() + "/read"), 204);
        assertThat(ok(call(b, "GET", "/notifications"), 200).path("unreadCount").asInt()).isEqualTo(2);
        ok(call(b, "POST", "/notifications/read-all"), 204);
        JsonNode after = ok(call(b, "GET", "/notifications"), 200);
        assertThat(after.path("unreadCount").asInt()).isZero();
        assertThat(after.path("items").path(0).path("readAt").asText()).isNotBlank();
        // Бусдын мэдэгдэлд хүрэхгүй
        assertThat(call(a, "POST", "/notifications/" + first.path("items").path(0).path("id").asText() + "/read")
                .statusCode()).isEqualTo(404);
    }

    @Test
    @DisplayName("AC-119 төрлийг унтраахад push зогсож, апп доторх жагсаалтад бичигдсээр")
    void disabledTypeStillListed() throws Exception {
        clock.set(DAYTIME); // «Бүү саад бол» (23:00–07:00 УБ) цонхноос гадуур
        TestUser a = user("ndt-a");
        TestUser b = user("ndt-b");
        pair(a, b);
        PushTestDevice device = PushTestDevice.create(this::url);
        ok(call(b, "POST", "/push-subscriptions", device.subscriptionJson()), 201);
        JsonNode settings = ok(call(b, "GET", "/notification-settings"), 200);
        assertThat(settings.path("dndStart").asText()).isEqualTo("23:00");
        assertThat(settings.path("dndEnd").asText()).isEqualTo("07:00");
        ok(call(b, "PUT", "/notification-settings", settings.toString().replace("\"disabledTypes\":[]",
                "\"disabledTypes\":[\"THEME_PROPOSED\"]")), 200);

        ok(call(a, "POST", "/couple/theme-proposals", body("theme", "OCEAN")), 201);
        assertThat(types(b)).contains("THEME_PROPOSED");
        Thread.sleep(1000);
        assertThat(device.messages()).isEmpty();
    }

    @Test
    @DisplayName("AC-48 «Бүү саад бол» үед push явахгүй, дуусахад нэгтгэсэн нэг push")
    void dndMerged() throws Exception {
        clock.set(Instant.parse("2026-11-07T15:30:00Z")); // Улаанбаатар 23:30
        TestUser a = user("dnd-a");
        TestUser b = user("dnd-b");
        pair(a, b);
        PushTestDevice device = PushTestDevice.create(this::url);
        ok(call(b, "POST", "/push-subscriptions", device.subscriptionJson()), 201);
        for (String theme : new String[] {"OCEAN", "FOREST"}) {
            String id = ok(call(a, "POST", "/couple/theme-proposals", body("theme", theme)), 201).path("id").asText();
            ok(call(b, "POST", "/couple/theme-proposals/" + id + "/decline"), 204);
        }
        ok(call(a, "POST", "/couple/theme-proposals", body("theme", "LAVENDER")), 201);
        send("POST", "/api/v1/test/jobs/pushOutbox/run");
        assertThat(device.messages()).isEmpty();

        clock.set(Instant.parse("2026-11-07T23:01:00Z")); // 07:01
        send("POST", "/api/v1/test/jobs/pushOutbox/run");
        List<JsonNode> pushes = device.messages();
        assertThat(pushes).hasSize(1);
        assertThat(pushes.get(0).path("type").asText()).isEqualTo("MERGED");
        assertThat(pushes.get(0).path("body").asText()).contains("3");
    }

    @Test
    @DisplayName("AC-49 «Агуулга нуух» үед push payload-д нэр, гарчиг огт байхгүй")
    void hiddenContent() throws Exception {
        clock.set(DAYTIME); // «Бүү саад бол» (23:00–07:00 УБ) цонхноос гадуур
        TestUser a = user("hid-a");
        TestUser b = user("hid-b");
        jdbc.update("UPDATE users SET display_name = 'Анужин' WHERE id = ?", a.id());
        pair(a, b);
        PushTestDevice device = PushTestDevice.create(this::url);
        ok(call(b, "POST", "/push-subscriptions", device.subscriptionJson()), 201);
        JsonNode settings = ok(call(b, "GET", "/notification-settings"), 200);
        ok(call(b, "PUT", "/notification-settings", settings.toString().replace("\"hideContent\":false",
                "\"hideContent\":true")), 200);
        ok(call(a, "POST", "/couple/theme-proposals", body("theme", "OCEAN")), 201);
        List<JsonNode> pushes = device.await(1, 5000);
        assertThat(pushes).hasSize(1);
        assertThat(pushes.get(0).toString()).doesNotContain("Анужин");
        assertThat(pushes.get(0).path("title").asText()).isEqualTo("Aura");
    }

    @Test
    @DisplayName("AC-123 «Түр тайван байх» үед push явахгүй, хамтрагчид мэдэгдэл; хугацаа дуусахад автоматаар унтарна")
    void quietMode() throws Exception {
        clock.set(DAYTIME); // «Бүү саад бол» (23:00–07:00 УБ) цонхноос гадуур
        TestUser a = user("qm-a");
        TestUser b = user("qm-b");
        pair(a, b);
        PushTestDevice device = PushTestDevice.create(this::url);
        ok(call(b, "POST", "/push-subscriptions", device.subscriptionJson()), 201);
        String until = ok(call(b, "PUT", "/me/quiet-mode", "{\"durationMinutes\":1440}"), 200).path("quietUntil").asText();
        assertThat(Instant.parse(until)).isAfter(clock.instant());
        assertThat(types(a)).contains("QUIET_MODE_ON");

        ok(call(a, "POST", "/couple/theme-proposals", body("theme", "OCEAN")), 201);
        assertThat(types(b)).contains("THEME_PROPOSED");
        Thread.sleep(1000);
        assertThat(device.messages()).isEmpty();
    }

    private List<String> types(TestUser u) {
        List<String> out = new java.util.ArrayList<>();
        ok(call(u, "GET", "/notifications"), 200).path("items").forEach(n -> out.add(n.path("type").asText()));
        return out;
    }

    private void send(String method, String path) {
        mn.aura.couple.HttpTestClient.send(method, url(path), null);
    }
}
