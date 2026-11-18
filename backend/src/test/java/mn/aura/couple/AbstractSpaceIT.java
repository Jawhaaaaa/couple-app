package mn.aura.couple;

import static mn.aura.couple.HttpTestClient.json;
import static mn.aura.couple.HttpTestClient.send;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpResponse;
import java.util.UUID;
import mn.aura.couple.auth.AbstractAuthIT;

/**
 * Хос/space-тай IT-ийн суурь: баталгаажсан хэрэглэгч үүсгэх, урилгаар хос холбох, токентой дуудлага.
 * `AbstractAuthIT`-ийн тохиргоог өвлөнө — бүх IT нэг Spring context хуваалцана.
 */
public abstract class AbstractSpaceIT extends AbstractAuthIT {

    /** Баталгаажсан хэрэглэгч ба түүний access token. */
    public record TestUser(UUID id, String email, String token) {
    }

    protected TestUser user(String prefix) {
        String email = email(prefix);
        JsonNode tokens = registerVerified(email);
        return new TestUser(userId(email), email, tokens.path("accessToken").asText());
    }

    /** Цагийг 15 минутаас илүү урагшлуулсны дараа access token дуусна — дахин нэвтэрнэ. */
    protected TestUser fresh(TestUser u) {
        return new TestUser(u.id(), u.email(), loginOk(u.email(), PASSWORD).path("accessToken").asText());
    }

    protected HttpResponse<String> call(TestUser u, String method, String path, String jsonBody) {
        return send(method, url("/api/v1" + path), jsonBody, "Authorization", "Bearer " + u.token(),
                "Accept-Language", "mn");
    }

    protected HttpResponse<String> call(TestUser u, String method, String path) {
        return call(u, method, path, null);
    }

    protected JsonNode ok(HttpResponse<String> r, int status) {
        assertThat(r.statusCode()).as(r.body()).isEqualTo(status);
        return r.body() == null || r.body().isBlank() ? null : json(r);
    }

    /** A урилга үүсгэж, B нэгдэж, A батална → COUPLE space-ийн ID. */
    protected UUID pair(TestUser a, TestUser b) {
        String code = ok(call(a, "POST", "/invites"), 201).path("code").asText();
        String pairingId = ok(call(b, "POST", "/pairings", body("code", code)), 201).path("id").asText();
        return UUID.fromString(ok(call(a, "POST", "/pairings/" + pairingId + "/confirm"), 200).path("id").asText());
    }

    protected UUID soloSpace(TestUser u) {
        return jdbc.queryForObject("SELECT space_id FROM space_member WHERE user_id = ? AND space_kind = 'SOLO'",
                UUID.class, u.id());
    }
}
