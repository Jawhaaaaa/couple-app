package mn.aura.couple.auth;

import static mn.aura.couple.HttpTestClient.send;
import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.AbstractIntegrationTest;
import mn.aura.couple.api.model.Locale;
import mn.aura.couple.api.model.LoginRequest;
import mn.aura.couple.api.model.RegisterRequest;
import mn.aura.couple.api.model.TokenResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.test.context.TestPropertySource;

/**
 * INV-11, AC-196: гэрээнээс үүссэн DTO-ийн `toString()` нууц үг/код/токеныг бичдэг байсан —
 * Spring MVC-ийн DEBUG лог асаалттай ч бүртгэл/нэвтрэлтийн нууц үг логт гарахгүй.
 */
@ExtendWith(OutputCaptureExtension.class)
@TestPropertySource(properties = {
        "logging.level.org.springframework.web=DEBUG",
        "logging.level.org.springframework.web.servlet.mvc.method.annotation=DEBUG",
        "logging.level.org.springframework.security=DEBUG"
})
@DisplayName("Auth — логийн нууцлал")
class AuthLogRedactionIT extends AbstractIntegrationTest {

    @Test
    @DisplayName("AC-196 бүртгэлийн хүсэлтийн нууц үг DEBUG логт ч 0 удаа (DTO-ийн toString далдлагдсан)")
    void registerPasswordNeverLogged(CapturedOutput output) throws Exception {
        String secret = "Nuuts-" + UUID.randomUUID().toString().substring(0, 12);
        String body = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(Map.of(
                "email", "log-" + UUID.randomUUID().toString().substring(0, 8) + "@aura.test",
                "password", secret, "displayName", "Бат", "birthDate", "1995-05-14", "locale", "mn",
                "timezone", "Asia/Ulaanbaatar", "acceptedPolicyVersion", "2026-11-07"));
        HttpResponse<String> r = send("POST", url("/api/v1/auth/register"), body);
        assertThat(r.statusCode()).isEqualTo(202);
        HttpResponse<String> login = send("POST", url("/api/v1/auth/login"), body.replace("\"displayName\"", "\"x\""));
        assertThat(login.statusCode()).isIn(400, 401, 403);

        String logs = output.getAll();
        assertThat(logs).contains("RegisterRequest");
        assertThat(logs).doesNotContain(secret);
    }

    @Test
    @DisplayName("AC-196 үүсгэсэн DTO-ийн toString нь password/token-ийг *** болгоно")
    void generatedToStringMasksSecrets() {
        RegisterRequest req = new RegisterRequest("a@aura.test", "Super-Secret-1", "Бат", LocalDate.of(1995, 5, 14),
                Locale.MN, "Asia/Ulaanbaatar", "2026-11-07");
        assertThat(req.toString()).doesNotContain("Super-Secret-1").contains("password: ***").contains("a@aura.test");
        LoginRequest login = new LoginRequest().email("a@aura.test").password("Super-Secret-1");
        assertThat(login.toString()).doesNotContain("Super-Secret-1");
        TokenResponse tokens = new TokenResponse().accessToken("eyJ.secret.jwt").refreshToken("rt-secret");
        assertThat(tokens.toString()).doesNotContain("eyJ.secret.jwt").doesNotContain("rt-secret");
    }
}
