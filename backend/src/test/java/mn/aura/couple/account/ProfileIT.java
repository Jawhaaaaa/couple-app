package mn.aura.couple.account;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpResponse;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import mn.aura.couple.realtime.StompTestClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ProfileIT extends AbstractSpaceIT {

    @Test
    @DisplayName("AC-62 профайлын талбар засахад хамтрагчид profile.updated ирж, бүсийн зөрүүтэй карт")
    void updateNotifiesPartner() throws Exception {
        TestUser a = user("pf-a");
        TestUser b = user("pf-b");
        pair(a, b);
        try (StompTestClient bClient = StompTestClient.connect(port, b.token()).events()) {
            Thread.sleep(300);
            String body = "{\"callName\":\"Ану\",\"timezone\":\"Asia/Tokyo\",\"city\":{\"name\":\"Tokyo\",\"countryCode\":\"JP\","
                    + "\"lat\":35.6895,\"lon\":139.6917,\"timezone\":\"Asia/Tokyo\"},\"version\":" + version(a) + "}";
            JsonNode me = ok(call(a, "PATCH", "/me", body), 200);
            assertThat(me.path("callName").asText()).isEqualTo("Ану");
            assertThat(me.path("timezone").asText()).isEqualTo("Asia/Tokyo");
            assertThat(me.path("city").path("name").asText()).isEqualTo("Tokyo");

            JsonNode event = bClient.next("profile.updated", 5000);
            assertThat(event).isNotNull();
            assertThat(event.path("payload").path("name").asText()).isEqualTo("Ану");
            assertThat(event.path("payload").path("offsetFromMeMinutes").asInt()).isEqualTo(60);
        }
        JsonNode couple = ok(call(b, "GET", "/couple"), 200);
        assertThat(couple.path("partner").path("callName").asText()).isEqualTo("Ану");
        assertThat(couple.path("isLongDistance").asBoolean()).isFalse(); // B хотгүй
    }

    @Test
    @DisplayName("AC-62 хуучин version-ээр засвар → 409 VERSION_CONFLICT + одоогийн хувилбар")
    void versionConflict() {
        TestUser a = user("pfv-a");
        long v = version(a);
        ok(call(a, "PATCH", "/me", "{\"displayName\":\"Бат-Эрдэнэ\",\"version\":" + v + "}"), 200);
        HttpResponse<String> stale = call(a, "PATCH", "/me", "{\"displayName\":\"Өөр\",\"version\":" + v + "}");
        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(code(stale)).isEqualTo("VERSION_CONFLICT");
        assertThat(mn.aura.couple.HttpTestClient.json(stale).path("details").path("currentVersion").asLong()).isEqualTo(v + 1);
        assertThat(ok(call(a, "GET", "/me"), 200).path("displayName").asText()).isEqualTo("Бат-Эрдэнэ");
    }

    @Test
    @DisplayName("AC-04 профайлд 18 нас хүрээгүй төрсөн огноо → AGE_RESTRICTED")
    void ageRestricted() {
        TestUser a = user("pfa-a");
        HttpResponse<String> r = call(a, "PATCH", "/me", "{\"birthDate\":\"2015-01-01\",\"version\":" + version(a) + "}");
        assertThat(r.statusCode()).isEqualTo(400);
        assertThat(code(r)).isEqualTo("AGE_RESTRICTED");
    }

    @Test
    @DisplayName("AC-62 профайлын зураг ≤ 10 MB; том файл → 413, зураг биш → 415, бусдын медиа → 404")
    void avatarRules() {
        TestUser a = user("av-a");
        TestUser c = user("av-c");
        UUID ok = media(a, "IMAGE", 2_000_000);
        UUID big = media(a, "IMAGE", 11 * 1024 * 1024);
        UUID pdf = media(a, "FILE", 1000);
        UUID foreign = media(c, "IMAGE", 1000);
        assertThat(ok(call(a, "PUT", "/me/avatar", body("mediaId", ok.toString())), 200).path("avatar").path("id").asText())
                .isEqualTo(ok.toString());
        assertThat(call(a, "PUT", "/me/avatar", body("mediaId", big.toString())).statusCode()).isEqualTo(413);
        assertThat(call(a, "PUT", "/me/avatar", body("mediaId", pdf.toString())).statusCode()).isEqualTo(415);
        assertThat(call(a, "PUT", "/me/avatar", body("mediaId", foreign.toString())).statusCode()).isEqualTo(404);
    }

    @Test
    @DisplayName("AC-183 AC-217 тохиргооны анхдагч ба хэсэгчилсэн засвар (анимаци OFF)")
    void preferences() {
        TestUser a = user("pref-a");
        JsonNode p = ok(call(a, "GET", "/me/preferences"), 200);
        assertThat(p.path("theme").asText()).isEqualTo("DARK");
        assertThat(p.path("dateFormat").asText()).isEqualTo("YMD_DOT");
        assertThat(p.path("animation").asText()).isEqualTo("ALL");
        assertThat(p.path("haptics").asBoolean()).isTrue();
        assertThat(p.path("sound").asBoolean()).isFalse();
        assertThat(p.path("checkinAutoShare").asBoolean()).isFalse();
        JsonNode changed = ok(call(a, "PATCH", "/me/preferences", body("animation", "OFF", "dateFormat", "DMY_SLASH")), 200);
        assertThat(changed.path("animation").asText()).isEqualTo("OFF");
        assertThat(changed.path("dateFormat").asText()).isEqualTo("DMY_SLASH");
        assertThat(changed.path("theme").asText()).isEqualTo("DARK");
    }

    private long version(TestUser u) {
        return jdbc.queryForObject("SELECT version FROM users WHERE id = ?", Long.class, u.id());
    }

    private UUID media(TestUser u, String kind, long size) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO media (id, space_id, owner_id, kind, mime, size_bytes, s3_key, status) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, 'READY')", id, soloSpace(u), u.id(), kind,
                "IMAGE".equals(kind) ? "image/jpeg" : "application/pdf", size, "spaces/x/" + id + "/original");
        return id;
    }
}
