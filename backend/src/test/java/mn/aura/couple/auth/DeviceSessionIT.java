package mn.aura.couple.auth;

import static mn.aura.couple.HttpTestClient.json;
import static mn.aura.couple.HttpTestClient.send;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpResponse;
import mn.aura.couple.realtime.StompTestClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** T-71: төхөөрөмжийн session — алсаас гаргах, бүгдээс гарах, алсаас түгжих (GAP-24). */
class DeviceSessionIT extends AbstractAuthIT {

    private HttpResponse<String> authed(String method, String path, String access, String body) {
        return send(method, url("/api/v1" + path), body, "Authorization", "Bearer " + access);
    }

    private String sessionIdOf(String access, boolean current) {
        for (JsonNode s : json(authed("GET", "/me/sessions", access, null))) {
            if (s.path("current").asBoolean() == current) {
                return s.path("id").asText();
            }
        }
        return null;
    }

    @Test
    @DisplayName("AC-56 нэг төхөөрөмжийг алсаас гаргахад тэр төхөөрөмжид session.revoked, дараагийн хүсэлт 401; жагсаалтад сүүлд ашигласан цаг")
    void revokeOneNotifies() throws Exception {
        String email = email("dsr");
        JsonNode phone = registerVerified(email);
        JsonNode laptop = loginOk(email, PASSWORD);
        String laptopAccess = laptop.path("accessToken").asText();
        String phoneAccess = phone.path("accessToken").asText();
        JsonNode list = json(authed("GET", "/me/sessions", phoneAccess, null));
        assertThat(list).hasSize(2);
        list.forEach(s -> assertThat(s.path("lastUsedAt").asText()).isNotBlank());
        String laptopSession = sessionIdOf(laptopAccess, true);

        try (StompTestClient ws = StompTestClient.connect(port, laptopAccess).events()) {
            Thread.sleep(300);
            assertThat(authed("DELETE", "/me/sessions/" + laptopSession, phoneAccess, null).statusCode()).isEqualTo(204);
            assertThat(ws.next("session.revoked", 3000).path("payload").path("sessionId").asText()).isEqualTo(laptopSession);
        }
        assertThat(code(me(laptopAccess))).isEqualTo("AUTH_SESSION_REVOKED");
        assertThat(refresh(laptop.path("refreshToken").asText()).statusCode()).isEqualTo(401);
        assertThat(me(phoneAccess).statusCode()).isEqualTo(200);
    }

    @Test
    @DisplayName("AC-125 «Бүх төхөөрөмжөөс гарах»: бүх refresh token хүчингүй, хоёр төхөөрөмжийн дараагийн хүсэлт 401")
    void revokeAll() {
        String email = email("dsa");
        JsonNode one = registerVerified(email);
        JsonNode two = loginOk(email, PASSWORD);
        assertThat(authed("POST", "/me/sessions/revoke-all", one.path("accessToken").asText(),
                body("requirePassword", false)).statusCode()).isEqualTo(204);
        assertThat(me(one.path("accessToken").asText()).statusCode()).isEqualTo(401);
        assertThat(me(two.path("accessToken").asText()).statusCode()).isEqualTo(401);
        assertThat(refresh(one.path("refreshToken").asText()).statusCode()).isEqualTo(401);
        assertThat(refresh(two.path("refreshToken").asText()).statusCode()).isEqualTo(401);
        assertThat(jdbc.queryForObject("SELECT require_password FROM users WHERE id = ?", Boolean.class, userId(email))).isFalse();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM device_session WHERE user_id = ? AND revoked_at IS NULL",
                Integer.class, userId(email))).isZero();
        // Дахин нэвтэрч болно
        assertThat(me(loginOk(email, PASSWORD).path("accessToken").asText()).statusCode()).isEqualTo(200);
    }

    @Test
    @DisplayName("AC-187 GAP-24 алсаас түгжих: бүх session хаагдаж, дараагийн нэвтрэлтэд нууц үг шаардана (нууц үгээр нэвтэрмэгц арилна)")
    void remoteLock() {
        String email = email("dsl");
        JsonNode one = registerVerified(email);
        JsonNode two = loginOk(email, PASSWORD);
        assertThat(authed("POST", "/me/sessions/revoke-all", two.path("accessToken").asText(),
                body("requirePassword", true)).statusCode()).isEqualTo(204);
        assertThat(me(one.path("accessToken").asText()).statusCode()).isEqualTo(401);
        assertThat(refresh(two.path("refreshToken").asText()).statusCode()).isEqualTo(401);
        assertThat(jdbc.queryForObject("SELECT require_password FROM users WHERE id = ?", Boolean.class, userId(email))).isTrue();
        loginOk(email, PASSWORD);
        assertThat(jdbc.queryForObject("SELECT require_password FROM users WHERE id = ?", Boolean.class, userId(email))).isFalse();
    }
}
