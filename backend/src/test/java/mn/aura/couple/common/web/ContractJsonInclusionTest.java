package mn.aura.couple.common.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import mn.aura.couple.api.model.CoupleMyView;
import mn.aura.couple.api.model.Dashboard;
import mn.aura.couple.api.model.MemoryPage;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.json.JsonTest;
import org.springframework.core.io.ClassPathResource;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;

/**
 * DEV_TEST согог 1: `contracts/openapi.yaml`-ийн `required` талбар `null` утгатай ч хариунд байх ёстой,
 * `required` биш талбар `null` үед хасагдана. Апп-ын жинхэнэ ObjectMapper (`application.yml` + модуль)-аар
 * гэрээний бүх нэрлэсэн schema-гийн хоосон DTO-г бичиж, түлхүүрүүдийг гэрээтэй тулгана.
 */
@JsonTest
class ContractJsonInclusionTest {

    private static final String MODEL_PACKAGE = "mn.aura.couple.api.model.";

    @Autowired
    ObjectMapper mapper;

    @Test
    void requiredNullableFieldsAreWrittenAsNull() throws Exception {
        JsonNode page = mapper.valueToTree(new MemoryPage().items(List.of()));
        assertThat(page.has("nextCursor")).isTrue();
        assertThat(page.get("nextCursor").isNull()).isTrue();

        JsonNode view = mapper.valueToTree(new CoupleMyView().mascotColor("coral"));
        assertThat(view.has("partnerNickname")).isTrue();
        assertThat(view.get("partnerNickname").isNull()).isTrue();
        // partnerAvatar — required биш тул null үед хасагдана
        assertThat(view.has("partnerAvatar")).isFalse();
    }

    @Test
    void optionalFieldsAreOmittedWhenNull() {
        JsonNode dashboard = mapper.valueToTree(new Dashboard());
        assertThat(dashboard.has("counter")).isTrue();
        assertThat(dashboard.has("partner")).isFalse();
        assertThat(dashboard.has("nextDate")).isFalse();
    }

    @Test
    @SuppressWarnings("unchecked")
    void everyContractSchemaSerializesRequiredKeysOnly() throws Exception {
        Map<String, Object> schemas = (Map<String, Object>) ((Map<String, Object>) contract().get("components")).get("schemas");
        List<String> violations = new ArrayList<>();
        int checked = 0;
        for (Map.Entry<String, Object> entry : schemas.entrySet()) {
            Map<String, Object> schema = (Map<String, Object>) entry.getValue();
            Map<String, Object> properties = (Map<String, Object>) schema.get("properties");
            Class<?> type = modelClass(entry.getKey());
            if (properties == null || type == null || type.isEnum()) {
                continue;
            }
            Object empty;
            try {
                empty = type.getDeclaredConstructor().newInstance();
            } catch (ReflectiveOperationException e) {
                continue;
            }
            checked++;
            Set<String> required = new HashSet<>((List<String>) schema.getOrDefault("required", List.of()));
            JsonNode json = mapper.valueToTree(empty);
            for (String name : required) {
                if (!json.has(name)) {
                    violations.add(entry.getKey() + "." + name + " (required) хариунаас хасагдсан");
                }
            }
            for (Iterator<Map.Entry<String, JsonNode>> it = json.fields(); it.hasNext(); ) {
                Map.Entry<String, JsonNode> field = it.next();
                if (field.getValue().isNull() && !required.contains(field.getKey())) {
                    violations.add(entry.getKey() + "." + field.getKey() + " (optional) null-аар бичигдсэн");
                }
            }
        }
        assertThat(checked).as("шалгасан schema").isGreaterThan(150);
        assertThat(violations).isEmpty();
    }

    private static Class<?> modelClass(String schemaName) {
        try {
            return Class.forName(MODEL_PACKAGE + schemaName);
        } catch (ClassNotFoundException e) {
            return null;
        }
    }

    private static Map<String, Object> contract() throws IOException {
        LoaderOptions options = new LoaderOptions();
        options.setCodePointLimit(20 * 1024 * 1024);
        try (InputStream in = new ClassPathResource("contracts/openapi.yaml").getInputStream()) {
            return new Yaml(options).load(in);
        }
    }
}
