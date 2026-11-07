package mn.aura.couple.dashboard;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import mn.aura.couple.AbstractSpaceIT;
import mn.aura.couple.common.geo.GeoMath;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class DashboardIT extends AbstractSpaceIT {

    private static final String TOKYO = "{\"name\":\"Tokyo\",\"countryCode\":\"JP\",\"lat\":35.6895,\"lon\":139.6917,\"timezone\":\"Asia/Tokyo\"}";
    private static final String UB = "{\"name\":\"Улаанбаатар\",\"countryCode\":\"MN\",\"lat\":47.9077,\"lon\":106.8832,\"timezone\":\"Asia/Ulaanbaatar\"}";

    @AfterEach
    void meteoUp() {
        METEO.fail(false);
    }

    @Test
    @DisplayName("AC-13 AC-69 эхэлсэн 2024-10-24 → 2026-11-07-нд 745, «2 жил 0 сар 14 өдөр», хоёр бүсэд ижил")
    void counter() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("db-a");
        TestUser b = user("db-b");
        jdbc.update("UPDATE users SET timezone = 'America/New_York' WHERE id = ?", b.id());
        pair(a, b);
        JsonNode pending = ok(call(a, "GET", "/dashboard"), 200).path("counter");
        assertThat(pending.path("confirmed").asBoolean()).isFalse();
        ok(call(a, "PUT", "/couple/start-date", body("date", "2024-10-24")), 200);
        ok(call(b, "PUT", "/couple/start-date", body("date", "2024-10-24")), 200);

        for (TestUser u : new TestUser[] {a, b}) {
            JsonNode c = ok(call(u, "GET", "/dashboard"), 200).path("counter");
            assertThat(c.path("days").asInt()).isEqualTo(745);
            assertThat(c.path("confirmed").asBoolean()).isTrue();
            assertThat(c.path("breakdown").path("years").asInt()).isEqualTo(2);
            assertThat(c.path("breakdown").path("months").asInt()).isZero();
            assertThat(c.path("breakdown").path("days").asInt()).isEqualTo(14);
        }
    }

    @Test
    @DisplayName("AC-14 AC-71 AC-74 хамтрагч Токиод: «+1 цаг», хотын цаг агаар, ≈ 3 000 км, уулзалт хүртэл")
    void partnerCard() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("dbp-a");
        TestUser b = user("dbp-b");
        pair(a, b);
        ok(call(a, "PATCH", "/me", "{\"city\":" + UB + ",\"version\":" + version(a) + "}"), 200);
        ok(call(b, "PATCH", "/me", "{\"timezone\":\"Asia/Tokyo\",\"city\":" + TOKYO + ",\"version\":" + version(b) + "}"), 200);
        ok(call(a, "PUT", "/couple/next-meetup", body("at", "2026-12-24T10:00:00Z")), 200);

        JsonNode d = ok(call(a, "GET", "/dashboard?tz=Asia/Ulaanbaatar"), 200);
        assertThat(d.path("me").path("offsetFromMeMinutes").asInt()).isZero();
        assertThat(d.path("partner").path("offsetFromMeMinutes").asInt()).isEqualTo(60);
        assertThat(d.path("partner").path("utcOffsetMinutes").asInt()).isEqualTo(540);
        assertThat(d.path("partner").path("localTime").asText()).startsWith("2026-11-07T13:00");
        assertThat(d.path("partner").path("weather").path("tempC").asDouble()).isEqualTo(-18.4);
        assertThat(d.path("longDistance").path("distanceKm").asDouble()).isCloseTo(3000, within(30.0));
        assertThat(d.path("longDistance").path("nextMeetupAt").asText()).startsWith("2026-12-24T10:00");

        METEO.fail(true);
        // Кэшгүй шинэ координат — татагдахгүй бол цаг агаарын хэсэг л нуугдана
        jdbc.update("UPDATE users SET city_lat = 35.01, city_lon = 135.77 WHERE id = ?", b.id());
        JsonNode down = ok(call(a, "GET", "/dashboard"), 200);
        assertThat(down.path("partner").has("weather")).isFalse();
        assertThat(down.path("partner").path("name").asText()).isNotBlank();
    }

    @Test
    @DisplayName("AC-74 агаарын шугамын зай Улаанбаатар–Токио ≈ 3 000 км (±1%)")
    void distance() {
        assertThat(GeoMath.distanceKm(47.9077, 106.8832, 35.6895, 139.6917)).isCloseTo(3009, within(30.0));
    }

    private long version(TestUser u) {
        return jdbc.queryForObject("SELECT version FROM users WHERE id = ?", Long.class, u.id());
    }
}
