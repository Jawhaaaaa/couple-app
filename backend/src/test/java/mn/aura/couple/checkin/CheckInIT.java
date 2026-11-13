package mn.aura.couple.checkin;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class CheckInIT extends AbstractSpaceIT {

    @Test
    @DisplayName("AC-46 AC-183 хуваалцаагүй check-in B-гийн endpoint-д 0; анхдагч унтраастай; автомат хуваалцахыг асаасны дараа хуваалцагдана")
    void privateUnlessShared() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("ci-a");
        TestUser b = user("ci-b");
        pair(a, b);
        JsonNode mine = ok(call(a, "PUT", "/checkins/today", body("level", 2, "note", "Ядарсан өдөр")), 200);
        assertThat(mine.path("shared").asBoolean()).isFalse();
        assertThat(mine.path("localDate").asText()).isEqualTo("2026-11-07");
        JsonNode forB = ok(call(b, "GET", "/checkins"), 200);
        assertThat(forB.path("partner").size()).isZero();
        assertThat(forB.toString()).doesNotContain("Ядарсан");
        assertThat(ok(call(a, "GET", "/checkins"), 200).path("mine").size()).isEqualTo(1);

        ok(call(b, "PATCH", "/me/preferences", body("checkinAutoShare", true)), 200);
        assertThat(ok(call(b, "PUT", "/checkins/today", body("level", 5)), 200).path("shared").asBoolean()).isTrue();
        JsonNode forA = ok(call(a, "GET", "/checkins"), 200);
        assertThat(forA.path("partner").size()).isEqualTo(1);
        assertThat(forA.path("partner").get(0).path("level").asInt()).isEqualTo(5);

        // A тухайн өдрийнхийг хуваалцвал B харна
        ok(call(a, "PATCH", "/checkins/2026-11-07", body("level", 3, "shared", true)), 200);
        assertThat(ok(call(b, "GET", "/checkins"), 200).path("partner").get(0).path("level").asInt()).isEqualTo(3);
    }

    @Test
    @DisplayName("AC-114 өөрийн бүсийн өдөрт нэг: хоёр дахь нь засвар; өнөөдрийнх засагдана; өчигдрийнх 403 CHECKIN_PAST_DAY")
    void oncePerDayNoPast() {
        clock.set(Instant.parse("2026-11-07T15:30:00Z")); // УБ 23:30, Токио 11-08 00:30
        TestUser a = user("cio-a");
        jdbc.update("UPDATE users SET timezone = 'Asia/Tokyo' WHERE id = ?", a.id());
        assertThat(ok(call(a, "PUT", "/checkins/today", body("level", 4)), 200).path("localDate").asText()).isEqualTo("2026-11-08");
        assertThat(ok(call(a, "PUT", "/checkins/today", body("level", 1)), 200).path("level").asInt()).isEqualTo(1);
        JsonNode series = ok(call(a, "GET", "/checkins?from=2026-11-01&to=2026-11-30"), 200);
        assertThat(series.path("mine").size()).isEqualTo(1);
        assertThat(ok(call(a, "PATCH", "/checkins/2026-11-08", body("level", 2)), 200).path("level").asInt()).isEqualTo(2);

        clock.set(Instant.parse("2026-11-08T15:05:00Z")); // Токио 11-09
        a = fresh(a);
        assertThat(code(call(a, "PATCH", "/checkins/2026-11-08", body("level", 5)))).isEqualTo("CHECKIN_PAST_DAY");
        assertThat(call(a, "PATCH", "/checkins/2026-11-09", body("level", 5)).statusCode()).isEqualTo(404);
        assertThat(call(a, "PUT", "/checkins/today", body("level", 9)).statusCode()).isEqualTo(400);
    }
}
