package mn.aura.couple.question.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.UUID;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * Өдрийн асуултын сонголт (DD-AURA-021, Б.1). Нэг эх `mobile/src/content/questions.json` (classpath).
 * Хос тутмын тогтвортой seed (`space.id`)-тэй permutation: эхний 30 хосын өдрийн ≥ 70% нь depth 1
 * (21 нь depth 1, 9 нь бусад, холилдсон), дараа нь үлдсэн нь. Сан дууссаны дараа эхнээс нь давтана.
 */
@Component
public class QuestionPicker {

    public static final String RESOURCE = "content/questions.json";
    static final int WARMUP_DAYS = 30;
    static final int WARMUP_DEPTH1 = 21;

    public record Question(String id, String category, int depth, String mn, String en) {
    }

    private final Map<String, Question> byId = new LinkedHashMap<>();

    public QuestionPicker(ObjectMapper mapper) {
        try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
            for (JsonNode q : mapper.readTree(in).path("items")) {
                Question question = new Question(q.path("id").asText(), q.path("category").asText(),
                        q.path("depth").asInt(1), q.path("mn").asText(), q.path("en").asText());
                byId.put(question.id(), question);
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Асуултын сан (" + RESOURCE + ") уншигдсангүй", e);
        }
        if (byId.size() < WARMUP_DAYS) {
            throw new IllegalStateException("Асуултын сан хэт бага: " + byId.size());
        }
    }

    public Optional<Question> find(String id) {
        return Optional.ofNullable(byId.get(id));
    }

    /** Хосын `dayIndex` дахь (холбогдсон өдрөөс хойш, 0-ээс) асуулт — хоёр хүнд ижил (AC-75). */
    public Question pick(UUID spaceId, long dayIndex) {
        List<Question> order = order(spaceId);
        int i = (int) Math.floorMod(dayIndex, (long) order.size());
        return order.get(i);
    }

    /** Хосын бүтэн дараалал (тест ба шалгалтад). */
    public List<Question> order(UUID spaceId) {
        Random random = new Random(spaceId.getMostSignificantBits() ^ spaceId.getLeastSignificantBits());
        List<Question> depth1 = new ArrayList<>();
        List<Question> deeper = new ArrayList<>();
        // Тогтвортой эхлэл: ID-аар эрэмбэлсний дараа холино (файлын дарааллаас хамаарахгүй)
        byId.values().stream().sorted((a, b) -> a.id().compareTo(b.id()))
                .forEach(q -> (q.depth() <= 1 ? depth1 : deeper).add(q));
        Collections.shuffle(depth1, random);
        Collections.shuffle(deeper, random);
        int firstDeep = Math.min(WARMUP_DAYS - WARMUP_DEPTH1, deeper.size());
        int firstShallow = Math.min(WARMUP_DAYS - firstDeep, depth1.size());
        List<Question> warmup = new ArrayList<>(depth1.subList(0, firstShallow));
        warmup.addAll(deeper.subList(0, firstDeep));
        Collections.shuffle(warmup, random);
        List<Question> rest = new ArrayList<>(depth1.subList(firstShallow, depth1.size()));
        rest.addAll(deeper.subList(firstDeep, deeper.size()));
        Collections.shuffle(rest, random);
        List<Question> all = new ArrayList<>(warmup);
        all.addAll(rest);
        return all;
    }
}
