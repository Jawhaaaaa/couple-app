package mn.aura.couple.auth;

import static mn.aura.couple.HttpTestClient.json;
import static mn.aura.couple.HttpTestClient.send;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import mn.aura.couple.HttpTestClient;
import mn.aura.couple.auth.app.EmailVerificationService;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** T-17: имэйл баталгаажуулалт (FR-1.2). */
@DisplayName("Имэйл баталгаажуулалт — EmailVerificationService")
class EmailVerificationIT extends AbstractAuthIT {

    @Autowired
    EmailVerificationService verification;

    private static String mailpitText(String to) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 15_000;
        while (System.currentTimeMillis() < deadline) {
            HttpResponse<String> search = send("GET", mailpitApi() + "/api/v1/search?query="
                    + java.net.URLEncoder.encode("to:\"" + to + "\"", java.nio.charset.StandardCharsets.UTF_8) + "&limit=5", null);
            if (search.statusCode() == 200) {
                JsonNode messages = json(search).path("messages");
                if (messages.size() > 0) {
                    HttpResponse<String> full = send("GET", mailpitApi() + "/api/v1/message/" + messages.get(0).path("ID").asText(), null);
                    return json(full).path("Text").asText();
                }
            }
            Thread.sleep(300);
        }
        throw new AssertionError(to + " хаягт Mailpit-д имэйл ирсэнгүй");
    }

    private static String sixDigits(String text) {
        Matcher m = Pattern.compile("\\b(\\d{6})\\b").matcher(text);
        assertThat(m.find()).as("6 оронтой код").isTrue();
        return m.group(1);
    }

    private HttpResponse<String> verify(String email, String code) {
        return send("POST", url("/api/v1/auth/verify-email"), body("email", email, "code", code));
    }

    @Test
    @DisplayName("AC-01 бүртгэлийн 6 оронтой код SMTP-ээр Mailpit-д ирж, зөв кодоор нэвтэрнэ (TokenResponse, emailVerified)")
    void codeArrivesInMailpitAndVerifies() throws Exception {
        String email = email("mailpit");
        assertThat(register(email, PASSWORD, "1995-05-14").statusCode()).isEqualTo(202);
        String code = sixDigits(mailpitText(email));

        HttpResponse<String> r = verify(email, code);
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        JsonNode tokens = json(r);
        assertThat(tokens.path("accessToken").asText()).isNotBlank();
        assertThat(tokens.path("refreshToken").asText()).isNotBlank();
        assertThat(tokens.path("user").path("emailVerified").asBoolean()).isTrue();
        assertThat(tokens.path("user").path("space").path("kind").asText()).isEqualTo("SOLO");

        HttpResponse<String> me = me(tokens.path("accessToken").asText());
        assertThat(me.statusCode()).isEqualTo(200);
        assertThat(json(me).path("email").asText()).isEqualTo(email);
        // Нэг удаагийн: дахин ашиглахад хүчингүй
        assertThat(verify(email, code).statusCode()).isEqualTo(400);
    }

    @Test
    @DisplayName("AC-01 5 буруу код → 15 мин түгжээ: 6 дахь нь зөв кодтой ч 423 CODE_LOCKED + retryAfterSeconds")
    void fiveWrongCodesLockFor15Minutes() {
        String email = email("lock");
        assertThat(register(email, PASSWORD, "1995-05-14").statusCode()).isEqualTo(202);
        String good = lastMail(email).code();
        String bad = good.equals("000000") ? "111111" : "000000";

        for (int left = 4; left >= 1; left--) {
            HttpResponse<String> r = verify(email, bad);
            assertThat(r.statusCode()).isEqualTo(400);
            assertThat(code(r)).isEqualTo("CODE_INVALID");
            assertThat(json(r).path("details").path("attemptsLeft").asInt()).isEqualTo(left);
        }
        HttpResponse<String> fifth = verify(email, bad);
        assertThat(fifth.statusCode()).isEqualTo(423);
        assertThat(code(fifth)).isEqualTo("CODE_LOCKED");

        HttpResponse<String> sixth = verify(email, good);
        assertThat(sixth.statusCode()).isEqualTo(423);
        assertThat(code(sixth)).isEqualTo("CODE_LOCKED");
        assertThat(json(sixth).path("retryAfterSeconds").asInt()).isBetween(890, 900);
        assertThat(sixth.headers().firstValue("Retry-After")).isPresent();

        advance(Duration.ofMinutes(14));
        assertThat(code(verify(email, good))).isEqualTo("CODE_LOCKED");

        // 15 мин өнгөрмөгц түгжээ тайлагдана; анхны код ч 15 мин-ийн хугацаатай тул дахин илгээнэ
        advance(Duration.ofMinutes(1).plusSeconds(5));
        HttpResponse<String> expired = verify(email, good);
        assertThat(expired.statusCode()).isEqualTo(410);
        assertThat(code(expired)).isEqualTo("CODE_EXPIRED");
        assertThat(send("POST", url("/api/v1/auth/verify-email/resend"), body("email", email)).statusCode()).isEqualTo(202);
        assertThat(verify(email, lastMail(email).code()).statusCode()).isEqualTo(200);
    }

    @Test
    @DisplayName("AC-165 код 15 минутын дараа хүчингүй (410 CODE_EXPIRED)")
    void codeExpiresAfter15Minutes() {
        String email = email("expire");
        assertThat(register(email, PASSWORD, "1995-05-14").statusCode()).isEqualTo(202);
        String code = lastMail(email).code();
        advance(Duration.ofMinutes(15).plusSeconds(1));
        HttpResponse<String> r = verify(email, code);
        assertThat(r.statusCode()).isEqualTo(410);
        assertThat(code(r)).isEqualTo("CODE_EXPIRED");
    }

    @Test
    @DisplayName("AC-165 имэйлийн холбоосоор баталгаажина (нэг удаагийн), хугацаа дууссан холбоос 410")
    void verifyByLink() {
        String email = email("link");
        assertThat(register(email, PASSWORD, "1995-05-14").statusCode()).isEqualTo(202);
        String link = lastMail(email).link();
        assertThat(link).startsWith("http://localhost:8090/verify-email?token=");
        String token = StubOAuthIdp.query(URI.create(link)).get("token");

        HttpResponse<String> ok = send("POST", url("/api/v1/auth/verify-email/link"), body("token", token));
        assertThat(ok.statusCode()).as(ok.body()).isEqualTo(200);
        assertThat(json(ok).path("user").path("emailVerified").asBoolean()).isTrue();
        HttpResponse<String> reused = send("POST", url("/api/v1/auth/verify-email/link"), body("token", token));
        assertThat(reused.statusCode()).isEqualTo(400);
        assertThat(code(reused)).isEqualTo("TOKEN_INVALID");

        String other = email("link-exp");
        assertThat(register(other, PASSWORD, "1995-05-14").statusCode()).isEqualTo(202);
        String otherToken = StubOAuthIdp.query(URI.create(lastMail(other).link())).get("token");
        advance(Duration.ofMinutes(16));
        HttpResponse<String> expired = send("POST", url("/api/v1/auth/verify-email/link"), body("token", otherToken));
        assertThat(expired.statusCode()).isEqualTo(410);
        assertThat(code(expired)).isEqualTo("TOKEN_EXPIRED");
    }

    @Test
    @DisplayName("AC-165 баталгаажаагүй акаунт: нэвтрэлт 403 AUTH_EMAIL_NOT_VERIFIED, хос үүсгэх хаалга (requireVerified) татгалзана")
    void unverifiedCannotPair() {
        String email = email("unverified");
        assertThat(register(email, PASSWORD, "1995-05-14").statusCode()).isEqualTo(202);
        UUID id = userId(email);

        HttpResponse<String> login = login(email, PASSWORD);
        assertThat(login.statusCode()).isEqualTo(403);
        assertThat(code(login)).isEqualTo("AUTH_EMAIL_NOT_VERIFIED");
        assertThatThrownBy(() -> verification.requireVerified(id))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.AUTH_EMAIL_NOT_VERIFIED));

        assertThat(verify(email, lastMail(email).code()).statusCode()).isEqualTo(200);
        verification.requireVerified(id);
    }

    @Test
    @DisplayName("AC-01 дахин илгээх: 202, нэг имэйлд 60 с-д нэг (429 RATE_LIMITED); бүртгэлгүй имэйлд ч 202")
    void resendRateLimited() {
        String email = email("resend");
        assertThat(register(email, PASSWORD, "1995-05-14").statusCode()).isEqualTo(202);
        String first = lastMail(email).code();
        assertThat(send("POST", url("/api/v1/auth/verify-email/resend"), body("email", email)).statusCode()).isEqualTo(202);
        String second = lastMail(email).code();
        HttpResponse<String> limited = send("POST", url("/api/v1/auth/verify-email/resend"), body("email", email));
        assertThat(limited.statusCode()).isEqualTo(429);
        assertThat(code(limited)).isEqualTo("RATE_LIMITED");
        assertThat(json(limited).path("retryAfterSeconds").asInt()).isBetween(1, 60);
        // Өмнөх код хүчингүй, сүүлийнх л ажиллана
        if (!first.equals(second)) {
            assertThat(verify(email, first).statusCode()).isEqualTo(400);
        }
        assertThat(verify(email, second).statusCode()).isEqualTo(200);
        assertThat(send("POST", url("/api/v1/auth/verify-email/resend"), body("email", email("nobody"))).statusCode())
                .isEqualTo(202);
    }

    @Test
    @DisplayName("AC-01 e2e profile: GET /test/mail/last?to= → сүүлийн имэйлийн гарчиг, код, холбоос; имэйлгүй хаяг → 404")
    void testMailLast() {
        String email = email("lastmail");
        assertThat(register(email, PASSWORD, "1995-05-14").statusCode()).isEqualTo(202);
        HttpResponse<String> r = HttpTestClient.send("GET", url("/api/v1/test/mail/last?to=" + email), null);
        assertThat(r.statusCode()).isEqualTo(200);
        JsonNode mail = json(r);
        assertThat(mail.path("code").asText()).isEqualTo(lastMail(email).code()).matches("\\d{6}");
        assertThat(mail.path("subject").asText()).contains(mail.path("code").asText());
        assertThat(mail.path("link").asText()).startsWith("http://localhost:8090/verify-email?token=");
        assertThat(HttpTestClient.send("GET", url("/api/v1/test/mail/last?to=" + email("none")), null).statusCode())
                .isEqualTo(404);
    }
}
