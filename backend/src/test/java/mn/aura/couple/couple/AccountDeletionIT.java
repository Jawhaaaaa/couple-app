package mn.aura.couple.couple;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import mn.aura.couple.couple.app.CouplePurgeJob;
import mn.aura.couple.media.app.MediaStorageService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class AccountDeletionIT extends AbstractSpaceIT {

    @Autowired
    CouplePurgeJob purge;
    @Autowired
    MediaStorageService storage;

    private UUID memory(UUID space, TestUser author, String title, boolean withObject) {
        UUID media = UUID.randomUUID();
        String key = MediaStorageService.key(space, media, "original");
        jdbc.update("INSERT INTO media (id, space_id, owner_id, kind, mime, size_bytes, s3_key, status) "
                + "VALUES (?, ?, ?, 'IMAGE', 'image/jpeg', 3, ?, 'READY')", media, space, author.id(), key);
        if (withObject) {
            storage.put(key, new byte[] {1, 2, 3}, "image/jpeg");
        }
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO memory (id, space_id, author_id, client_id, title, occurred_on) VALUES (?, ?, ?, ?, ?, '2026-10-01')",
                id, space, author.id(), UUID.randomUUID(), title);
        jdbc.update("INSERT INTO memory_media (memory_id, media_id, position) VALUES (?, ?, 0)", id, media);
        return media;
    }

    @Test
    @DisplayName("AC-128 GAP-14 A акаунтаа устгахад: хувийн өгөгдөл шууд устна, B-д мэдэгдэл, B 30 хоног харах/экспорт; дараа нь хосын өгөгдөл устна")
    void deleteAccount() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("del-a");
        TestUser b = user("del-b");
        UUID solo = soloSpace(a);
        UUID couple = pair(a, b);
        UUID soloMedia = memory(solo, a, "Ганцаараа үеийн хувийн", true);
        String soloKey = MediaStorageService.key(solo, soloMedia, "original");
        memory(couple, a, "Хамтын дурсамж", false);
        jdbc.update("INSERT INTO check_in (id, user_id, space_id, local_date, level, note) VALUES (?, ?, ?, '2026-11-07', 2, 'х')",
                UUID.randomUUID(), a.id(), couple);
        jdbc.update("INSERT INTO gift_idea (id, space_id, owner_id, occasion_key, text) VALUES (?, ?, ?, 'birthday:b', 'Нууц бэлэг')",
                UUID.randomUUID(), couple, a.id());

        assertThat(code(call(a, "POST", "/me/deletion", body("password", "буруу-нууц-үг-123", "confirmPhrase", "УСТГАХ"))))
                .isEqualTo("AUTH_INVALID_CREDENTIALS");
        assertThat(call(a, "POST", "/me/deletion", body("password", PASSWORD, "confirmPhrase", "тийм")).statusCode())
                .isEqualTo(400);
        JsonNode result = ok(call(a, "POST", "/me/deletion", body("password", PASSWORD, "confirmPhrase", "УСТГАХ")), 202);
        assertThat(Instant.parse(result.path("partnerExportUntil").asText()))
                .isBetween(Instant.parse("2026-12-07T04:00:00Z"), Instant.parse("2026-12-07T04:01:00Z"));

        // A: нэвтрэх боломжгүй, хувийн өгөгдөл шууд устсан
        assertThat(call(a, "GET", "/me").statusCode()).isEqualTo(401);
        assertThat(login(a.email(), PASSWORD).statusCode()).isEqualTo(401);
        var row = jdbc.queryForMap("SELECT email::text AS email, display_name, birth_date, password_hash, status FROM users WHERE id = ?",
                a.id());
        assertThat(row.get("status")).isEqualTo("DELETED");
        assertThat((String) row.get("email")).doesNotContain("del-a");
        assertThat(row.get("display_name")).isNull();
        assertThat(row.get("birth_date")).isNull();
        assertThat(row.get("password_hash")).isNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM space WHERE id = ?", Integer.class, solo)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM memory WHERE space_id = ?", Integer.class, solo)).isZero();
        assertThatThrownBy(() -> storage.get(soloKey)).isInstanceOf(RuntimeException.class);
        for (String table : new String[] {"device_session", "check_in", "notification_setting", "user_preference"}) {
            assertThat(jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE user_id = ?", Integer.class, a.id()))
                    .as(table).isZero();
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM gift_idea WHERE owner_id = ?", Integer.class, a.id())).isZero();

        // B: мэдэгдэл, 30 хоног зөвхөн харах/экспорт (хамтын агуулга, A-гийнхыг оруулаад)
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification WHERE user_id = ? AND type = 'PARTNER_DELETED'",
                Integer.class, b.id())).isEqualTo(1);
        JsonNode coupleView = ok(call(b, "GET", "/couple"), 200);
        assertThat(coupleView.path("breakup").path("status").asText()).isEqualTo("ORPHANED");
        assertThat(ok(call(b, "GET", "/memories"), 200).path("items").size()).isEqualTo(1);
        assertThat(code(call(b, "POST", "/messages", body("clientMessageId", UUID.randomUUID().toString(), "kind", "TEXT",
                "text", "сайн уу")))).isEqualTo("SPACE_READ_ONLY");
        assertThat(call(b, "POST", "/exports", body("kind", "FULL", "locale", "mn")).statusCode()).isEqualTo(202);
        assertThat(code(call(b, "POST", "/couple/restore"))).isEqualTo("NOT_BREAKING");

        // 30 хоногийн дараа хосын өгөгдөл устна
        clock.set(Instant.parse("2026-12-07T04:05:00Z"));
        purge.runOnce();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM space WHERE id = ?", Integer.class, couple)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM memory WHERE space_id = ?", Integer.class, couple)).isZero();
        b = fresh(b);
        assertThat(ok(call(b, "GET", "/couple"), 200).path("kind").asText()).isEqualTo("SOLO");
    }
}
