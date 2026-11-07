package mn.aura.couple.weather.app;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Ticker;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import mn.aura.couple.api.model.CityRef;
import mn.aura.couple.api.model.WeatherForecast;
import mn.aura.couple.api.model.WeatherNow;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.weather.app.OpenMeteoClient.Forecast;
import mn.aura.couple.weather.app.OpenMeteoClient.UpstreamException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * Цаг агаар (FR-3.2, FR-7.12, §8.4): байршил бүрийн таамгийг 30 мин кэшилнэ (AC-210) — координатыг
 * 2 оронтой бутархайгаар (≈ 1 км, хотын түвшин) бүлэглэнэ. Болзооны өдрийн таамаг зөвхөн ≤ 14 хоногт
 * (AC-100). Open-Meteo хүрэхгүй бол 503 `UPSTREAM_UNAVAILABLE` — UI хэсгээ нууна (AC-71).
 */
@Service
public class WeatherService {

    public static final int FORECAST_DAYS = 14;

    private final OpenMeteoClient client;
    private final TimeProvider time;
    private final Cache<String, Forecast> forecasts;
    private final Cache<String, List<CityRef>> cities;

    public WeatherService(OpenMeteoClient client, TimeProvider time) {
        this.client = client;
        this.time = time;
        // TimeProvider-ийн цагаар (E2E-д /test/clock) хугацаа дуусна
        Ticker ticker = () -> time.now().toEpochMilli() * 1_000_000L;
        this.forecasts = Caffeine.newBuilder().ticker(ticker).expireAfterWrite(client.properties().cacheTtl())
                .maximumSize(20_000).build();
        this.cities = Caffeine.newBuilder().ticker(ticker).expireAfterWrite(java.time.Duration.ofDays(1))
                .maximumSize(5_000).build();
    }

    public WeatherNow now(double lat, double lon) {
        Forecast f = forecast(lat, lon);
        return new WeatherNow(BigDecimal.valueOf(f.currentTempC()), f.currentCode(), icon(f.currentCode()),
                OpenMeteoClient.ATTRIBUTION);
    }

    /** Хамтрагчийн карт г.м. — татагдахгүй бол хоосон (хэсэг нуугдана, AC-71). */
    public Optional<WeatherNow> nowIfAvailable(double lat, double lon) {
        try {
            return Optional.of(now(lat, lon));
        } catch (ApiException e) {
            return Optional.empty();
        }
    }

    /** Тухайн өдрийн таамаг; ≤ 14 хоногоос хол эсвэл өнгөрсөн бол хоосон (AC-100). */
    public Optional<WeatherForecast> forDate(double lat, double lon, LocalDate date, ZoneId zone) {
        long days = ChronoUnit.DAYS.between(time.today(zone), date);
        if (days < 0 || days > FORECAST_DAYS) {
            return Optional.empty();
        }
        Forecast f = forecast(lat, lon);
        OpenMeteoClient.Daily d = f.daily().get(date);
        if (d == null) {
            return Optional.empty();
        }
        return Optional.of(new WeatherForecast(date, BigDecimal.valueOf(d.minC()), BigDecimal.valueOf(d.maxC()), d.code(),
                icon(d.code()), OpenMeteoClient.ATTRIBUTION));
    }

    public List<CityRef> searchCities(String query, String locale) {
        String key = (locale == null ? "mn" : locale) + ":" + query.strip().toLowerCase(Locale.ROOT);
        List<CityRef> cached = cities.getIfPresent(key);
        if (cached != null) {
            return cached;
        }
        try {
            List<CityRef> found = client.searchCities(query.strip(), locale).stream()
                    .map(c -> new CityRef(c.name(), c.countryCode().isEmpty() ? "MN" : c.countryCode(), c.lat(), c.lon(),
                            c.timezone()))
                    .toList();
            cities.put(key, found);
            return found;
        } catch (UpstreamException e) {
            throw new ApiException(ErrorCode.UPSTREAM_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);
        }
    }

    private Forecast forecast(double lat, double lon) {
        String key = String.format(Locale.ROOT, "%.2f,%.2f", lat, lon);
        Forecast cached = forecasts.getIfPresent(key);
        if (cached != null) {
            return cached;
        }
        try {
            Forecast f = client.forecast(lat, lon);
            forecasts.put(key, f);
            return f;
        } catch (UpstreamException e) {
            throw new ApiException(ErrorCode.UPSTREAM_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);
        }
    }

    /** WMO цаг агаарын код → Lucide дүрсний нэр (mobile `WeatherIcon`). */
    public static String icon(int code) {
        if (code == 0) {
            return "sun";
        }
        if (code <= 2) {
            return "cloud-sun";
        }
        if (code == 3) {
            return "cloud";
        }
        if (code == 45 || code == 48) {
            return "cloud-fog";
        }
        if ((code >= 71 && code <= 77) || code == 85 || code == 86) {
            return "snowflake";
        }
        if (code >= 95) {
            return "cloud-lightning";
        }
        if (code >= 51 && code <= 82) {
            return "cloud-rain";
        }
        return "cloud";
    }
}
