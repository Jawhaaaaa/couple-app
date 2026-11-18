package mn.aura.itprobe;

import mn.aura.couple.common.observability.LogRedaction;
import mn.aura.couple.common.observability.Sensitive;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Зөвхөн тестэд: `/it/**` endpoint (лог ба алдааны тайланг шалгах). `@Import`-оор л орно —
 * `mn.aura.couple`-аас гадуурх багцад тул component scan-д ордоггүй (бусад context-д харагдахгүй).
 */
@TestConfiguration(proxyBeanMethods = false)
public class ObservabilityProbe {

    /** Хэрэглэгчийн хувийн текст — `@Sensitive` (AC-196). */
    public record SecretNote(String title, @Sensitive String text) {
        @Override
        public String toString() {
            return LogRedaction.toString(this);
        }
    }

    /** `@Import` нь configuration-ийн дотоод `@RestController`-ыг өөрөө бүртгэнэ. */
    @RestController
    public static class ProbeController {
        private static final Logger log = LoggerFactory.getLogger(ProbeController.class);

        @PostMapping("/it/notes")
        public Map<String, Object> note(@RequestBody SecretNote note) {
            log.info("Тэмдэглэл хүлээн авлаа: {}", note);
            return Map.of("ok", true);
        }

        @GetMapping("/it/boom")
        public void boom(@RequestParam String marker) {
            throw new IllegalStateException("туршилтын алдаа " + marker);
        }
    }

    @Bean
    @Order(0)
    SecurityFilterChain probeChain(HttpSecurity http) throws Exception {
        return http.securityMatcher("/it/**")
                .csrf(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(a -> a.anyRequest().permitAll())
                .build();
    }
}
