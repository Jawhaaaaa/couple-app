package mn.aura.couple.auth;

import static mn.aura.couple.HttpTestClient.json;
import static mn.aura.couple.HttpTestClient.send;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.auth.app.AppleOAuth;
import mn.aura.couple.auth.app.GoogleOAuth;
import mn.aura.couple.common.config.AuraProperties;
import mn.aura.couple.common.time.TimeProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** T-20: backend дамжсан Google OAuth (DD-AURA-032) — in-test stub IdP (GAP-18). */
@DisplayName("Google OAuth — GoogleOAuthController, OAuthAccountLinker")
class GoogleOAuthIT extends AbstractAuthIT {

    private static final Map<String, Object> DEVICE = Map.of("name", "Pixel 7", "platform", "ANDROID");

    @AfterEach
    void resetIdp() {
        IDP.setBadSignature(false);
    }

    /** start → stub authorize → backend callback; callback-ийн `Location`. */
    private URI flow(String client, StubOAuthIdp.User user) {
        IDP.setUser(user);
        HttpResponse<String> start = send("GET", url("/api/v1/auth/oauth/google/start?client=" + client), null);
        assertThat(start.statusCode()).isEqualTo(302);
        URI authorize = URI.create(start.headers().firstValue("Location").orElseThrow());
        Map<String, String> q = StubOAuthIdp.query(authorize);
        assertThat(authorize.toString()).startsWith(IDP.issuer() + "/authorize?");
        assertThat(q).containsEntry("client_id", StubOAuthIdp.CLIENT_ID).containsEntry("response_type", "code")
                .containsKey("state");
        assertThat(q.get("redirect_uri")).endsWith("/api/v1/auth/oauth/google/callback");
        String setCookie = start.headers().firstValue("Set-Cookie").orElseThrow();
        assertThat(setCookie).startsWith("aura_oauth=").contains("HttpOnly").contains("SameSite=Lax");
        String cookie = setCookie.substring(0, setCookie.indexOf(';'));

        HttpResponse<String> idp = send("GET", authorize.toString(), null);
        assertThat(idp.statusCode()).isEqualTo(302);
        URI back = URI.create(idp.headers().firstValue("Location").orElseThrow());
        HttpResponse<String> callback = send("GET", url(back.getPath() + "?" + back.getRawQuery()), null, "Cookie", cookie);
        assertThat(callback.statusCode()).isEqualTo(302);
        return URI.create(callback.headers().firstValue("Location").orElseThrow());
    }

    private HttpResponse<String> exchange(String code, String... headers) {
        return send("POST", url("/api/v1/auth/oauth/exchange"), body("code", code, "device", DEVICE), headers);
    }

    private static StubOAuthIdp.User googleUser(String email) {
        return new StubOAuthIdp.User("g-" + UUID.randomUUID(), email, "Google Бат", true);
    }

    @Test
    @DisplayName("AC-06 web: start → IdP → callback → 302 /oauth-callback?code= → exchange: шинэ хэрэглэгч, refresh зөвхөн cookie-д")
    void webFlowCreatesUser() {
        String email = email("gweb");
        URI target = flow("web", googleUser(email));
        assertThat(target.toString()).startsWith("http://localhost:8090/oauth-callback?code=");
        String code = StubOAuthIdp.query(target).get("code");

        HttpResponse<String> r = exchange(code, "X-Aura-Client", "web");
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        JsonNode body = json(r);
        assertThat(body.path("isNewUser").asBoolean()).isTrue();
        assertThat(body.path("linkRequired").asBoolean()).isFalse();
        assertThat(body.path("tokens").has("refreshToken")).isFalse();
        assertThat(r.headers().firstValue("Set-Cookie").orElseThrow()).startsWith("aura_rt=").contains("HttpOnly");
        JsonNode user = body.path("tokens").path("user");
        assertThat(user.path("email").asText()).isEqualTo(email);
        assertThat(user.path("emailVerified").asBoolean()).isTrue();
        assertThat(user.path("space").path("kind").asText()).isEqualTo("SOLO");
        assertThat(user.path("policyUpdateRequired").asBoolean()).isTrue();
        assertThat(me(body.path("tokens").path("accessToken").asText()).statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM oauth_identity WHERE email = ? AND provider = 'GOOGLE'",
                Integer.class, email)).isEqualTo(1);

