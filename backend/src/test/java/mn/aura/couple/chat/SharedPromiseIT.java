package mn.aura.couple.chat;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import mn.aura.couple.AbstractSpaceIT;
import mn.aura.couple.realtime.StompTestClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SharedPromiseIT extends AbstractSpaceIT {

    @Test
    @DisplayName("AC-93 A санал → B-д мэдэгдэл; B зөвшөөрөхөд 7 хоног ACTIVE; дуусахад ENDED, хүн бүр үр дүнгээ")
    void proposeAcceptEndOutcome() throws Exception {
        clock.set(Instant.parse("2026-11-07T04:00:00Z")); // УБ 12:00, 11-07
        TestUser a = user("pr-a");
        TestUser b = user("pr-b");
        pair(a, b);
        assertThat(call(a, "GET", "/promises/current").statusCode()).isEqualTo(204);

        JsonNode p;
        try (StompTestClient bClient = StompTestClient.connect(port, b.token()).events()) {
            Thread.sleep(300);
            p = ok(call(a, "POST", "/promises", body("text", "Өдөр бүр бие биедээ талархал хэлэх")), 201);
            assertThat(bClient.next("promise.updated", 3000).path("payload").path("status").asText()).isEqualTo("PROPOSED");
        }
        String id = p.path("id").asText();
        assertThat(p.path("status").asText()).isEqualTo("PROPOSED");
        assertThat(p.path("proposer").path("id").asText()).isEqualTo(a.id().toString());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification WHERE user_id = ? AND type = 'PROMISE_PROPOSED'",
                Integer.class, b.id())).isEqualTo(1);
        // B-д зөвшөөрөхөөс өмнө санал харагдана
        assertThat(ok(call(b, "GET", "/promises/current"), 200).path("status").asText()).isEqualTo("PROPOSED");

        // Нээлттэй амлалт байхад шинийг санал болгохгүй; өөрийнхийгөө зөвшөөрөхгүй; дуусаагүйд үр дүнгүй
        assertThat(call(b, "POST", "/promises", body("text", "Өөр")).statusCode()).isEqualTo(409);
        assertThat(code(call(a, "POST", "/promises/" + id + "/accept"))).isEqualTo("NOT_OWNER");
        assertThat(code(call(b, "POST", "/promises/" + id + "/outcome", body("kept", true)))).isEqualTo("PROMISE_NOT_ENDED");

        JsonNode active = ok(call(b, "POST", "/promises/" + id + "/accept"), 200);
        assertThat(active.path("status").asText()).isEqualTo("ACTIVE");
        assertThat(active.path("startsOn").asText()).isEqualTo("2026-11-07");
        assertThat(active.path("endsOn").asText()).isEqualTo("2026-11-13");
        assertThat(code(call(b, "POST", "/promises/" + id + "/decline"))).isEqualTo("ALREADY_DECIDED");

        // 7 дахь өдөр ч идэвхтэй
        clock.set(Instant.parse("2026-11-13T15:00:00Z")); // УБ 11-13 23:00
        a = fresh(a);
        b = fresh(b);
        assertThat(ok(call(a, "GET", "/promises/current"), 200).path("status").asText()).isEqualTo("ACTIVE");
        assertThat(code(call(a, "POST", "/promises/" + id + "/outcome", body("kept", true)))).isEqualTo("PROMISE_NOT_ENDED");

        clock.set(Instant.parse("2026-11-13T16:30:00Z")); // УБ 11-14 00:30
        a = fresh(a);
        b = fresh(b);
        JsonNode ended = ok(call(a, "GET", "/promises/current"), 200);
        assertThat(ended.path("status").asText()).isEqualTo("ENDED");
        JsonNode mine = ok(call(a, "POST", "/promises/" + id + "/outcome", body("kept", true)), 200);
        assertThat(mine.path("myOutcome").asBoolean()).isTrue();
        assertThat(mine.path("partnerOutcome").isBoolean()).isFalse();
        JsonNode theirs = ok(call(b, "POST", "/promises/" + id + "/outcome", body("kept", false)), 200);
        assertThat(theirs.path("myOutcome").asBoolean()).isFalse();
        assertThat(theirs.path("partnerOutcome").asBoolean()).isTrue();
        // Хоёулаа хариулсны дараа одоогийн амлалт алга, шинийг санал болгож болно
        assertThat(call(a, "GET", "/promises/current").statusCode()).isEqualTo(204);
        ok(call(b, "POST", "/promises", body("text", "Утасгүй оройн хоол")), 201);
    }

    @Test
    @DisplayName("AC-93 татгалзсан амлалт алга болж, шинэ санал болгож болно; ганцаараа бол 409 NOT_PAIRED; өөр хос 404")
    void declineAndIsolation() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("prd-a");
        TestUser b = user("prd-b");
        TestUser solo = user("prd-s");
        TestUser c = user("prd-c");
        TestUser d = user("prd-d");
        pair(a, b);
        pair(c, d);
        String id = ok(call(a, "POST", "/promises", body("text", "Алхах")), 201).path("id").asText();
        assertThat(call(c, "POST", "/promises/" + id + "/accept").statusCode()).isEqualTo(404);
        assertThat(code(call(solo, "GET", "/promises/current"))).isEqualTo("NOT_PAIRED");
        assertThat(call(a, "POST", "/promises", body("text", "")).statusCode()).isEqualTo(400);

        assertThat(ok(call(b, "POST", "/promises/" + id + "/decline"), 200).path("status").asText()).isEqualTo("DECLINED");
        assertThat(call(a, "GET", "/promises/current").statusCode()).isEqualTo(204);
        ok(call(a, "POST", "/promises", body("text", "Дахиад")), 201);
    }
}
