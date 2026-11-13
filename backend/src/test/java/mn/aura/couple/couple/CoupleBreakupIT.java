package mn.aura.couple.couple;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import mn.aura.couple.couple.app.CouplePurgeJob;
import mn.aura.couple.media.app.MediaStorageService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class CoupleBreakupIT extends AbstractSpaceIT {

    @Autowired
    CouplePurgeJob purge;
    @Autowired
    MediaStorageService storage;

    private String memoryJson(UUID media, String title) {
        return "{\"clientId\":\"" + UUID.randomUUID() + "\",\"title\":\"" + title + "\",\"occurredOn\":\"2026-11-01\","
                + "\"dateSource\":\"MANUAL\",\"locationSource\":\"NONE\",\"tags\":[],\"groupIds\":[],\"media\":[{\"mediaId\":\""
                + media + "\"}]}";
    }

    private UUID image(UUID space, TestUser owner, boolean withObject) {
        UUID id = UUID.randomUUID();
        String key = MediaStorageService.key(space, id, "original");
        jdbc.update("INSERT INTO media (id, space_id, owner_id, kind, mime, size_bytes, s3_key, status) "
                + "VALUES (?, ?, ?, 'IMAGE', 'image/jpeg', 3, ?, 'READY')", id, space, owner.id(), key);
        if (withObject) {
            storage.put(key, new byte[] {1, 2, 3}, "image/jpeg");
        }
        return id;
    }

    @Test
    @DisplayName("AC-185 AC-127 AC-171 давхар баталгаа → BREAKING 14 хоног (зөвхөн харах/экспорт, B-д мэдэгдэл); зөвхөн A сэргээвэл сэргэхгүй, хоёулаа бол бүтэн буцна")
    void breakupAndRestore() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("br-a");
        TestUser b = user("br-b");
        UUID space = pair(a, b);
        ok(call(a, "POST", "/memories", memoryJson(image(space, a, false), "Хамтын дурсамж")), 201);

        assertThat(call(a, "POST", "/couple/breakup", body("password", "буруу-нууц-үг", "confirmStep", 2)).statusCode())
                .isEqualTo(400);
        assertThat(call(a, "POST", "/couple/breakup", body("password", PASSWORD, "confirmStep", 1)).statusCode())
                .isEqualTo(400);
        JsonNode state = ok(call(a, "POST", "/couple/breakup", body("password", PASSWORD, "confirmStep", 2)), 202);
        assertThat(state.path("status").asText()).isEqualTo("BREAKING");
        assertThat(Instant.parse(state.path("restoreDeadline").asText()))
                .isBetween(Instant.parse("2026-11-21T04:00:00Z"), Instant.parse("2026-11-21T04:01:00Z"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification WHERE user_id = ? AND type = 'BREAKUP_STARTED'",
                Integer.class, b.id())).isEqualTo(1);
        assertThat(ok(call(b, "GET", "/couple"), 200).path("breakup").path("status").asText()).isEqualTo("BREAKING");

        // (в) зөвхөн харах/экспорт
        assertThat(code(call(b, "POST", "/memories", memoryJson(image(space, b, false), "Шинэ")))).isEqualTo("SPACE_READ_ONLY");
        assertThat(ok(call(b, "GET", "/memories"), 200).path("items").size()).isEqualTo(1);
        assertThat(call(b, "POST", "/exports", body("kind", "FULL", "locale", "mn")).statusCode()).isEqualTo(202);
        assertThat(code(call(a, "POST", "/couple/breakup", body("password", PASSWORD, "confirmStep", 2))))
                .isEqualTo("SPACE_READ_ONLY");
        // AC-171: хугацаа дотор шинэ урилга тодорхой алдаатай
        assertThat(code(call(a, "POST", "/invites"))).isEqualTo("PAIRING_COOLDOWN");

        // (б) зөвхөн A
        JsonNode onlyA = ok(call(a, "POST", "/couple/restore"), 200);
        assertThat(onlyA.path("status").asText()).isEqualTo("BREAKING");
        assertThat(onlyA.path("myRestoreConfirmed").asBoolean()).isTrue();
        assertThat(onlyA.path("partnerRestoreConfirmed").asBoolean()).isFalse();
        // (а) хоёулаа
        JsonNode both = ok(call(b, "POST", "/couple/restore"), 200);
        assertThat(both.path("status").asText()).isEqualTo("ACTIVE");
        assertThat(ok(call(a, "GET", "/memories"), 200).path("items").size()).isEqualTo(1);
        ok(call(b, "POST", "/memories", memoryJson(image(space, b, false), "Эвлэрсэн өдөр")), 201);
        assertThat(code(call(a, "POST", "/couple/restore"))).isEqualTo("NOT_BREAKING");
    }

    @Test
    @DisplayName("AC-54 AC-171 тасарсанаас 14 хоног өнгөрөхөд устгах job — хосын DB мөр 0, storage-ийн файл 0; дараа нь шинэ урилга болно")
    void purgeAfterWindow() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("pg-a");
        TestUser b = user("pg-b");
        UUID space = pair(a, b);
        UUID media = image(space, a, true);
        String key = MediaStorageService.key(space, media, "original");
        ok(call(a, "POST", "/memories", memoryJson(media, "Устах дурсамж")), 201);
        ok(call(a, "POST", "/messages", body("clientMessageId", UUID.randomUUID().toString(), "kind", "TEXT", "text", "сайн")), 201);
        ok(call(a, "POST", "/couple/breakup", body("password", PASSWORD, "confirmStep", 2)), 202);

        clock.set(Instant.parse("2026-11-21T03:59:00Z"));
        purge.runOnce();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM space WHERE id = ?", Integer.class, space)).isEqualTo(1);

        clock.set(Instant.parse("2026-11-21T04:01:00Z"));
        assertThat(purge.runOnce()).isPositive();
        for (String table : new String[] {"space", "memory", "chat_message", "media", "space_member"}) {
            String col = table.equals("space") ? "id" : "space_id";
            assertThat(jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE " + col + " = ?", Integer.class, space))
                    .as(table).isZero();
        }
        assertThatThrownBy(() -> storage.get(key)).isInstanceOf(RuntimeException.class);

        a = fresh(a);
        assertThat(ok(call(a, "GET", "/couple"), 200).path("kind").asText()).isEqualTo("SOLO");
        assertThat(call(a, "POST", "/invites").statusCode()).isEqualTo(201);
        assertThat(Duration.ofDays(14)).isPositive();
    }
}
