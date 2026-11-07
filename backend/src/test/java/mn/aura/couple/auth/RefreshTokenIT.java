package mn.aura.couple.auth;

import static mn.aura.couple.HttpTestClient.json;
import static mn.aura.couple.HttpTestClient.send;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** T-18: access JWT, refresh rotation, давхар ашиглалт (DD-AURA-006/007). */
@DisplayName("Токен — JwtService, RefreshTokenService")
class RefreshTokenIT extends AbstractAuthIT {

    @Test
    @DisplayName("AC-168 rotation: refresh бүрд шинэ refresh ба access; access нь HS256, sub/sid/sv claim-тай, 15 мин")
    void rotation() throws Exception {
        String email = email("rotate");
        JsonNode first = registerVerified(email);
        String r1 = first.path("refreshToken").asText();

        HttpResponse<String> rotated = refresh(r1);
        assertThat(rotated.statusCode()).as(rotated.body()).isEqualTo(200);
        String r2 = json(rotated).path("refreshToken").asText();
        assertThat(r2).isNotBlank().isNotEqualTo(r1);
        String access = json(rotated).path("accessToken").asText();
        assertThat(me(access).statusCode()).isEqualTo(200);

        String[] parts = access.split("\\.");
        JsonNode header = MAPPER.readTree(Base64.getUrlDecoder().decode(parts[0]));
        JsonNode claims = MAPPER.readTree(new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8));
        assertThat(header.path("alg").asText()).isEqualTo("HS256");
        assertThat(claims.path("sub").asText()).isEqualTo(userId(email).toString());
        assertThat(claims.has("sid")).isTrue();
        assertThat(claims.path("sv").isInt()).isTrue();
        assertThat(claims.path("exp").asLong() - claims.path("iat").asLong()).isEqualTo(15 * 60);
        // Refresh нь DB-д зөвхөн SHA-256 hash
        assertThat(jdbc.queryForObject("SELECT count(*) FROM refresh_token WHERE token_hash = ?", Integer.class, r2)).isZero();
    }

    @Test
    @DisplayName("AC-07 rotate хийгдсэн R1-ийг дахин ашиглавал 401 AUTH_SESSION_REVOKED; хэрэглэгчийн бүх session (R2 ба өөр төхөөрөмж) хүчингүй")
    void reuseRevokesAllSessions() {
        String email = email("reuse");
        JsonNode phone = registerVerified(email);
        JsonNode laptop = loginOk(email, PASSWORD);
        String r1 = phone.path("refreshToken").asText();
        HttpResponse<String> rotated = refresh(r1);
        String r2 = json(rotated).path("refreshToken").asText();
        String access2 = json(rotated).path("accessToken").asText();
        int svBefore = jdbc.queryForObject("SELECT session_version FROM users WHERE email = ?", Integer.class, email);

        HttpResponse<String> reuse = refresh(r1);
        assertThat(reuse.statusCode()).isEqualTo(401);
        assertThat(code(reuse)).isEqualTo("AUTH_SESSION_REVOKED");

        assertThat(code(refresh(r2))).isEqualTo("AUTH_SESSION_REVOKED");
        assertThat(code(refresh(laptop.path("refreshToken").asText()))).isEqualTo("AUTH_SESSION_REVOKED");
        HttpResponse<String> meAfter = me(access2);
        assertThat(meAfter.statusCode()).isEqualTo(401);
        assertThat(code(meAfter)).isEqualTo("AUTH_SESSION_REVOKED");
        assertThat(me(laptop.path("accessToken").asText()).statusCode()).isEqualTo(401);

        List<String> reasons = jdbc.queryForList(
                "SELECT revoked_reason FROM device_session WHERE user_id = ?", String.class, userId(email));
        assertThat(reasons).hasSize(2).containsOnly("REUSE");
        assertThat(jdbc.queryForObject("SELECT session_version FROM users WHERE email = ?", Integer.class, email))
                .isGreaterThan(svBefore);
        // Шинэ нэвтрэлт хэвийн
        assertThat(me(loginOk(email, PASSWORD).path("accessToken").asText()).statusCode()).isEqualTo(200);
    }

    @Test
    @DisplayName("AC-168 access 15 мин 1 с-ийн дараа 401 TOKEN_EXPIRED; refresh 30 хоног 1 с-ийн дараа 401 TOKEN_EXPIRED")
    void expiry() {
        JsonNode tokens = registerVerified(email("expiry"));
        String access = tokens.path("accessToken").asText();
        advance(Duration.ofMinutes(14).plusSeconds(50));
        assertThat(me(access).statusCode()).isEqualTo(200);
        advance(Duration.ofSeconds(11));
        HttpResponse<String> expired = me(access);
        assertThat(expired.statusCode()).isEqualTo(401);
        assertThat(code(expired)).isEqualTo("TOKEN_EXPIRED");

        // Чимээгүй сэргээлт: refresh ажиллана
        HttpResponse<String> renewed = refresh(tokens.path("refreshToken").asText());
        assertThat(renewed.statusCode()).isEqualTo(200);
        String r2 = json(renewed).path("refreshToken").asText();

        advance(Duration.ofDays(30).plusSeconds(1));
        HttpResponse<String> old = refresh(r2);
        assertThat(old.statusCode()).isEqualTo(401);
        assertThat(code(old)).isEqualTo("TOKEN_EXPIRED");
    }

    @Test
    @DisplayName("AC-168 web: refresh зөвхөн HttpOnly aura_rt cookie (SameSite=Strict, Path=/api/v1/auth, Secure), биед байхгүй; X-Aura-Client-гүй cookie → 401")
    void webCookie() {
        String email = email("web");
        registerVerified(email);
        HttpResponse<String> login = login(email, PASSWORD, "X-Aura-Client", "web");
        assertThat(login.statusCode()).isEqualTo(200);
        assertThat(json(login).has("refreshToken")).isFalse();
        String setCookie = login.headers().firstValue("Set-Cookie").orElseThrow();
        assertThat(setCookie).startsWith("aura_rt=").contains("HttpOnly").contains("SameSite=Strict")
                .contains("Path=/api/v1/auth").contains("Secure").contains("Max-Age=2592000");
        String cookie = setCookie.substring(0, setCookie.indexOf(';'));

        HttpResponse<String> noHeader = send("POST", url("/api/v1/auth/refresh"), null, "Cookie", cookie);
        assertThat(noHeader.statusCode()).isEqualTo(401);
        assertThat(code(noHeader)).isEqualTo("TOKEN_INVALID");

        HttpResponse<String> ok = send("POST", url("/api/v1/auth/refresh"), null, "Cookie", cookie, "X-Aura-Client", "web",
                "Authorization", "Bearer expired.or.stale");
        assertThat(ok.statusCode()).as(ok.body()).isEqualTo(200);
        assertThat(json(ok).has("refreshToken")).isFalse();
        String next = ok.headers().firstValue("Set-Cookie").orElseThrow();
        assertThat(next.substring(0, next.indexOf(';'))).isNotEqualTo(cookie);

        String access = json(ok).path("accessToken").asText();
        HttpResponse<String> logout = send("POST", url("/api/v1/auth/logout"), null, "Authorization", "Bearer " + access);
        assertThat(logout.statusCode()).isEqualTo(204);
        assertThat(logout.headers().firstValue("Set-Cookie").orElseThrow()).contains("aura_rt=").contains("Max-Age=0");
        assertThat(me(access).statusCode()).isEqualTo(401);
        HttpResponse<String> afterLogout = send("POST", url("/api/v1/auth/refresh"), null,
                "Cookie", next.substring(0, next.indexOf(';')), "X-Aura-Client", "web");
        assertThat(code(afterLogout)).isEqualTo("AUTH_SESSION_REVOKED");
    }

    @Test
    @DisplayName("AC-168 гарын үсэг өөрчилсөн/буруу access → 401 TOKEN_INVALID; токенгүй хамгаалагдсан endpoint → 401")
    void tamperedToken() {
        String access = registerVerified(email("tamper")).path("accessToken").asText();
        String tampered = access.substring(0, access.length() - 2) + (access.endsWith("AA") ? "BB" : "AA");
        HttpResponse<String> r = me(tampered);
        assertThat(r.statusCode()).isEqualTo(401);
        assertThat(code(r)).isEqualTo("TOKEN_INVALID");
        assertThat(send("GET", url("/api/v1/me"), null).statusCode()).isEqualTo(401);
        assertThat(code(refresh("not-a-token-" + UUID.randomUUID()))).isEqualTo("TOKEN_INVALID");
    }

    @Test
    @DisplayName("AC-56 GET /me/sessions — идэвхтэй session-ууд, одоогийнх current=true; нэгийг хаахад түүний access 401")
    void sessionsList() {
        String email = email("sessions");
        JsonNode a = registerVerified(email);
        JsonNode b = loginOk(email, PASSWORD);
        HttpResponse<String> list = send("GET", url("/api/v1/me/sessions"), null,
                "Authorization", "Bearer " + a.path("accessToken").asText());
        assertThat(list.statusCode()).isEqualTo(200);
        assertThat(json(list)).hasSize(2);
        String other = null;
        for (JsonNode s : json(list)) {
            if (!s.path("current").asBoolean()) {
                other = s.path("id").asText();
                assertThat(s.path("platform").asText()).isEqualTo("ANDROID");
            }
        }
        assertThat(send("DELETE", url("/api/v1/me/sessions/" + other), null,
                "Authorization", "Bearer " + a.path("accessToken").asText()).statusCode()).isEqualTo(204);
        assertThat(code(me(b.path("accessToken").asText()))).isEqualTo("AUTH_SESSION_REVOKED");
        assertThat(me(a.path("accessToken").asText()).statusCode()).isEqualTo(200);
    }
}
