package mn.aura.couple.plan.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import mn.aura.couple.api.model.BudgetBand;
import mn.aura.couple.api.model.IdeaCategory;
import mn.aura.couple.api.model.IdeaSetting;
import mn.aura.couple.api.model.LibraryIdea;
import mn.aura.couple.api.model.Season;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

/**
 * Санааны сан (FR-7.11, DD-AURA-020). Нэг эх `mobile/src/content/date-ideas.json` (classpath `content/`) —
 * хуулбар хийхгүй. Шүүлт: улирал, төсвийн зурвас, гэр/гадаа, алс зай, ангилал (AC-99). Бичвэр нь хэрэглэгчийн
 * хэлээр (`mn`/`en`); хосын жагсаалтад авахад `DateIdeaService.adopt` хуулбар үүсгэнэ — сан өөрчлөгдөхгүй.
 */
@Service
public class IdeaLibraryService {

    public static final String RESOURCE = "content/date-ideas.json";

    public record Item(String id, IdeaCategory category, BudgetBand band, List<Season> seasons, IdeaSetting setting,
                       boolean longDistance, int durationMinutes, String preparation,
                       String mnTitle, String mnDescription, String enTitle, String enDescription) {

        public String title(String locale) {
            return "en".equals(locale) ? enTitle : mnTitle;
        }

        public String description(String locale) {
            return "en".equals(locale) ? enDescription : mnDescription;
        }
    }

    /** `GET /idea-library`-ийн шүүлт; null талбар = шүүхгүй. */
    public record Filter(Season season, BudgetBand budget, IdeaSetting setting, Boolean longDistance,
                         IdeaCategory category) {
    }

    private final Map<String, Item> byId = new LinkedHashMap<>();

    public IdeaLibraryService(ObjectMapper mapper) {
        try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
            for (JsonNode n : mapper.readTree(in).path("items")) {
                List<Season> seasons = new ArrayList<>();
                n.path("seasons").forEach(s -> seasons.add(Season.fromValue(s.asText())));
                Item item = new Item(n.path("id").asText(), IdeaCategory.fromValue(n.path("category").asText()),
                        BudgetBand.fromValue(n.path("budgetBand").asText()), List.copyOf(seasons),
                        IdeaSetting.fromValue(n.path("setting").asText()), n.path("longDistance").asBoolean(false),
                        n.path("durationMinutes").asInt(0), n.path("preparation").asText(""),
                        n.path("mn").path("title").asText(), n.path("mn").path("description").asText(),
                        n.path("en").path("title").asText(), n.path("en").path("description").asText());
                byId.put(item.id(), item);
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Санааны сан (" + RESOURCE + ") уншигдсангүй", e);
        }
        if (byId.isEmpty()) {
            throw new IllegalStateException("Санааны сан хоосон");
        }
    }

    public List<Item> items() {
        return List.copyOf(byId.values());
    }

    public Optional<Item> find(String id) {
        return Optional.ofNullable(id == null ? null : byId.get(id));
    }

    public List<LibraryIdea> list(Filter f, String locale) {
        return byId.values().stream().filter(i -> matches(i, f)).map(i -> toDto(i, locale)).toList();
    }

    static boolean matches(Item i, Filter f) {
        return (f.season() == null || i.seasons().contains(f.season()))
                && (f.budget() == null || i.band() == f.budget())
                && (f.setting() == null || i.setting() == f.setting())
                && (f.longDistance() == null || !f.longDistance() || i.longDistance())
                && (f.category() == null || i.category() == f.category());
    }

    public LibraryIdea toDto(Item i, String locale) {
        return new LibraryIdea(i.id(), i.title(locale), i.description(locale), i.category(), i.band(), i.seasons(),
                i.setting(), i.longDistance(), i.durationMinutes(), i.preparation());
    }

    /**
     * Төсвийн зурвасын дээд хязгаар ₮ (санамсаргүй сонголтын `maxBudget`-тэй харьцуулна). `OVER_150K` нь
     * хязгааргүй — `maxBudget` өгөгдсөн үед хэзээ ч тохирохгүй.
     */
    public static long upperBound(BudgetBand band) {
        return switch (band) {
            case FREE -> 0L;
            case UPTO_50_K -> 50_000L;
            case _50_K_150_K -> 150_000L;
            case OVER_150_K -> Long.MAX_VALUE;
        };
    }
}
