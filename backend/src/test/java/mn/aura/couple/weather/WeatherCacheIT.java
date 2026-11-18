package mn.aura.couple.weather;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class WeatherCacheIT extends AbstractSpaceIT {

    @AfterEach
    void healthy() {
        METEO.fail(false);
    }

    @Test
    @DisplayName("AC-210 нэг хотын цаг агаарыг 30 мин кэшилнэ — давтан хүсэлт upstream руу явахгүй")
    void cachedPerCity() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("wx-a");
        // Бусад тестийн кэшээс хамаарахгүй өвөрмөц координат
        String q = "/weather?lat=12.3456&lon=98.7654";
        long before = upstreamCalls("latitude=12.34");
        JsonNode now = ok(call(a, "GET", q), 200);
        assertThat(now.path("tempC").asDouble()).isEqualTo(-18.4);
        assertThat(now.path("icon").asText()).isEqualTo("snowflake");
        assertThat(now.path("attribution").asText()).contains("Open-Meteo");
        ok(call(a, "GET", "/weather?lat=12.3461&lon=98.7651"), 200);
        assertThat(upstreamCalls("latitude=12.34")).isEqualTo(before + 1);

        advance(Duration.ofMinutes(31));
        a = fresh(a);
        ok(call(a, "GET", q), 200);
        assertThat(upstreamCalls("latitude=12.34")).isEqualTo(before + 2);
    }

    @Test
    @DisplayName("AC-100 болзооны өдөр ≤ 14 хоногт таамаг, хол бол 204")
    void forecastWindow() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        METEO.firstDay(LocalDate.parse("2026-11-07"));
        TestUser a = user("wxf-a");
        JsonNode f = ok(call(a, "GET", "/weather?lat=21.0&lon=105.8&date=2026-11-20"), 200);
        assertThat(f.path("date").asText()).isEqualTo("2026-11-20");
        assertThat(f.path("tempMinC").asDouble()).isEqualTo(-26.0);
        assertThat(call(a, "GET", "/weather?lat=21.0&lon=105.8&date=2026-11-22").statusCode()).isEqualTo(204);
    }

    @Test
    @DisplayName("AC-71 Open-Meteo хүрэхгүй бол 503 UPSTREAM_UNAVAILABLE (UI хэсгээ нууна)")
    void upstreamDown() {
        TestUser a = user("wxd-a");
        METEO.fail(true);
        var r = call(a, "GET", "/weather?lat=1.11&lon=2.22");
        assertThat(r.statusCode()).isEqualTo(503);
        assertThat(code(r)).isEqualTo("UPSTREAM_UNAVAILABLE");
        assertThat(call(a, "GET", "/geo/cities?q=zzz-down").statusCode()).isEqualTo(503);
    }

    @Test
    @DisplayName("AC-62 хотын хайлт (geocoding) нэр, улс, координат, бүстэй")
    void citySearch() {
        TestUser a = user("geo-a");
        JsonNode cities = ok(call(a, "GET", "/geo/cities?q=tokyo&locale=en"), 200);
        assertThat(cities.path(0).path("name").asText()).isEqualTo("Tokyo");
        assertThat(cities.path(0).path("countryCode").asText()).isEqualTo("JP");
        assertThat(cities.path(0).path("timezone").asText()).isEqualTo("Asia/Tokyo");
    }

    private static long upstreamCalls(String fragment) {
        return METEO.requests().stream().filter(r -> r.contains(fragment)).count();
    }
}
