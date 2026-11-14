package mn.aura.couple.passkey;

import static mn.aura.couple.HttpTestClient.send;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Passkey (AC-157). RP ID = `localhost`, origin = `aura.web.base-url` (`http://localhost:8090`, AbstractAuthIT).
 * Бодит браузерын оронд `SoftAuthenticator` (none attestation, ES256).
 */
class PasskeyIT extends AbstractSpaceIT {

    static final String ORIGIN = "http://localhost:8090";
    static final String RP_ID = "localhost";
    static final byte UP_UV = SoftAuthenticator.UP | SoftAuthenticator.UV;

    private String json(Object o) {
        try {
            return MAPPER.writeValueAsString(o);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private String registrationChallenge(TestUser u) {
        return ok(call(u, "POST", "/passkeys/registration-options"), 200).path("challenge").asText();
    }

    private String assertionChallenge(TestUser u) {
        return ok(call(u, "POST", "/passkeys/assertion-options"), 200).path("challenge").asText();
    }

    private java.net.http.HttpResponse<String> register(TestUser u, Map<String, Object> credential) {
        return call(u, "POST", "/passkeys", json(Map.of("credential", credential)));
    }

    private java.net.http.HttpResponse<String> verify(TestUser u, Map<String, Object> credential) {
        return call(u, "POST", "/passkeys/assertion", json(Map.of("credential", credential)));
    }

    private static void assertInvalid(java.net.http.HttpResponse<String> r) {
        assertThat(r.statusCode()).as(r.body()).isEqualTo(400);
        assertThat(code(r)).isEqualTo("PASSKEY_INVALID");
    }

    @Test
    @DisplayName("AC-157 passkey бүртгэх: platform authenticator, none attestation, ES256; challenge нэг удаагийн, origin/RP шалгана")
    void registration() {
        TestUser a = user("pk-reg");
        JsonNode options = ok(call(a, "POST", "/passkeys/registration-options"), 200);
        assertThat(options.path("rp").path("id").asText()).isEqualTo(RP_ID);
        assertThat(options.path("user").path("name").asText()).isEqualTo(a.email());
        assertThat(options.path("pubKeyCredParams").findValuesAsText("alg")).contains("-7");
        assertThat(options.path("attestation").asText()).isEqualTo("none");
        assertThat(options.path("authenticatorSelection").path("authenticatorAttachment").asText()).isEqualTo("platform");
        assertThat(options.path("authenticatorSelection").path("userVerification").asText()).isEqualTo("required");
        assertThat(options.path("challenge").asText()).matches("^[A-Za-z0-9_-]{43}$");

        SoftAuthenticator key = new SoftAuthenticator();
        String challenge = options.path("challenge").asText();
        // Буруу origin → 400, challenge ашиглагдсан тул дахин ажиллахгүй
        assertInvalid(register(a, key.register(challenge, "https://evil.example", RP_ID, UP_UV)));
        assertInvalid(register(a, key.register(challenge, ORIGIN, RP_ID, UP_UV)));

        // Буруу RP ID
        assertInvalid(register(a, key.register(registrationChallenge(a), ORIGIN, "evil.example", UP_UV)));
        // UV-гүй (userVerification: required)
        assertInvalid(register(a, key.register(registrationChallenge(a), ORIGIN, RP_ID, SoftAuthenticator.UP)));
        // Сервер өгөөгүй challenge
        assertInvalid(register(a, key.register("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", ORIGIN, RP_ID, UP_UV)));
        assertInvalid(call(a, "POST", "/passkeys", json(Map.of("credential", Map.of("id", "x")))));

        String ok = registrationChallenge(a);
        assertThat(register(a, key.register(ok, ORIGIN, RP_ID, UP_UV)).statusCode()).isEqualTo(201);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM webauthn_credential WHERE user_id = ? AND credential_id = ?",
                Integer.class, a.id(), key.id())).isEqualTo(1);
        // Давтан илгээх (replay) → 400
        assertInvalid(register(a, key.register(ok, ORIGIN, RP_ID, UP_UV)));

        JsonNode again = ok(call(a, "POST", "/passkeys/registration-options"), 200);
        assertThat(again.path("excludeCredentials").findValuesAsText("id")).containsExactly(key.id());
        assertThat(send("POST", url("/api/v1/passkeys/registration-options"), null).statusCode()).isEqualTo(401);
    }

    @Test
    @DisplayName("AC-157 passkey-ээр апп түгжээ тайлах: гарын үсэг баталгаажна, sign count шинэчлэгдэнэ, replay/өөр түлхүүр 400")
    void assertion() {
        TestUser a = user("pk-as");
        SoftAuthenticator key = new SoftAuthenticator();
        assertThat(register(a, key.register(registrationChallenge(a), ORIGIN, RP_ID, UP_UV)).statusCode()).isEqualTo(201);

        JsonNode options = ok(call(a, "POST", "/passkeys/assertion-options"), 200);
        assertThat(options.path("rpId").asText()).isEqualTo(RP_ID);
        assertThat(options.path("allowCredentials").findValuesAsText("id")).containsExactly(key.id());
        assertThat(options.path("userVerification").asText()).isEqualTo("required");

        Map<String, Object> signed = key.assert_(options.path("challenge").asText(), ORIGIN, RP_ID, UP_UV);
        JsonNode result = ok(verify(a, signed), 200);
        assertThat(result.path("verified").asBoolean()).isTrue();
        assertThat(jdbc.queryForObject("SELECT sign_count FROM webauthn_credential WHERE credential_id = ?", Long.class,
                key.id())).isEqualTo(1L);
        assertInvalid(verify(a, signed)); // replay

        // Бүртгэлгүй түлхүүр, буруу origin
        assertInvalid(verify(a, new SoftAuthenticator().assert_(assertionChallenge(a), ORIGIN, RP_ID, UP_UV)));
        assertInvalid(verify(a, key.assert_(assertionChallenge(a), "https://evil.example", RP_ID, UP_UV)));
        assertThat(ok(verify(a, key.assert_(assertionChallenge(a), ORIGIN, RP_ID, UP_UV)), 200).path("verified").asBoolean())
                .isTrue();
    }

    @Test
    @DisplayName("AC-157 хос тусгаарлалт: хамтрагч A-гийн credential-ийг устгах 404, ашиглах 400; өөрийнхөө устгах 204")
    void isolation() {
        TestUser a = user("pk-iso-a");
        TestUser b = user("pk-iso-b");
        pair(a, b);
        SoftAuthenticator key = new SoftAuthenticator();
        assertThat(register(a, key.register(registrationChallenge(a), ORIGIN, RP_ID, UP_UV)).statusCode()).isEqualTo(201);

        assertThat(call(b, "DELETE", "/passkeys/" + key.id()).statusCode()).isEqualTo(404);
        assertInvalid(verify(b, key.assert_(assertionChallenge(b), ORIGIN, RP_ID, UP_UV)));
        assertThat(ok(call(b, "POST", "/passkeys/assertion-options"), 200).path("allowCredentials").size()).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM webauthn_credential WHERE credential_id = ?", Integer.class,
                key.id())).isEqualTo(1);

        assertThat(call(a, "DELETE", "/passkeys/" + key.id()).statusCode()).isEqualTo(204);
        assertThat(call(a, "DELETE", "/passkeys/" + key.id()).statusCode()).isEqualTo(404);
        assertInvalid(verify(a, key.assert_(assertionChallenge(a), ORIGIN, RP_ID, UP_UV)));
    }
}
