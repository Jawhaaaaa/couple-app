package mn.aura.couple.auth;

import static mn.aura.couple.HttpTestClient.json;
import static mn.aura.couple.HttpTestClient.send;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.http.HttpResponse;
import mn.aura.couple.common.mail.MailMessage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** T-19: имэйл солих (FR-18.4), «Би биш», нууц үг солих. */
@DisplayName("Имэйл ба нууц үг солих — EmailChangeService")
class EmailChangeIT extends AbstractAuthIT {

    private HttpResponse<String> post(String path, String access, String json) {
        return send("POST", url(path), json, "Authorization", "Bearer " + access);
    }

    @Test
    @DisplayName("AC-136 шинэ хаяг баталгаажих хүртэл хуучин идэвхтэй; баталгаажмагц шинээр нэвтэрч, хуучин хаягт «та биш бол» холбоос очно")
    void emailChange() {
        String oldEmail = email("old");
        String newEmail = email("new");
        String access = registerVerified(oldEmail).path("accessToken").asText();

        HttpResponse<String> wrongPw = post("/api/v1/me/email-change", access, body("newEmail", newEmail, "password", "nope-nope"));
        assertThat(wrongPw.statusCode()).isEqualTo(401);
        assertThat(code(wrongPw)).isEqualTo("AUTH_INVALID_CREDENTIALS");

        assertThat(post("/api/v1/me/email-change", access, body("newEmail", newEmail, "password", PASSWORD)).statusCode())
                .isEqualTo(202);
        String code = lastMail(newEmail).code();
        assertThat(code).matches("\\d{6}");

        // Баталгаажаагүй: хуучин хаяг идэвхтэй, шинэ нь нэвтрэхгүй
        assertThat(login(oldEmail, PASSWORD).statusCode()).isEqualTo(200);
        assertThat(login(newEmail, PASSWORD).statusCode()).isEqualTo(401);
        assertThat(json(me(access)).path("email").asText()).isEqualTo(oldEmail);

        String wrong = code.equals("000000") ? "111111" : "000000";
        HttpResponse<String> bad = post("/api/v1/me/email-change/confirm", access, body("code", wrong));
        assertThat(bad.statusCode()).isEqualTo(400);
        assertThat(code(bad)).isEqualTo("CODE_INVALID");
        assertThat(json(bad).path("details").path("attemptsLeft").asInt()).isEqualTo(4);

        HttpResponse<String> ok = post("/api/v1/me/email-change/confirm", access, body("code", code));
        assertThat(ok.statusCode()).as(ok.body()).isEqualTo(200);
        assertThat(json(ok).path("email").asText()).isEqualTo(newEmail);
        assertThat(json(ok).path("emailVerified").asBoolean()).isTrue();
        assertThat(login(newEmail, PASSWORD).statusCode()).isEqualTo(200);
        assertThat(login(oldEmail, PASSWORD).statusCode()).isEqualTo(401);

        MailMessage notice = lastMail(oldEmail);
        assertThat(notice.subject()).contains("имэйл солигдлоо");
        assertThat(notice.link()).startsWith("http://localhost:8090/not-me?token=");
    }

    @Test
    @DisplayName("AC-136 хуучин хаягийн «Би биш» холбоос → бүх session хаагдаж, дараагийн нэвтрэлтэд нууц үг шаардана; нэг удаагийн")
    void notMeLinkRevokesSessions() {
        String oldEmail = email("victim");
        String newEmail = email("attacker");
        JsonNode tokens = registerVerified(oldEmail);
        String access = tokens.path("accessToken").asText();
        assertThat(post("/api/v1/me/email-change", access, body("newEmail", newEmail, "password", PASSWORD)).statusCode())
                .isEqualTo(202);
        assertThat(post("/api/v1/me/email-change/confirm", access, body("code", lastMail(newEmail).code())).statusCode())
                .isEqualTo(200);
        String token = StubOAuthIdp.query(URI.create(lastMail(oldEmail).link())).get("token");

        HttpResponse<String> notMe = send("POST", url("/api/v1/auth/not-me"), body("token", token));
        assertThat(notMe.statusCode()).isEqualTo(204);
        assertThat(code(me(access))).isEqualTo("AUTH_SESSION_REVOKED");
        assertThat(refresh(tokens.path("refreshToken").asText()).statusCode()).isEqualTo(401);
        assertThat(jdbc.queryForObject("SELECT require_password FROM users WHERE email = ?", Boolean.class, newEmail)).isTrue();
        HttpResponse<String> again = send("POST", url("/api/v1/auth/not-me"), body("token", token));
        assertThat(again.statusCode()).isEqualTo(400);
        assertThat(code(again)).isEqualTo("TOKEN_INVALID");
    }

    @Test
    @DisplayName("AC-189 нууц үг солих: FR-1.1 зөрчсөн → 400, буруу одоогийн нууц үг → 401; зөв нь хадгалагдаж шинээр нэвтэрнэ, бусад session хаагдана")
    void passwordChange() {
        String email = email("pwchange");
        JsonNode current = registerVerified(email);
        JsonNode other = loginOk(email, PASSWORD);
        String access = current.path("accessToken").asText();

        HttpResponse<String> weak = post("/api/v1/me/password", access, body("currentPassword", PASSWORD, "newPassword", "1234567"));
        assertThat(weak.statusCode()).isEqualTo(400);
        assertThat(code(weak)).isEqualTo("PASSWORD_WEAK");
        HttpResponse<String> common = post("/api/v1/me/password", access, body("currentPassword", PASSWORD, "newPassword", "password1"));
        assertThat(code(common)).isEqualTo("PASSWORD_COMMON");
        HttpResponse<String> wrong = post("/api/v1/me/password", access, body("currentPassword", "not-it-at-all", "newPassword", "Shine-Nuuts-Ug-42"));
        assertThat(wrong.statusCode()).isEqualTo(401);
        assertThat(code(wrong)).isEqualTo("AUTH_INVALID_CREDENTIALS");

        HttpResponse<String> ok = post("/api/v1/me/password", access, body("currentPassword", PASSWORD, "newPassword", "Shine-Nuuts-Ug-42"));
        assertThat(ok.statusCode()).as(ok.body()).isEqualTo(204);
        assertThat(me(access).statusCode()).isEqualTo(200);
        assertThat(refresh(current.path("refreshToken").asText()).statusCode()).isEqualTo(200);
        assertThat(code(me(other.path("accessToken").asText()))).isEqualTo("AUTH_SESSION_REVOKED");
        assertThat(refresh(other.path("refreshToken").asText()).statusCode()).isEqualTo(401);
        assertThat(login(email, PASSWORD).statusCode()).isEqualTo(401);
        assertThat(login(email, "Shine-Nuuts-Ug-42").statusCode()).isEqualTo(200);
    }
}
