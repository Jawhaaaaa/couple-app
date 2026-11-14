package mn.aura.couple.weather.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Open-Meteo (§8.4, түлхүүргүй, CC BY 4.0): цаг агаарын таамаг ба geocoding. Хаяг нь тохиргоогоор
 * (E2E/IT-д mock, GAP-07-д prod-ийн өөр provider). Алдаа → `UpstreamException` (дуудагч 503 болгоно).
 */
@Component
public class OpenMeteoClient {

    public static final String ATTRIBUTION = "Open-Meteo (CC BY 4.0)";

    /** Нэг байршлын одоогийн ба өдөр тутмын (16 хоног) таамаг. */
    public record Forecast(double currentTempC, int currentCode, Map<LocalDate, Daily> daily) {
    }

    public record Daily(double minC, double maxC, int code) {
    }

    public record City(String name, String countryCode, BigDecimal lat, BigDecimal lon, String timezone) {
    }

    public static class UpstreamException extends RuntimeException {
        public UpstreamException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).build();

    private final WeatherProperties properties;
    private final ObjectMapper mapper;

    public OpenMeteoClient(WeatherProperties properties, ObjectMapper mapper) {
        this.properties = properties;
        this.mapper = mapper;
    }

    public WeatherProperties properties() {
        return properties;
    }

    public Forecast forecast(double lat, double lon) {
        String url = strip(properties.baseUrl()) + "/v1/forecast?latitude=" + fmt(lat) + "&longitude=" + fmt(lon)
                + "&current=temperature_2m,weather_code"
                + "&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=16";
        JsonNode json = get(url);
        JsonNode current = json.path("current");
        Map<LocalDate, Daily> daily = new LinkedHashMap<>();
        JsonNode d = json.path("daily");
        for (int i = 0; i < d.path("time").size(); i++) {
            daily.put(LocalDate.parse(d.path("time").path(i).asText()), new Daily(
                    d.path("temperature_2m_min").path(i).asDouble(), d.path("temperature_2m_max").path(i).asDouble(),
                    d.path("weather_code").path(i).asInt()));
        }
        if (!current.has("temperature_2m")) {
            throw new UpstreamException("Open-Meteo хариунд current алга", null);
        }
        return new Forecast(current.path("temperature_2m").asDouble(), current.path("weather_code").asInt(), daily);
    }

    /**
     * Open-Meteo-гийн `language=mn` нь хотын нэрийг уламжлалт монгол бичгээр («ᠳᠠᠷᠬᠠᠨ») буцааж, кирилл
     * («Дархан») хайлтыг олдоггүй (2026-11-14-нд шалгав). Монгол UI-д кирилл нэр хэрэгтэй тул `ru`
     * (Дархан, Улаанбаатар, Токио — монгол кирилл бичлэгтэй ижил).
     */
    static String geocodingLanguage(String locale) {
        return "en".equals(locale) ? "en" : "ru";
    }

    public List<City> searchCities(String query, String locale) {
        String url = strip(properties.geocodingBaseUrl()) + "/v1/search?name="
                + URLEncoder.encode(query, StandardCharsets.UTF_8) + "&count=10&format=json&language="
                + geocodingLanguage(locale);
        List<City> out = new ArrayList<>();
        for (JsonNode r : get(url).path("results")) {
            if (!r.hasNonNull("latitude") || !r.hasNonNull("longitude") || !r.hasNonNull("timezone")) {
                continue;
            }
            out.add(new City(r.path("name").asText(), r.path("country_code").asText("").toUpperCase(Locale.ROOT),
                    r.path("latitude").decimalValue(), r.path("longitude").decimalValue(), r.path("timezone").asText()));
        }
        return out;
    }

    private JsonNode get(String url) {
        try {
            HttpResponse<String> r = HTTP.send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(6))
                    .header("Accept", "application/json").GET().build(), HttpResponse.BodyHandlers.ofString());
            if (r.statusCode() != 200) {
                throw new UpstreamException("Open-Meteo HTTP " + r.statusCode(), null);
            }
            return mapper.readTree(r.body());
        } catch (IOException e) {
            throw new UpstreamException("Open-Meteo хүрэхгүй байна", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new UpstreamException("Open-Meteo хүсэлт тасарсан", e);
        }
    }

    private static String fmt(double v) {
        return String.format(Locale.ROOT, "%.4f", v);
    }

    private static String strip(String s) {
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }
}
