package mn.aura.couple.isolation;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.core.io.ClassPathResource;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;

/**
 * `contracts/openapi.yaml` (classpath — pom-ийн build-helper хуулна)-аас operation бүрийг цуглуулж, хүсэлтийн
 * биеийг схемээс жишээ утгаар бүрдүүлнэ (TQ-09: endpoint-ийн жагсаалт гараар бичигдэхгүй — шинэ path тестэд
 * автоматаар орно).
 */
final class OpenApiSampler {

    static final Set<String> METHODS = Set.of("get", "post", "put", "patch", "delete");
    private static final Pattern PARAM = Pattern.compile("\\{([^}]+)}");

    /** Нэг operation. `pathParams` нь path template-ийн `{…}` дарааллаар. */
    record Operation(String method, String path, String scope, Map<String, Object> spec, List<String> pathParams) {

        @Override
        public String toString() {
            return method.toUpperCase() + " " + path;
        }
    }

    private final Map<String, Object> root;

    OpenApiSampler() {
        LoaderOptions options = new LoaderOptions();
        options.setCodePointLimit(20 * 1024 * 1024);
        try (InputStream in = new ClassPathResource("contracts/openapi.yaml").getInputStream()) {
            root = new Yaml(options).load(in);
        } catch (IOException e) {
            throw new UncheckedIOException("contracts/openapi.yaml classpath-д алга", e);
        }
    }

    @SuppressWarnings("unchecked")
    List<Operation> operations() {
        List<Operation> out = new ArrayList<>();
        Map<String, Object> paths = (Map<String, Object>) root.get("paths");
        paths.forEach((path, item) -> {
            List<String> params = new ArrayList<>();
            Matcher m = PARAM.matcher(path);
            while (m.find()) {
                params.add(m.group(1));
            }
            ((Map<String, Object>) item).forEach((method, op) -> {
                if (METHODS.contains(method)) {
                    Map<String, Object> spec = (Map<String, Object>) op;
                    out.add(new Operation(method, path, String.valueOf(spec.get("x-aura-scope")), spec, List.copyOf(params)));
                }
            });
        });
        return out;
    }

    /** `requestBody`-ийн content type (json давуу) ба жишээ бие; биегүй бол null. */
    @SuppressWarnings("unchecked")
    Map.Entry<String, Object> body(Operation op) {
        Map<String, Object> rb = (Map<String, Object>) op.spec().get("requestBody");
        if (rb == null) {
            return null;
        }
        rb = resolve(rb);
        Map<String, Object> content = (Map<String, Object>) rb.get("content");
        if (content == null || content.isEmpty()) {
            return null;
        }
        if (content.containsKey("application/json")) {
            Map<String, Object> media = (Map<String, Object>) content.get("application/json");
            return Map.entry("application/json", sample((Map<String, Object>) media.get("schema"), 0, true));
        }
        String type = content.keySet().iterator().next();
        return Map.entry(type, new byte[] {1, 2, 3});
    }

    /** Заавал query параметрийн жишээ утга (`?a=1&b=2` эсвэл хоосон). */
    @SuppressWarnings("unchecked")
    String requiredQuery(Operation op) {
        List<Object> params = (List<Object>) op.spec().getOrDefault("parameters", List.of());
        StringBuilder q = new StringBuilder();
        for (Object p : params) {
            Map<String, Object> param = resolve((Map<String, Object>) p);
            if ("query".equals(param.get("in")) && Boolean.TRUE.equals(param.get("required"))) {
                Object v = sample((Map<String, Object>) param.get("schema"), 0, true);
                q.append(q.length() == 0 ? "?" : "&").append(param.get("name")).append('=')
                        .append(java.net.URLEncoder.encode(String.valueOf(v), java.nio.charset.StandardCharsets.UTF_8));
            }
        }
        return q.toString();
    }

    @SuppressWarnings("unchecked")
    Map<String, Object> resolve(Map<String, Object> node) {
        Map<String, Object> current = node;
        int guard = 0;
        while (current != null && current.containsKey("$ref") && guard++ < 20) {
            String ref = (String) current.get("$ref");
            Object target = root;
            for (String part : ref.substring(2).split("/")) {
                target = ((Map<String, Object>) target).get(part);
            }
            current = (Map<String, Object>) target;
        }
        return current;
    }