        // Нэг удаагийн код
        HttpResponse<String> reused = exchange(code);
        assertThat(reused.statusCode()).isEqualTo(400);
        assertThat(code(reused)).isEqualTo("CODE_INVALID");
    }

    @Test
    @DisplayName("AC-06 native: 302 aura://oauth-callback?code=, refresh биед; дахин нэвтрэхэд isNewUser=false, ижил хэрэглэгч")
    void nativeFlowAndReturningUser() {
        String email = email("gnative");
        StubOAuthIdp.User user = googleUser(email);
        URI target = flow("native", user);
        assertThat(target.getScheme()).isEqualTo("aura");
        assertThat(target.toString()).startsWith("aura://oauth-callback?code=");
        JsonNode first = json(exchange(StubOAuthIdp.query(target).get("code")));
        assertThat(first.path("tokens").path("refreshToken").asText()).isNotBlank();
        assertThat(first.path("isNewUser").asBoolean()).isTrue();

        JsonNode second = json(exchange(StubOAuthIdp.query(flow("native", user)).get("code")));
        assertThat(second.path("isNewUser").asBoolean()).isFalse();
        assertThat(second.path("linkRequired").asBoolean()).isFalse();
        assertThat(second.path("tokens").path("user").path("id").asText())
                .isEqualTo(first.path("tokens").path("user").path("id").asText());
    }

    @Test
    @DisplayName("AC-06 exchange код 60 с-ийн дараа 410 CODE_EXPIRED")
    void exchangeCodeExpires() {
        URI target = flow("native", googleUser(email("gexp")));
        advance(Duration.ofSeconds(61));
        HttpResponse<String> r = exchange(StubOAuthIdp.query(target).get("code"));
        assertThat(r.statusCode()).isEqualTo(410);
        assertThat(code(r)).isEqualTo("CODE_EXPIRED");
    }

    @Test
    @DisplayName("AC-167 бүртгэлтэй (нууц үгтэй, баталгаажсан) имэйлтэй Google → шинэ акаунт үүсэхгүй, linkRequired → нууц үгээр холбоно")
    void linkExistingAccountWithPassword() {
        String email = email("bat");
        JsonNode existing = registerVerified(email);
        String userId = existing.path("user").path("id").asText();
        StubOAuthIdp.User google = googleUser(email);

        JsonNode ex = json(exchange(StubOAuthIdp.query(flow("native", google)).get("code")));
        assertThat(ex.path("linkRequired").asBoolean()).isTrue();
        assertThat(ex.path("isNewUser").asBoolean()).isFalse();
        assertThat(ex.has("tokens")).isFalse();
        String linkToken = ex.path("linkToken").asText();
        assertThat(linkToken).isNotBlank();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM users WHERE email = ?", Integer.class, email)).isEqualTo(1);

        HttpResponse<String> wrong = send("POST", url("/api/v1/auth/oauth/link"), body("linkToken", linkToken, "password", "nope-nope-1"));
        assertThat(wrong.statusCode()).isEqualTo(401);
        assertThat(code(wrong)).isEqualTo("AUTH_INVALID_CREDENTIALS");

        HttpResponse<String> linked = send("POST", url("/api/v1/auth/oauth/link"), body("linkToken", linkToken, "password", PASSWORD));
        assertThat(linked.statusCode()).as(linked.body()).isEqualTo(200);
        assertThat(json(linked).path("user").path("id").asText()).isEqualTo(userId);
        assertThat(json(linked).path("refreshToken").asText()).isNotBlank();
        HttpResponse<String> reused = send("POST", url("/api/v1/auth/oauth/link"), body("linkToken", linkToken, "password", PASSWORD));
        assertThat(reused.statusCode()).isEqualTo(410);

        // Холбогдсон тул дараагийн Google нэвтрэлт шууд
        JsonNode again = json(exchange(StubOAuthIdp.query(flow("native", google)).get("code")));
        assertThat(again.path("linkRequired").asBoolean()).isFalse();
        assertThat(again.path("tokens").path("user").path("id").asText()).isEqualTo(userId);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM users WHERE email = ?", Integer.class, email)).isEqualTo(1);
    }

    @Test
    @DisplayName("AC-167 холболтыг тэр хаягт очсон 6 оронтой имэйлийн кодоор баталгаажуулна")
    void linkWithEmailCode() {
        String email = email("dulmaa");
        String userId = registerVerified(email).path("user").path("id").asText();
        JsonNode ex = json(exchange(StubOAuthIdp.query(flow("web", googleUser(email))).get("code"), "X-Aura-Client", "web"));
        assertThat(ex.path("linkRequired").asBoolean()).isTrue();
        String code = lastMail(email).code();
        assertThat(lastMail(email).subject()).contains("Google");

        String wrong = code.equals("000000") ? "111111" : "000000";
        assertThat(send("POST", url("/api/v1/auth/oauth/link"), body("linkToken", ex.path("linkToken").asText(), "emailCode", wrong))
                .statusCode()).isEqualTo(401);
        HttpResponse<String> linked = send("POST", url("/api/v1/auth/oauth/link"),
                body("linkToken", ex.path("linkToken").asText(), "emailCode", code), "X-Aura-Client", "web");
        assertThat(linked.statusCode()).as(linked.body()).isEqualTo(200);
        assertThat(json(linked).path("user").path("id").asText()).isEqualTo(userId);
        assertThat(json(linked).has("refreshToken")).isFalse();
        assertThat(linked.headers().firstValue("Set-Cookie").orElseThrow()).startsWith("aura_rt=");
    }

    @Test
    @DisplayName("AC-06 state-ийг өөрчилсөн, cookie-гүй эсвэл id_token-ий гарын үсэг буруу → 302 ?error=, хэрэглэгч үүсэхгүй")
    void callbackErrors() {
        HttpResponse<String> start = send("GET", url("/api/v1/auth/oauth/google/start?client=native"), null);
        URI authorize = URI.create(start.headers().firstValue("Location").orElseThrow());
        URI back = URI.create(send("GET", authorize.toString(), null).headers().firstValue("Location").orElseThrow());
        // Cookie-гүй (өөр хөтөч) — login CSRF
        HttpResponse<String> noCookie = send("GET", url(back.getPath() + "?" + back.getRawQuery()), null);
        assertThat(noCookie.headers().firstValue("Location").orElseThrow()).isEqualTo("aura://oauth-callback?error=STATE_INVALID");
        // Гарын үсэггүй state
        HttpResponse<String> forged = send("GET", url("/api/v1/auth/oauth/google/callback?code=x&state=forged"), null);
        assertThat(forged.headers().firstValue("Location").orElseThrow()).endsWith("/oauth-callback?error=STATE_INVALID");
        // IdP-ийн алдаа
        String email = email("gbad");
        IDP.setBadSignature(true);
        URI bad = flow("web", googleUser(email));
        assertThat(bad.toString()).endsWith("/oauth-callback?error=ID_TOKEN_INVALID");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM users WHERE email = ?", Integer.class, email)).isZero();
    }

    @Test
    @DisplayName("AC-06 Apple (enabled=false) ба client id-гүй Google → 404 PROVIDER_DISABLED; буруу client → 400")
    void providerDisabled() {
        HttpResponse<String> apple = send("GET", url("/api/v1/auth/oauth/apple/start?client=web"), null);
        assertThat(apple.statusCode()).isEqualTo(404);
        assertThat(code(apple)).isEqualTo("PROVIDER_DISABLED");
        assertThat(send("GET", url("/api/v1/auth/oauth/google/start?client=desktop"), null).statusCode()).isEqualTo(400);

        AuraProperties empty = new AuraProperties(null, null, null, null, null, null, null, null, null, null);
        TimeProvider time = new TimeProvider(java.time.Clock.systemUTC());
        assertThat(new GoogleOAuth(empty, MAPPER, time).enabled()).isFalse();
        assertThat(new AppleOAuth(empty, MAPPER, time).enabled()).isFalse();
    }
}
