package mn.aura.couple.auth;

import static mn.aura.couple.HttpTestClient.send;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.http.HttpResponse;
import java.time.Duration;
import mn.aura.couple.common.mail.MailMessage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** T-19: нууц үг сэргээх (FR-1.3). */
@DisplayName("Нууц үг сэргээх — PasswordResetService")
class PasswordResetIT extends AbstractAuthIT {

    private String requestLink(String email) {
        assertThat(send("POST", url("/api/v1/auth/password-reset/request"), body("email", email)).statusCode()).isEqualTo(202);
        MailMessage mail = lastMail(email);
        assertThat(mail.link()).startsWith("http://localhost:8090/reset-password?token=");
        return StubOAuthIdp.query(URI.create(mail.link())).get("token");
    }

    private HttpResponse<String> confirm(String token, String password) {
        return send("POST", url("/api/v1/auth/password-reset/confirm"), body("token", token, "newPassword", password));
    }

    @Test
    @DisplayName("AC-03 сэргээсний дараа хуучин refresh R1 → 401; хуучин access ч 401; шинэ нууц үгээр нэвтэрнэ")
    void resetRevokesSessions() {
        String email = email("reset");
        JsonNode a = registerVerified(email);
        JsonNode b = loginOk(email, PASSWORD);
        String token = requestLink(email);

        HttpResponse<String> ok = confirm(token, "Shine-Nuuts-Ug-42");
        assertThat(ok.statusCode()).as(ok.body()).isEqualTo(204);

        HttpResponse<String> r1 = refresh(a.path("refreshToken").asText());
        assertThat(r1.statusCode()).isEqualTo(401);
        assertThat(code(refresh(b.path("refreshToken").asText()))).isEqualTo("AUTH_SESSION_REVOKED");
        assertThat(me(a.path("accessToken").asText()).statusCode()).isEqualTo(401);
        assertThat(login(email, PASSWORD).statusCode()).isEqualTo(401);
        assertThat(login(email, "Shine-Nuuts-Ug-42").statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForList("SELECT DISTINCT revoked_reason FROM device_session WHERE user_id = ? AND revoked_at IS NOT NULL",
                String.class, userId(email))).containsExactly("PASSWORD_RESET");
    }

    @Test
    @DisplayName("AC-166 31 минутын дараах холбоос 410 TOKEN_EXPIRED; шинэ холбоосын хоёр дахь ашиглалт 400 TOKEN_INVALID")
    void oneTimeAndExpiring() {
        String email = email("reset-once");
        registerVerified(email);
        String old = requestLink(email);
        advance(Duration.ofMinutes(31));
        HttpResponse<String> expired = confirm(old, "Shine-Nuuts-Ug-42");
        assertThat(expired.statusCode()).isEqualTo(410);
        assertThat(code(expired)).isEqualTo("TOKEN_EXPIRED");

        String fresh = requestLink(email);
        assertThat(confirm(fresh, "Shine-Nuuts-Ug-42").statusCode()).isEqualTo(204);
        HttpResponse<String> second = confirm(fresh, "Busad-Nuuts-Ug-43");
        assertThat(second.statusCode()).isEqualTo(400);
        assertThat(code(second)).isEqualTo("TOKEN_INVALID");
        assertThat(login(email, "Shine-Nuuts-Ug-42").statusCode()).isEqualTo(200);
    }

    @Test
    @DisplayName("AC-166 сул шинэ нууц үг → 400 PASSWORD_WEAK/COMMON (холбоос хэвээр); бүртгэлгүй имэйлд ч 202, имэйл илгээхгүй")
    void validation() {
        String email = email("reset-weak");
        registerVerified(email);
        String token = requestLink(email);
        HttpResponse<String> weak = confirm(token, "short");
        assertThat(weak.statusCode()).isEqualTo(400);
        assertThat(code(weak)).isEqualTo("PASSWORD_WEAK");
        assertThat(code(confirm(token, "iloveyou123"))).isEqualTo("PASSWORD_COMMON");
        assertThat(confirm(token, "Shine-Nuuts-Ug-42").statusCode()).isEqualTo(204);

        String ghost = email("ghost");
        assertThat(send("POST", url("/api/v1/auth/password-reset/request"), body("email", ghost)).statusCode()).isEqualTo(202);
        assertThat(mails.last(ghost)).isEmpty();
        assertThat(code(confirm("x".repeat(43), "Shine-Nuuts-Ug-42"))).isEqualTo("TOKEN_INVALID");
    }
}
