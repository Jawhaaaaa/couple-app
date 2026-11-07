package mn.aura.couple.couple;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpResponse;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PairingIT extends AbstractSpaceIT {

    @Test
    @DisplayName("AC-170 зөвхөн урилгачийн хоёр дахь баталгааны дараа хос үүснэ; бүс = урилгачийнх (SD-02)")
    void twoSidedConfirmation() {
        TestUser a = user("pr-a");
        TestUser b = user("pr-b");
        jdbc.update("UPDATE users SET timezone = 'Asia/Tokyo' WHERE id = ?", a.id());
        String code = ok(call(a, "POST", "/invites"), 201).path("code").asText();
        JsonNode pairing = ok(call(b, "POST", "/pairings", body("code", code)), 201);
        assertThat(pairing.path("status").asText()).isEqualTo("AWAITING_INVITER");
        assertThat(pairing.path("joiner").path("id").asText()).isEqualTo(b.id().toString());

        // Эхний баталгааны дараа хос үүсээгүй
        assertThat(ok(call(b, "GET", "/couple"), 200).path("kind").asText()).isEqualTo("SOLO");
        assertThat(ok(call(a, "GET", "/pairings/current"), 200).path("id").asText())
                .isEqualTo(pairing.path("id").asText());
        HttpResponse<String> byJoiner = call(b, "POST", "/pairings/" + pairing.path("id").asText() + "/confirm");
        assertThat(byJoiner.statusCode()).isEqualTo(403);

        JsonNode couple = ok(call(a, "POST", "/pairings/" + pairing.path("id").asText() + "/confirm"), 200);
        assertThat(couple.path("kind").asText()).isEqualTo("COUPLE");
        assertThat(couple.path("timezone").asText()).isEqualTo("Asia/Tokyo");
        assertThat(couple.path("partner").path("id").asText()).isEqualTo(b.id().toString());
        assertThat(couple.path("startDateStatus").asText()).isEqualTo("PENDING");

        JsonNode bView = ok(call(b, "GET", "/couple"), 200);
        assertThat(bView.path("id").asText()).isEqualTo(couple.path("id").asText());
        assertThat(bView.path("partner").path("id").asText()).isEqualTo(a.id().toString());
        assertThat(call(a, "GET", "/pairings/current").statusCode()).isEqualTo(204);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM space_member WHERE space_id = ?::uuid AND left_at IS NULL",
                Integer.class, couple.path("id").asText())).isEqualTo(2);
    }

    @Test
    @DisplayName("AC-10 батлахаас өмнө цуцалбал хос үүсэхгүй; хоёр талын хүсэлт алга")
    void cancelBeforeConfirm() {
        TestUser a = user("cn-a");
        TestUser e = user("cn-e");
        String code = ok(call(a, "POST", "/invites"), 201).path("code").asText();
        String id = ok(call(e, "POST", "/pairings", body("code", code)), 201).path("id").asText();
        ok(call(e, "POST", "/pairings/" + id + "/cancel"), 204);

        assertThat(call(a, "POST", "/pairings/" + id + "/confirm").statusCode()).isEqualTo(404);
        assertThat(call(a, "GET", "/pairings/current").statusCode()).isEqualTo(204);
        assertThat(call(e, "GET", "/pairings/current").statusCode()).isEqualTo(204);
        assertThat(ok(call(a, "GET", "/couple"), 200).path("kind").asText()).isEqualTo("SOLO");
        assertThat(ok(call(e, "GET", "/couple"), 200).path("kind").asText()).isEqualTo("SOLO");
    }

    @Test
    @DisplayName("AC-66 хостой хүн дахин хос болох оролдлого → ALREADY_PAIRED")
    void secondPairingRejected() {
        TestUser a = user("sp-a");
        TestUser b = user("sp-b");
        TestUser c = user("sp-c");
        String codeC = ok(call(c, "POST", "/invites"), 201).path("code").asText();
        pair(a, b);
        HttpResponse<String> r = call(a, "POST", "/pairings", body("code", codeC));
        assertThat(r.statusCode()).isEqualTo(409);
        assertThat(code(r)).isEqualTo("ALREADY_PAIRED");
    }

    @Test
    @DisplayName("Хос шаарддаг endpoint SOLO үед 409 NOT_PAIRED")
    void soloGetsNotPaired() {
        TestUser a = user("np-a");
        HttpResponse<String> r = call(a, "PUT", "/couple/start-date", body("date", "2024-10-24"));
        assertThat(r.statusCode()).isEqualTo(409);
        assertThat(code(r)).isEqualTo("NOT_PAIRED");
    }
}