    /** Схемээс жишээ утга: example → const → enum[0] → default → төрлөөр. Объектод заавал талбарууд. */
    @SuppressWarnings("unchecked")
    Object sample(Map<String, Object> schema, int depth, boolean top) {
        if (schema == null || depth > 8) {
            return null;
        }
        schema = resolve(schema);
        if (schema.containsKey("example")) {
            return schema.get("example");
        }
        if (schema.containsKey("const")) {
            return schema.get("const");
        }
        if (schema.containsKey("enum")) {
            for (Object e : (List<Object>) schema.get("enum")) {
                if (e != null) {
                    return e;
                }
            }
        }
        if (schema.containsKey("default")) {
            return schema.get("default");
        }
        for (String key : new String[] {"oneOf", "anyOf"}) {
            if (schema.containsKey(key)) {
                for (Object alt : (List<Object>) schema.get(key)) {
                    Map<String, Object> a = resolve((Map<String, Object>) alt);
                    if (!"null".equals(a.get("type"))) {
                        return sample(a, depth + 1, false);
                    }
                }
            }
        }
        if (schema.containsKey("allOf")) {
            Map<String, Object> merged = new LinkedHashMap<>();
            for (Object part : (List<Object>) schema.get("allOf")) {
                Object v = sample((Map<String, Object>) part, depth + 1, false);
                if (v instanceof Map<?, ?> mv) {
                    merged.putAll((Map<String, Object>) mv);
                }
            }
            return merged;
        }
        String type = type(schema);
        String format = (String) schema.get("format");
        switch (type) {
            case "object": {
                Map<String, Object> props = (Map<String, Object>) schema.getOrDefault("properties", Map.of());
                List<String> required = (List<String>) schema.getOrDefault("required", List.of());
                Map<String, Object> out = new LinkedHashMap<>();
                for (String name : required) {
                    out.put(name, sample((Map<String, Object>) props.get(name), depth + 1, false));
                }
                if (required.isEmpty() && top && !props.isEmpty()) {
                    String first = props.keySet().iterator().next();
                    out.put(first, sample((Map<String, Object>) props.get(first), depth + 1, false));
                }
                return out;
            }
            case "array": {
                int min = ((Number) schema.getOrDefault("minItems", 1)).intValue();
                List<Object> list = new ArrayList<>();
                for (int i = 0; i < Math.max(1, min); i++) {
                    list.add(sample((Map<String, Object>) schema.get("items"), depth + 1, false));
                }
                return list;
            }
            case "integer":
            case "number": {
                Object min = schema.get("minimum");
                return min instanceof Number n ? Math.max(n.longValue(), 1L) : 1;
            }
            case "boolean":
                return true;
            case "string": {
                if ("uuid".equals(format)) {
                    return UUID.randomUUID().toString();
                }
                if ("date".equals(format)) {
                    return LocalDate.now(ZoneOffset.UTC).toString();
                }
                if ("date-time".equals(format)) {
                    return OffsetDateTime.now(ZoneOffset.UTC).plusDays(1).toString();
                }
                if ("uri".equals(format)) {
                    return "https://aura.example.mn/x";
                }
                if ("email".equals(format)) {
                    return "iso@aura.test";
                }
                int min = ((Number) schema.getOrDefault("minLength", 1)).intValue();
                int max = ((Number) schema.getOrDefault("maxLength", 1000)).intValue();
                int len = Math.min(max, Math.max(min, 11));
                return "Тусгаарлалт".repeat(len / 11 + 1).substring(0, len);
            }
            default:
                return null;
        }
    }

    @SuppressWarnings("unchecked")
    private static String type(Map<String, Object> schema) {
        Object t = schema.get("type");
        if (t instanceof List<?> list) {
            for (Object x : list) {
                if (!"null".equals(x)) {
                    return String.valueOf(x);
                }
            }
            return "null";
        }
        if (t == null) {
            return schema.containsKey("properties") ? "object" : "string";
        }
        return String.valueOf(t);
    }
}
