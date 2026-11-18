package mn.aura.couple.couple;

import static mn.aura.couple.HttpTestClient.json;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpResponse;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;

class InviteIT extends AbstractSpaceIT {

    @Test
    @DisplayName("AC-169 урилга: AURA-XXXX, холбоос ижил кодтой, 7 хоног; цуцалсны дараа хүчингүй")
    void createAndCancel() {
        TestUser a = user("inv-a");
        TestUser b = user("inv-b");
        JsonNode invite = ok(call(a, "POST", "/invites"), 201);
        String code = invite.path("code").asText();
        assertThat(code).matches("^AURA-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$");
        assertThat(invite.path("link").asText()).endsWith("/i/" + code);
        OffsetDateTime expires = OffsetDateTime.parse(invite.path("expiresAt").asText());
        assertThat(Duration.between(clock.instant(), expires.toInstant())).isBetween(Duration.ofDays(7).minusMinutes(1), Duration.ofDays(7));
        assertThat(ok(call(a, "GET", "/invites/current"), 200).path("code").asText()).isEqualTo(code);

        JsonNode preview = ok(call(b, "GET", "/invites/lookup?code=" + code), 200);
        assertThat(preview.path("inviterName").asText()).isEqualTo("Бат");

        ok(call(a, "DELETE", "/invites/" + invite.path("id").asText()), 204);
        assertThat(call(a, "GET", "/invites/current").statusCode()).isEqualTo(204);
        HttpResponse<String> r = call(b, "GET", "/invites/lookup?code=" + code);
        assertThat(r.statusCode()).isEqualTo(410);
        assertThat(code(r)).isEqualTo("INVITE_INVALID");
    }

    @Test
    @DisplayName("AC-08 7 хоног өнгөрсөн ба ашиглагдсан урилга → «Энэ урилга хүчингүй болсон» (410)")
    void expiredAndUsed() {
        TestUser a = user("exp-a");
        TestUser e = user("exp-e");
        String code = ok(call(a, "POST", "/invites"), 201).path("code").asText();
        advance(Duration.ofDays(7).plusSeconds(1));
        e = fresh(e);
        HttpResponse<String> expired = call(e, "GET", "/invites/lookup?code=" + code);
        assertThat(expired.statusCode()).isEqualTo(410);
        assertThat(code(expired)).isEqualTo("INVITE_INVALID");
        assertThat(json(expired).path("message").asText()).isNotBlank();

        TestUser c = user("exp-c");
        TestUser d = user("exp-d");
        String code2 = ok(call(c, "POST", "/invites"), 201).path("code").asText();
        ok(call(d, "POST", "/pairings", body("code", code2)), 201);
        HttpResponse<String> used = call(e, "POST", "/pairings", body("code", code2));
        assertThat(used.statusCode()).isEqualTo(410);
        assertThat(code(used)).isEqualTo("INVITE_INVALID");
    }

    @Test
    @DisplayName("AC-09 1 цагт 10 буруу код → 11 дэх оролдлого зөв кодтой ч түгжээтэй (423)")
    void wrongCodeLock() {
        TestUser a = user("lock-a");
        TestUser e = user("lock-e");
        String good = ok(call(a, "POST", "/invites"), 201).path("code").asText();
        String wrong = good.endsWith("Z") ? good.substring(0, 8) + "Y" : good.substring(0, 8) + "Z";
        for (int i = 0; i < 10; i++) {
            assertThat(call(e, "GET", "/invites/lookup?code=" + wrong).statusCode()).isEqualTo(410);
        }
        HttpResponse<String> locked = call(e, "POST", "/pairings", body("code", good));
        assertThat(locked.statusCode()).isEqualTo(423);
        assertThat(code(locked)).isEqualTo("INVITE_LOCKED");
        assertThat(locked.headers().firstValue("Retry-After")).isPresent();

        advance(Duration.ofHours(1).plusSeconds(1));
        e = fresh(e);
        assertThat(call(e, "GET", "/invites/lookup?code=" + good).statusCode()).isEqualTo(200);
    }

    @Test
    @DisplayName("AC-165 баталгаажаагүй акаунт урилга үүсгэх, ашиглах боломжгүй (403)")
    void unverifiedCannotInvite() {
        TestUser a = user("unv-a");
        TestUser u = user("unv-u");
        String code = ok(call(a, "POST", "/invites"), 201).path("code").asText();
        jdbc.update("UPDATE users SET email_verified_at = NULL WHERE id = ?", u.id());
        HttpResponse<String> create = call(u, "POST", "/invites");
        assertThat(create.statusCode()).isEqualTo(403);
        assertThat(code(create)).isEqualTo("AUTH_EMAIL_NOT_VERIFIED");
        HttpResponse<String> join = call(u, "POST", "/pairings", body("code", code));
        assertThat(join.statusCode()).isEqualTo(403);
        assertThat(code(join)).isEqualTo("AUTH_EMAIL_NOT_VERIFIED");
    }

    @Test
    @DisplayName("AC-66 хостой хүн урилга үүсгэх, хостой хүний кодыг ашиглах → ALREADY_PAIRED; DB unique (INV-02)")
    void alreadyPaired() {
        TestUser a = user("ap-a");
        TestUser b = user("ap-b");
        TestUser e = user("ap-e");
        String early = ok(call(a, "POST", "/invites"), 201).path("code").asText();
        UUID space = pair(a, b);

        HttpResponse<String> create = call(a, "POST", "/invites");
        assertThat(create.statusCode()).isEqualTo(409);
        assertThat(code(create)).isEqualTo("ALREADY_PAIRED");

        // Хос болоход A-гийн өмнөх урилга цуцлагдсан — хүчингүй
        assertThat(call(e, "GET", "/invites/lookup?code=" + early).statusCode()).isEqualTo(410);
        // Ямар нэг замаар хүчинтэй үлдсэн ч хостой урилгачийнх → тодорхой алдаа
        jdbc.update("UPDATE invite SET status = 'ACTIVE' WHERE code = ? AND inviter_id = ?", early, a.id());
        HttpResponse<String> join = call(e, "POST", "/pairings", body("code", early));
        assertThat(join.statusCode()).isEqualTo(409);
        assertThat(code(join)).isEqualTo("ALREADY_PAIRED");

        UUID other = UUID.randomUUID();
        jdbc.update("INSERT INTO space (id, kind) VALUES (?, 'COUPLE')", other);
        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO space_member (space_id, user_id, space_kind) VALUES (?, ?, 'COUPLE')", other, a.id()))
                .isInstanceOf(DuplicateKeyException.class);
        assertThat(space).isNotNull();
    }

    @Test
    @DisplayName("AC-171 тасалсны 14 хоногт шинэ урилга → PAIRING_COOLDOWN; дууссаны дараа амжилттай")
    void cooldownAfterBreakup() {
        TestUser a = user("cd-a");
        TestUser b = user("cd-b");
        UUID space = pair(a, b);
        jdbc.update("UPDATE space SET status = 'BREAKING', read_only_until = ? WHERE id = ?",
                Timestamp.from(clock.instant().plus(Duration.ofDays(14))), space);
        HttpResponse<String> during = call(a, "POST", "/invites");
        assertThat(during.statusCode()).isEqualTo(409);
        assertThat(code(during)).isEqualTo("PAIRING_COOLDOWN");
        assertThat(json(during).path("details").path("availableAt").asText()).isNotBlank();

        // 14 хоногийн дараа CouplePurgeJob space-ийг устгана (DD-AURA-034)
        jdbc.update("DELETE FROM space WHERE id = ?", space);
        ok(call(a, "POST", "/invites"), 201);
    }
}
