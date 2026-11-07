package mn.aura.couple.auth;

import static mn.aura.couple.HttpTestClient.json;
import static mn.aura.couple.HttpTestClient.send;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import mn.aura.couple.AbstractIntegrationTest;
import mn.aura.couple.ItBeans;
import mn.aura.couple.common.config.AuraProperties;
import mn.aura.couple.common.mail.MailCapture;
import mn.aura.couple.common.mail.MailMessage;
import mn.aura.couple.common.time.MutableClock;
import mn.aura.couple.weather.OpenMeteoStub;
import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Auth IT-ийн суурь: `e2e` profile (`MutableClock`, `MailCapture`, `/test/**`), Google-ийн stub IdP.
 * Бүх auth IT нэг Spring context хуваалцана. Тест бүр давтагдашгүй имэйл ашиглана (нэг DB).
 */
@ActiveProfiles("e2e")
@Import(ItBeans.class)
public abstract class AbstractAuthIT extends AbstractIntegrationTest {

    protected static final StubOAuthIdp IDP = StubOAuthIdp.start();
    /** Цаг агаар ба geocoding (T-28) — бүх IT нэг stub хуваалцана. */
    protected static final OpenMeteoStub METEO = OpenMeteoStub.start();
    protected static final ObjectMapper MAPPER = new ObjectMapper();
    protected static final String PASSWORD = "Saran-Tsetseg-2026";

    @Autowired
    protected MutableClock clock;

    @Autowired
    protected MailCapture mails;

    @Autowired
    protected JdbcTemplate jdbc;

    @Autowired
    protected AuraProperties properties;

    @DynamicPropertySource
    static void oauthProperties(DynamicPropertyRegistry registry) {
        registry.add("aura.oauth.google.client-id", () -> StubOAuthIdp.CLIENT_ID);
        registry.add("aura.oauth.google.client-secret", () -> StubOAuthIdp.CLIENT_SECRET);
        registry.add("aura.oauth.google.issuer", IDP::issuer);
        registry.add("aura.oauth.google.id-token-alg", () -> "HS256");
        registry.add("aura.web.base-url", () -> "http://localhost:8090");
        registry.add("aura.weather.base-url", METEO::url);
        registry.add("aura.weather.geocoding-base-url", METEO::url);
    }

    @AfterEach
    void resetClock() {
        clock.reset();
    }

    protected static String email(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8) + "@aura.test";
    }

    protected static String body(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        try {
            return MAPPER.writeValueAsString(m);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    protected HttpResponse<String> register(String email, String password, String birthDate) {
        return register(email, password, birthDate, properties.policy().version());
    }

    protected HttpResponse<String> register(String email, String password, String birthDate, String policyVersion) {
        return send("POST", url("/api/v1/auth/register"), body(
                "email", email, "password", password, "displayName", "Бат", "birthDate", birthDate,
                "locale", "mn", "timezone", "Asia/Ulaanbaatar", "acceptedPolicyVersion", policyVersion));
    }

    protected MailMessage lastMail(String to) {
        return mails.last(to).orElseThrow(() -> new AssertionError(to + " хаягт имэйл алга"));
    }

    /** Бүртгүүлж, имэйлийн кодоор баталгаажуулна → native TokenResponse. */
    protected JsonNode registerVerified(String email) {
        assertThat(register(email, PASSWORD, "1995-05-14").statusCode()).isEqualTo(202);
        HttpResponse<String> r = send("POST", url("/api/v1/auth/verify-email"),
                body("email", email, "code", lastMail(email).code()));
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        return json(r);
    }

    protected HttpResponse<String> login(String email, String password, String... headers) {
        return send("POST", url("/api/v1/auth/login"), body("email", email, "password", password,
                "device", Map.of("name", "Pixel 7", "platform", "ANDROID")), headers);
    }

    protected JsonNode loginOk(String email, String password) {
        HttpResponse<String> r = login(email, password);
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        return json(r);
    }

    protected HttpResponse<String> refresh(String refreshToken) {
        return send("POST", url("/api/v1/auth/refresh"), body("refreshToken", refreshToken));
    }

    protected HttpResponse<String> me(String accessToken) {
        return send("GET", url("/api/v1/me"), null, "Authorization", "Bearer " + accessToken);
    }

    protected void advance(Duration d) {
        clock.set(clock.instant().plus(d));
    }

    protected UUID userId(String email) {
        return jdbc.queryForObject("SELECT id FROM users WHERE email = ?", UUID.class, email);
    }

    protected static String code(HttpResponse<String> r) {
        return json(r).path("code").asText();
    }
}
