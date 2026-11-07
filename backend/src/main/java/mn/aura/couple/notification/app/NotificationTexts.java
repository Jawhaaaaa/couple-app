package mn.aura.couple.notification.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * Мэдэгдлийн бичвэр (Б.3) — нэг эх `mobile/src/content/notifications.json` (classpath `content/`,
 * DD-AURA-020). Төрөл бүрд ≥ 3 хувилбар — санамсаргүй сонгогдож давтагдах мэдрэмжгүй.
 * Хувилбарын ID хадгалагдаж, унших үед хэрэглэгчийн одоогийн хэлээр рендэрлэнэ.
 */
@Component
public class NotificationTexts {

    public static final String RESOURCE = "content/notifications.json";

    public record Text(String title, String body) {
    }

    private record Variant(String id, String type, Map<String, Text> byLocale) {
    }

    private final Map<String, Variant> byId = new HashMap<>();
    private final Map<String, List<Variant>> byType = new HashMap<>();
    private final SecureRandom random = new SecureRandom();

    public NotificationTexts(ObjectMapper mapper) {
        ClassPathResource resource = new ClassPathResource(RESOURCE);
        try (InputStream in = resource.getInputStream()) {
            for (JsonNode item : mapper.readTree(in).path("items")) {
                Map<String, Text> locales = new LinkedHashMap<>();
                for (String locale : List.of("mn", "en")) {
                    JsonNode t = item.path(locale);
                    locales.put(locale, new Text(t.path("title").asText(), t.path("body").asText()));
                }
                Variant v = new Variant(item.path("id").asText(), item.path("type").asText(), locales);
                byId.put(v.id(), v);
                byType.computeIfAbsent(v.type(), k -> new ArrayList<>()).add(v);
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Мэдэгдлийн бичвэр (" + RESOURCE + ") уншигдсангүй", e);
        }
    }

    public boolean knows(String type) {
        return byType.containsKey(type);
    }

    /** Төрлийн санамсаргүй хувилбарын ID; бичвэргүй төрөл → `IllegalArgumentException` (кодын алдаа). */
    public String pickVariant(String type) {
        List<Variant> variants = byType.get(type);
        if (variants == null || variants.isEmpty()) {
            throw new IllegalArgumentException("Мэдэгдлийн бичвэргүй төрөл: " + type);
        }
        return variants.get(random.nextInt(variants.size())).id();
    }

    public Text render(String variantId, String locale, Map<String, String> params) {
        Variant v = Optional.ofNullable(byId.get(variantId))
                .orElseThrow(() -> new IllegalArgumentException("Мэдэгдлийн хувилбар алга: " + variantId));
        Text t = v.byLocale().getOrDefault(locale, v.byLocale().get("mn"));
        return new Text(fill(t.title(), params), fill(t.body(), params));
    }

    /**
     * «Агуулга нуух» үед (FR-13.3, AC-49) push-д явах ерөнхий бичвэр — нэр, гарчиг, текст огт орохгүй.
     */
    public static Text hidden(String type, String locale) {
        boolean en = "en".equals(locale);
        if ("MESSAGE_NEW".equals(type)) {
            return new Text("Aura", en ? "New message" : "Шинэ мессеж");
        }
        return new Text("Aura", en ? "You have a new notification" : "Шинэ мэдэгдэл ирлээ");
    }

    /** DND дууссаны дараах нэгтгэсэн нэг push (AC-48). */
    public static Text merged(int count, String locale) {
        boolean en = "en".equals(locale);
        return new Text("Aura", en ? count + " new notifications while you rested" : "Амарч байхад " + count + " мэдэгдэл ирсэн");
    }

    static String fill(String template, Map<String, String> params) {
        String out = template;
        for (Map.Entry<String, String> e : params.entrySet()) {
            out = out.replace("{" + e.getKey() + "}", e.getValue() == null ? "" : e.getValue());
        }
        return out;
    }
}
