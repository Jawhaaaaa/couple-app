package mn.aura.couple.couple;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpResponse;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * FR-2.5 шийдвэрийн төлөв. Дурсамжийн шилжилт (AC-67-ийн «3 зүйл») — `MemoryIT` (T-35) дурсамжийн
 * хүснэгт үүссэний дараа шалгана.
 */
class SoloShareIT extends AbstractSpaceIT {

    @Test
    @DisplayName("AC-67 шийдвэр нэг л удаа: хуваалцах зүйлгүй бол soloShare хоосон, дахин шийдэх → 409")
    void decideOnce() {
        TestUser a = user("ss-a");
        TestUser b = user("ss-b");
        pair(a, b);
        assertThat(ok(call(a, "GET", "/couple"), 200).path("soloShare").isMissingNode()).isTrue();

        JsonNode result = ok(call(a, "POST", "/couple/solo-share", body("share", false)), 200);
        assertThat(result.path("movedCount").asInt()).isZero();
        HttpResponse<String> again = call(a, "POST", "/couple/solo-share", body("share", true));
        assertThat(again.statusCode()).isEqualTo(409);
        assertThat(code(again)).isEqualTo("ALREADY_DECIDED");
        // B-гийн шийдвэр тусдаа
        assertThat(ok(call(b, "POST", "/couple/solo-share", body("share", true)), 200).path("movedCount").asInt()).isZero();
    }

    @Test
    @DisplayName("AC-67 «Тийм» үед SOLO-гийн медиа хосын space руу шилжинэ, профайлын зураг SOLO-д үлдэнэ")
    void shareMovesMediaExceptAvatar() {
        TestUser a = user("sm-a");
        TestUser b = user("sm-b");
        UUID solo = soloSpace(a);
        UUID photo = UUID.randomUUID();
        UUID avatar = UUID.randomUUID();
        for (UUID id : new UUID[] {photo, avatar}) {
            jdbc.update("INSERT INTO media (id, space_id, owner_id, kind, mime, size_bytes, s3_key, status) "
                    + "VALUES (?, ?, ?, 'IMAGE', 'image/jpeg', 1000, ?, 'READY')", id, solo, a.id(), "k/" + id);
        }
        jdbc.update("UPDATE space SET storage_bytes = 2000 WHERE id = ?", solo);
        jdbc.update("UPDATE users SET avatar_media_id = ? WHERE id = ?", avatar, a.id());
        UUID couple = pair(a, b);

        ok(call(a, "POST", "/couple/solo-share", body("share", true)), 200);
        assertThat(jdbc.queryForObject("SELECT space_id FROM media WHERE id = ?", UUID.class, photo)).isEqualTo(couple);
        assertThat(jdbc.queryForObject("SELECT space_id FROM media WHERE id = ?", UUID.class, avatar)).isEqualTo(solo);
        assertThat(jdbc.queryForObject("SELECT storage_bytes FROM space WHERE id = ?", Long.class, solo)).isEqualTo(1000L);
        assertThat(jdbc.queryForObject("SELECT storage_bytes FROM space WHERE id = ?", Long.class, couple)).isEqualTo(1000L);
    }
}
