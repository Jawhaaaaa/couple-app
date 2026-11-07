package mn.aura.couple.common.web;

import java.util.List;
import mn.aura.couple.common.config.AuraProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * CORS зөвхөн `/api/**`-д, зөвхөн `aura.cors.allowed-origins`-д заасан origin-д (AC-195).
 * Credential (refresh cookie) зөвшөөрнө тул `*` хэзээ ч ашиглахгүй. Actuator CORS-гүй (LLD §4.5).
 */
@Configuration(proxyBeanMethods = false)
public class CorsConfig {

    @Bean
    CorsConfigurationSource corsConfigurationSource(AuraProperties properties) {
        List<String> origins = properties.cors().allowedOrigins().stream()
                .map(String::trim)
                .filter(o -> !o.isEmpty() && !"*".equals(o))
                .toList();
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        if (origins.isEmpty()) {
            return source;
        }
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(origins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setExposedHeaders(List.of("X-Trace-Id", "Retry-After", "ETag", "Location"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }
}
