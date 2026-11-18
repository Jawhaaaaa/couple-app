package mn.aura.couple.plan;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import mn.aura.couple.realtime.StompTestClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SecretDeckIT extends AbstractSpaceIT {

    private static List<String> refs(JsonNode cards) {
        List<String> out = new ArrayList<>();
        cards.forEach(c -> out.add(c.path("ideaRef").asText()));
        return out;
    }

    @Test
    @DisplayName("AC-36 A «тийм», B «үгүй» S1 — хэнд ч таарал биш; хоёулаа «тийм» S2 — хоёуланд deck.matched; A-д B-гийн сонголт 0")
    void secretMatch() throws Exception {
        TestUser a = user("deck-a");
        TestUser b = user("deck-b");
        pair(a, b);
        String own = ok(call(a, "POST", "/ideas", body("title", "Гэртээ пицца хийх", "category", "HOME", "setting", "HOME",
                "clientId", UUID.randomUUID().toString())), 201).path("id").asText();
        String s1 = "idea:" + own;
        String s2 = "library:lib-001";

        // Deck = хосын санаа + сан; хосын санаа эхэнд
        List<String> deckA = refs(ok(call(a, "GET", "/deck/next?limit=100"), 200));
        assertThat(deckA).contains(s1, s2);
        assertThat(deckA.get(0)).isEqualTo(s1);
        List<String> deckB = refs(ok(call(b, "GET", "/deck/next?limit=100"), 200));

        // B эхэлж S1-д «үгүй», S2-т «тийм»
        assertThat(ok(call(b, "POST", "/deck/swipes", body("ideaRef", s1, "liked", false)), 200).path("matched").asBoolean()).isFalse();
        JsonNode bS2 = ok(call(b, "POST", "/deck/swipes", body("ideaRef", s2, "liked", true)), 200);
        assertThat(bS2.path("matched").asBoolean()).isFalse();

        // A-гийн deck B-гийн сонголтоос үл хамааран ижил (дараалал ч ижил)
        assertThat(refs(ok(call(a, "GET", "/deck/next?limit=100"), 200))).isEqualTo(deckA);
        // B-гийн deck-ээс өөрийн swipe-ууд хасагдсан
        List<String> afterB = refs(ok(call(b, "GET", "/deck/next?limit=100"), 200));
        assertThat(afterB).doesNotContain(s1, s2);
        assertThat(afterB.subList(0, 10)).isEqualTo(deckB.subList(2, 12));

        try (StompTestClient aClient = StompTestClient.connect(port, a.token()).events();
             StompTestClient bClient = StompTestClient.connect(port, b.token()).events()) {
            Thread.sleep(300);
            HttpResp r1 = new HttpResp(call(a, "POST", "/deck/swipes", body("ideaRef", s1, "liked", true)).body());
            assertThat(r1.json().path("matched").asBoolean()).isFalse();
            // «үгүй» нь хариунд ямар ч хэлбэрээр орохгүй — хараахан swipe хийгээгүйтэй ижил
            assertThat(r1.raw()).doesNotContain("liked").doesNotContain(b.id().toString()).doesNotContain("partner");
            assertThat(r1.json().has("match") && !r1.json().path("match").isNull()).isFalse();

            JsonNode r2 = ok(call(a, "POST", "/deck/swipes", body("ideaRef", s2, "liked", true)), 200);
            assertThat(r2.path("matched").asBoolean()).isTrue();
            assertThat(r2.path("match").path("ideaRef").asText()).isEqualTo(s2);
            assertThat(r2.path("match").path("idea").path("title").asText()).isNotBlank();
            assertThat(aClient.next("deck.matched", 3000).path("payload").path("ideaRef").asText()).isEqualTo(s2);
            assertThat(bClient.next("deck.matched", 3000).path("payload").path("ideaRef").asText()).isEqualTo(s2);
        }

        JsonNode matchesA = ok(call(a, "GET", "/deck/matches"), 200);
        JsonNode matchesB = ok(call(b, "GET", "/deck/matches"), 200);
        assertThat(refs(matchesA)).containsExactly(s2);
        assertThat(refs(matchesB)).containsExactly(s2);
        assertThat(matchesA.toString()).doesNotContain("liked");

        assertThat(code(call(a, "POST", "/deck/swipes", body("ideaRef", s2, "liked", false)))).isEqualTo("ALREADY_SWIPED");
        assertThat(call(a, "POST", "/deck/swipes", body("ideaRef", "library:nope", "liked", true)).statusCode()).isEqualTo(404);
        // Өөр хосын санаа → 404
        TestUser c = user("deck-c");
        TestUser d = user("deck-d");
        pair(c, d);
        assertThat(call(c, "POST", "/deck/swipes", body("ideaRef", s1, "liked", true)).statusCode()).isEqualTo(404);
        assertThat(refs(ok(call(c, "GET", "/deck/next?limit=100"), 200))).doesNotContain(s1);
        assertThat(ok(call(c, "GET", "/deck/matches"), 200).size()).isZero();
    }

    private record HttpResp(String raw) {
        JsonNode json() {
            try {
                return MAPPER.readTree(raw);
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }
    }
}
