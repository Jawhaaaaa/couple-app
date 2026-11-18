package mn.aura.couple.weather.app;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Open-Meteo-ийн хаяг ба кэш (PAR-AURA-010, GAP-07). E2E/IT-д mock руу чиглүүлнэ. */
@ConfigurationProperties(prefix = "aura.weather")
public record WeatherProperties(
        @DefaultValue("https://api.open-meteo.com") String baseUrl,
        @DefaultValue("https://geocoding-api.open-meteo.com") String geocodingBaseUrl,
        @DefaultValue("30m") Duration cacheTtl) {
}
