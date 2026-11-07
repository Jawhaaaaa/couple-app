package mn.aura.couple.common;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * Алдааны кодын хүнд уншигдах мессеж (mn/en). Эх нь `mobile/src/content/errors.json`
 * (build үед classpath `content/errors.json` болж хуулагдана — T-14). Файл эсвэл мөр
 * байхгүй бол кодын нэрийг буцаана: client кодыг шалгадаг тул мессеж нь зөвхөн туслах.
 */
@Component
public class ErrorMessages {

    public static final String RESOURCE = "content/errors.json";
    private static final Logger log = LoggerFactory.getLogger(ErrorMessages.class);

    private final Map<String, Map<String, String>> byCode;

    @Autowired
    public ErrorMessages(ObjectMapper objectMapper) {
        this(objectMapper, new ClassPathResource(RESOURCE));
    }

    ErrorMessages(ObjectMapper objectMapper, Resource resource) {
        this.byCode = load(objectMapper, resource);
    }

    private static Map<String, Map<String, String>> load(ObjectMapper mapper, Resource resource) {
        Map<String, Map<String, String>> result = new HashMap<>();
        if (!resource.exists()) {
            log.info("{} олдсонгүй — алдааны мессеж кодын нэрээр буцна", RESOURCE);
            return result;
        }
        try (InputStream in = resource.getInputStream()) {
            for (JsonNode item : mapper.readTree(in).path("items")) {
                String id = item.path("id").asText(null);
                if (id == null) {
                    continue;
                }
                Map<String, String> texts = new HashMap<>();
                item.fields().forEachRemaining(e -> {
                    if (!"id".equals(e.getKey()) && e.getValue().isTextual()) {
                        texts.put(e.getKey(), e.getValue().asText());
                    }
                });
                result.put(id, texts);
            }
        } catch (IOException e) {
            log.warn("{} уншиж чадсангүй — кодын нэрээр буцна", RESOURCE, e);
        }
        return result;
    }

    /** `Accept-Language`-ийн утгаас mn/en сонгоно. Анхдагч mn. */
    public static String languageOf(String acceptLanguage) {
        if (!StringUtils.hasText(acceptLanguage)) {
            return "mn";
        }
        try {
            for (Locale.LanguageRange range : Locale.LanguageRange.parse(acceptLanguage)) {
                String lang = range.getRange().toLowerCase(Locale.ROOT);
                if (lang.startsWith("en")) {
                    return "en";
                }
                if (lang.startsWith("mn")) {
                    return "mn";
                }
            }
        } catch (IllegalArgumentException ignored) {
            // Буруу толгой — анхдагч хэл
        }
        return "mn";
    }

    public String message(ErrorCode code, String acceptLanguage) {
        return message(code.name(), acceptLanguage);
    }

    public String message(String code, String acceptLanguage) {
        Map<String, String> texts = byCode.get(code);
        if (texts == null) {
            return code;
        }
        String text = texts.get(languageOf(acceptLanguage));
        if (!StringUtils.hasText(text)) {
            text = texts.getOrDefault("mn", texts.get("en"));
        }
        return StringUtils.hasText(text) ? text : code;
    }
}
