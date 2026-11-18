package mn.aura.couple.weather.api;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import mn.aura.couple.api.GeoApi;
import mn.aura.couple.api.WeatherApi;
import mn.aura.couple.api.model.CityRef;
import mn.aura.couple.api.model.GetWeather200Response;
import mn.aura.couple.api.model.Locale;
import mn.aura.couple.common.space.SpaceAccessGuard;
import mn.aura.couple.weather.app.WeatherService;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Weather` ба `Geo` tag (T-28, §8.4). */
@RestController
public class WeatherController implements WeatherApi, GeoApi {

    private final WeatherService weather;
    private final JdbcTemplate jdbc;

    public WeatherController(WeatherService weather, JdbcTemplate jdbc) {
        this.weather = weather;
        this.jdbc = jdbc;
    }

    @Override
    public ResponseEntity<GetWeather200Response> getWeather(BigDecimal lat, BigDecimal lon, LocalDate date) {
        if (date == null) {
            return ResponseEntity.ok(weather.now(lat.doubleValue(), lon.doubleValue()));
        }
        ZoneId zone = ZoneId.of(jdbc.queryForObject("SELECT timezone FROM users WHERE id = ?", String.class,
                SpaceAccessGuard.currentUserId()));
        return weather.forDate(lat.doubleValue(), lon.doubleValue(), date, zone)
                .<ResponseEntity<GetWeather200Response>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @Override
    public ResponseEntity<List<CityRef>> searchCities(String q, Locale locale) {
        SpaceAccessGuard.currentUserId();
        return ResponseEntity.ok(weather.searchCities(q, locale == null ? "mn" : locale.getValue()));
    }
}
