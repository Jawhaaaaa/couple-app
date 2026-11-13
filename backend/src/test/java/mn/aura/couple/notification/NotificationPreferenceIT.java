package mn.aura.couple.notification;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** T-67: мэдэгдлийн тохиргоо — «Бүү саад бол» хүлээн авагчийн бүсээр, нуух, төрөл унтраах, тайван горим. */
class NotificationPreferenceIT extends AbstractSpaceIT {

    private List<String> types(TestUser u) {
        List<String> out = new ArrayList<>();
        ok(call(u, "GET", "/notifications"), 200).path("items").forEach(n -> out.add(n.path("type").asText()));
        return out;
    }

    private void runPush() {
        mn.aura.couple.HttpTestClient.send("POST", url("/api/v1/test/jobs/pushOutbox/run"), null);
    }

    private JsonNode message(TestUser u, String text) {
        return ok(call(u, "POST", "/messages", body("clientMessageId", UUID.randomUUID().toString(), "kind", "TEXT",
                "text", text)), 201);
    }

    @Test
    @DisplayName("AC-48 AC-184 B (Токио) 23:00–07:00: 23:30-д 2 мессеж, 1 зүрх → push 0; Токиогийн 07:00-д нэгтгэсэн нэг push; жагсаалтад 3")
    void dndInRecipientZone() throws Exception {
        clock.set(Instant.parse("2026-11-07T14:30:00Z")); // Токио 23:30, Улаанбаатар 22:30
        TestUser a = user("dndt-a");
        TestUser b = user("dndt-b");
        jdbc.update("UPDATE users SET timezone = 'Asia/Tokyo' WHERE id = ?", b.id());
        pair(a, b);
        PushTestDevice device = PushTestDevice.create(this::url);
        ok(call(b, "POST", "/push-subscriptions", device.subscriptionJson()), 201);
        JsonNode settings = ok(call(b, "GET", "/notification-settings"), 200);
        assertThat(settings.path("dndStart").asText()).isEqualTo("23:00");
        assertThat(settings.path("dndEnd").asText()).isEqualTo("07:00");

        message(a, "Сайн уу");
        message(a, "Унтсан уу");
        ok(call(a, "POST", "/signals", body("kind", "HEART", "clientId", UUID.randomUUID().toString())), 201);
        runPush();
        Thread.sleep(500);
        assertThat(device.messages()).isEmpty();
        assertThat(types(b)).containsOnly("MESSAGE_NEW", "HEART_RECEIVED").hasSize(3);

        clock.set(Instant.parse("2026-11-07T21:59:00Z")); // Токио 06:59
        runPush();
        assertThat(device.messages()).isEmpty();
        clock.set(Instant.parse("2026-11-07T22:00:30Z")); // Токио 07:00:30
        runPush();
        List<JsonNode> pushes = device.await(1, 5000);
        assertThat(pushes).hasSize(1);
        assertThat(pushes.get(0).path("type").asText()).isEqualTo("MERGED");
        assertThat(pushes.get(0).path("body").asText()).contains("3");
    }

    @Test
    @DisplayName("AC-49 «Агуулга нуух» үед мессежийн push payload-д текст, нэр огт байхгүй — «Шинэ мессеж» л")
    void hiddenMessage() throws Exception {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("hidm-a");
        TestUser b = user("hidm-b");
        jdbc.update("UPDATE users SET display_name = 'Тэмүүлэн' WHERE id = ?", a.id());
        pair(a, b);
        PushTestDevice device = PushTestDevice.create(this::url);
        ok(call(b, "POST", "/push-subscriptions", device.subscriptionJson()), 201);
        JsonNode settings = ok(call(b, "GET", "/notification-settings"), 200);
        ok(call(b, "PUT", "/notification-settings", settings.toString().replace("\"hideContent\":false",
                "\"hideContent\":true")), 200);
        message(a, "Нууц төлөвлөгөө: бөгж");
        List<JsonNode> pushes = device.await(1, 5000);
        assertThat(pushes).hasSize(1);
        String raw = pushes.get(0).toString();
        assertThat(raw).doesNotContain("бөгж").doesNotContain("Тэмүүлэн");
        assertThat(pushes.get(0).path("body").asText()).isEqualTo("Шинэ мессеж");
    }

    @Test
    @DisplayName("AC-119 «Дурсамж» push унтраасан: дурсамжийнх 0, мессежийнх ирнэ; апп доторх жагсаалтад хоёулаа")
    void memoryPushOff() throws Exception {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("mpo-a");
        TestUser b = user("mpo-b");
        UUID space = pair(a, b);
        PushTestDevice device = PushTestDevice.create(this::url);
        ok(call(b, "POST", "/push-subscriptions", device.subscriptionJson()), 201);
        JsonNode settings = ok(call(b, "GET", "/notification-settings"), 200);
        ok(call(b, "PUT", "/notification-settings", settings.toString().replace("\"disabledTypes\":[]",
                "\"disabledTypes\":[\"MEMORY_CREATED\"]")), 200);
        UUID media = UUID.randomUUID();
        jdbc.update("INSERT INTO media (id, space_id, owner_id, kind, mime, size_bytes, s3_key, status) "
                + "VALUES (?, ?, ?, 'IMAGE', 'image/jpeg', 1000, ?, 'READY')", media, space, a.id(), "k/" + media);
        ok(call(a, "POST", "/memories", "{\"clientId\":\"" + UUID.randomUUID() + "\",\"title\":\"Алхалт\","
                + "\"occurredOn\":\"2026-11-07\",\"dateSource\":\"MANUAL\",\"locationSource\":\"NONE\",\"tags\":[],"
                + "\"groupIds\":[],\"media\":[{\"mediaId\":\"" + media + "\"}]}"), 201);
        message(a, "Сайхан байлаа");
        List<JsonNode> pushes = device.await(1, 5000);
        Thread.sleep(500);
        pushes = device.messages();
        assertThat(pushes).extracting(p -> p.path("type").asText()).containsExactly("MESSAGE_NEW");
        assertThat(types(b)).contains("MEMORY_CREATED", "MESSAGE_NEW");
    }

    @Test
    @DisplayName("AC-123 тайван горим 24 цаг: push 0, хамтрагчид 🌙 тэмдэг (quietUntil); 24 цагийн дараа автоматаар унтарч push сэргэнэ")
    void quietExpires() throws Exception {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("qe-a");
        TestUser b = user("qe-b");
        pair(a, b);
        PushTestDevice device = PushTestDevice.create(this::url);
        ok(call(a, "POST", "/push-subscriptions", device.subscriptionJson()), 201);
        ok(call(a, "PUT", "/me/quiet-mode", "{\"durationMinutes\":1440}"), 200);
        JsonNode dash = ok(call(b, "GET", "/dashboard"), 200);
        assertThat(Instant.parse(dash.path("partner").path("quietUntil").asText()))
                .isBetween(Instant.parse("2026-11-08T04:00:00Z"), Instant.parse("2026-11-08T04:00:30Z"));
        message(b, "Сайн уу");
        Thread.sleep(800);
        assertThat(device.messages()).isEmpty();
        assertThat(types(a)).contains("MESSAGE_NEW");

        clock.set(Instant.parse("2026-11-08T04:01:00Z"));
        a = fresh(a);
        b = fresh(b);
        assertThat(ok(call(b, "GET", "/dashboard"), 200).path("partner").path("quietUntil").isMissingNode()).isTrue();
        message(b, "Буцаад ирэв үү");
        assertThat(device.await(1, 5000)).hasSize(1);
    }
}
