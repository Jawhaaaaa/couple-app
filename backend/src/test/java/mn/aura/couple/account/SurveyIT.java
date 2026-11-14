package mn.aura.couple.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SurveyIT extends AbstractSpaceIT {

    @Test
    @DisplayName("AC-207 GAP-17 санал асуулга 30 хоногт ≤ 1: хариулсны дараа due=false, давтан 409 SURVEY_NOT_DUE, 30 хоногийн дараа дахин")
    void thirtyDayFrequency() {
        clock.set(Instant.parse("2026-11-10T02:00:00Z"));
        TestUser u = user("survey");
        assertThat(ok(call(u, "GET", "/me/survey"), 200).path("due").asBoolean()).isTrue();

        assertThat(call(u, "POST", "/me/survey", body("score", 6)).statusCode()).isEqualTo(400);
        assertThat(call(u, "POST", "/me/survey", body("score", 0)).statusCode()).isEqualTo(400);
        ok(call(u, "POST", "/me/survey", body("score", 5)), 204);
        assertThat(ok(call(u, "GET", "/me/survey"), 200).path("due").asBoolean()).isFalse();
        var again = call(u, "POST", "/me/survey", body("score", 3));
        assertThat(again.statusCode()).isEqualTo(409);
        assertThat(code(again)).isEqualTo("SURVEY_NOT_DUE");

        advance(Duration.ofDays(29));
        u = fresh(u);
        assertThat(ok(call(u, "GET", "/me/survey"), 200).path("due").asBoolean()).isFalse();
        advance(Duration.ofDays(1).plusMinutes(1));
        u = fresh(u);
        assertThat(ok(call(u, "GET", "/me/survey"), 200).path("due").asBoolean()).isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM survey_response WHERE user_id = ?", Integer.class, u.id()))
                .isEqualTo(1);
    }

    @Test
    @DisplayName("AC-207 алгасах (score=null) нь 30 хоногийн цонхыг эхлүүлнэ, онооны нэгтгэлд орохгүй; нүүрэнд due үед л гарна")
    void skip() {
        TestUser u = user("survey-skip");
        TestUser p = user("survey-skip-p");
        pair(u, p);
        assertThat(ok(call(u, "GET", "/dashboard"), 200).path("survey").path("due").asBoolean()).isTrue();
        ok(call(u, "POST", "/me/survey", body("score", null)), 204);
        assertThat(ok(call(u, "GET", "/me/survey"), 200).path("due").asBoolean()).isFalse();
        assertThat(ok(call(u, "GET", "/dashboard"), 200).has("survey")).isFalse();
        assertThat(jdbc.queryForObject("SELECT score FROM survey_response WHERE user_id = ?", Integer.class, u.id())).isNull();
    }
}
