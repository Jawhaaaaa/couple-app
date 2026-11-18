package mn.aura.couple.couple;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpResponse;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class CoupleSettingsIT extends AbstractSpaceIT {

    @Test
    @DisplayName("AC-137 хоч зөвхөн өгсөн хүнд харагдана, хамтрагчийн API-д байхгүй")
    void nicknameIsPrivate() {
        TestUser a = user("nick-a");
        TestUser b = user("nick-b");
        pair(a, b);
        JsonNode mine = ok(call(a, "PATCH", "/couple/my-view", body("partnerNickname", "Бөмбөгөө", "mascotColor", "lavender")), 200);
        assertThat(mine.path("myView").path("partnerNickname").asText()).isEqualTo("Бөмбөгөө");
        assertThat(mine.path("myView").path("mascotColor").asText()).isEqualTo("lavender");

        HttpResponse<String> theirs = call(b, "GET", "/couple");
        assertThat(theirs.body()).doesNotContain("Бөмбөгөө");
        assertThat(ok(theirs, 200).path("myView").path("mascotColor").asText()).isEqualTo("coral");
    }

    @Test
    @DisplayName("AC-137 хамтрагчийн зураг: өөрийн хувийн (AVATAR, SOLO) зураг зөвшөөрөгдөнө, хамтрагчид харагдахгүй; бусдын зураг 404")
    void partnerAvatarIsPrivate() {
        TestUser a = user("pav-a");
        TestUser b = user("pav-b");
        pair(a, b);
        UUID mine = soloImage(a);
        JsonNode view = ok(call(a, "PATCH", "/couple/my-view", body("partnerAvatarMediaId", mine.toString())), 200);
        assertThat(view.path("myView").path("partnerAvatar").path("id").asText()).isEqualTo(mine.toString());

        HttpResponse<String> theirs = call(b, "GET", "/couple");
        assertThat(theirs.body()).doesNotContain(mine.toString());

        UUID foreign = soloImage(b);
        assertThat(call(a, "PATCH", "/couple/my-view", body("partnerAvatarMediaId", foreign.toString())).statusCode())
                .isEqualTo(404);
        assertThat(call(a, "PATCH", "/couple/my-view", body("partnerAvatarMediaId", UUID.randomUUID().toString()))
                .statusCode()).isEqualTo(404);
    }

    private UUID soloImage(TestUser u) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO media (id, space_id, owner_id, kind, mime, size_bytes, s3_key, status) "
                + "VALUES (?, ?, ?, 'IMAGE', 'image/jpeg', 1000, ?, 'READY')", id, soloSpace(u), u.id(),
                "spaces/x/" + id + "/original");
        return id;
    }

    @Test
    @DisplayName("AC-138 сэдэв: A санал болгож B зөвшөөрөхөд хоёуланд; өөрийн саналыг зөвшөөрөх → 403")
    void themeAccept() {
        TestUser a = user("th-a");
        TestUser b = user("th-b");
        pair(a, b);
        JsonNode proposal = ok(call(a, "POST", "/couple/theme-proposals", body("theme", "LAVENDER")), 201);
        String id = proposal.path("id").asText();
        assertThat(ok(call(b, "GET", "/couple"), 200).path("pendingThemeProposal").path("id").asText()).isEqualTo(id);
        assertThat(call(a, "POST", "/couple/theme-proposals/" + id + "/accept").statusCode()).isEqualTo(403);
        assertThat(call(a, "POST", "/couple/theme-proposals", body("theme", "OCEAN")).statusCode()).isEqualTo(409);

        JsonNode accepted = ok(call(b, "POST", "/couple/theme-proposals/" + id + "/accept"), 200);
        assertThat(accepted.path("theme").asText()).isEqualTo("LAVENDER");
        assertThat(ok(call(a, "GET", "/couple"), 200).path("theme").asText()).isEqualTo("LAVENDER");
    }

    @Test
    @DisplayName("AC-138 татгалзвал сэдэв хэвээр")
    void themeDecline() {
        TestUser a = user("thd-a");
        TestUser b = user("thd-b");
        pair(a, b);
        String id = ok(call(a, "POST", "/couple/theme-proposals", body("theme", "FOREST")), 201).path("id").asText();
        ok(call(b, "POST", "/couple/theme-proposals/" + id + "/decline"), 204);
        JsonNode couple = ok(call(a, "GET", "/couple"), 200);
        assertThat(couple.path("theme").asText()).isEqualTo("CORAL");
        assertThat(couple.path("pendingThemeProposal").isMissingNode()).isTrue();
    }

    @Test
    @DisplayName("AC-74 дараагийн уулзалт тэмдэглэх ба арилгах (R-5)")
    void nextMeetup() {
        TestUser a = user("mt-a");
        TestUser b = user("mt-b");
        pair(a, b);
        JsonNode set = ok(call(a, "PUT", "/couple/next-meetup", body("at", "2026-12-24T10:00:00Z")), 200);
        assertThat(set.path("nextMeetupAt").asText()).startsWith("2026-12-24T10:00");
        assertThat(ok(call(b, "GET", "/couple"), 200).path("nextMeetupAt").asText()).startsWith("2026-12-24T10:00");
        JsonNode cleared = ok(call(a, "PUT", "/couple/next-meetup", "{\"at\":null}"), 200);
        assertThat(cleared.path("nextMeetupAt").isMissingNode() || cleared.path("nextMeetupAt").isNull()).isTrue();
    }
}
