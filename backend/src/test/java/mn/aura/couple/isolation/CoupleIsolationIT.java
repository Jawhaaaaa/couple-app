package mn.aura.couple.isolation;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import mn.aura.couple.isolation.OpenApiSampler.Operation;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Хос тусгаарлалт (INV-01, AC-55, TQ-09, DD-AURA-028). Endpoint-ийн жагсаалт `contracts/openapi.yaml`-аас
 * автоматаар бүрдэнэ: path параметртэй operation бүрийг C2-ийн хэрэглэгчээр C1-ийн объектын ID-аар дуудахад
 * (унших, бичих, устгах, медиа/татах URL) 403/404 байх ёстой — 2xx эсвэл өөр код бол унана. Дараа нь C1-ийн
 * өгөгдөл огт өөрчлөгдөөгүйг (space/хэрэглэгчийн мөр бүрийн хэш) шалгана. Path параметргүй GET-ийн хариунд
 * C1-ийн ID гарахгүй.
 *
 * <p>Хамаарахгүй operation-уудыг доорх жагсаалтад шалтгаантай нь хасна; бусад бүх шинэ path тестэд өөрөө орно.
 * Fixture-д утгагүй шинэ path параметр гарвал тест унаж `IsolationFixture`-ийг нөхөхийг шаардана.
 */
class CoupleIsolationIT extends AbstractSpaceIT {

    /** Scope-оор хасах (`x-aura-scope`). */
    static final Map<String, String> EXCLUDED_SCOPES = Map.of(
            "public", "нэвтрэлтгүй (auth, policies, version) — хосын объект хүлээн авдаггүй, буцаадаггүй",
            "admin", "хосын объект биш, хэрэглэгчийн ID-аар; энгийн хэрэглэгчид 403 ADMIN_ONLY — AdminIT (AC-186, AC-206)",
            "test", "зөвхөн e2e profile-д; бусад үед 404 — TestSupportAbsentIT");

    /**
     * Хосын объект заадаггүй path параметр — дуудагчийн өөрийн space/хэрэглэгчийн утга. Operation-ийн бүх
     * параметр ийм бол хасагдана; C1-ийн ID-тай хамт байвал доорх утгаар орлуулна.
     */
    static final Map<String, String> OWN_SCOPE_PARAMS = Map.of(
            "taskKey", "контентын түлхүүр (first-week.json) — дуудагчийн өөрийн төлөв",
            "eventKey", "баярын түлхүүр — дуудагчийн өөрийн «үзсэн» тэмдэг",
            "listKind", "жагсаалтын төрөл (enum) — дуудагчийн өөрийн space",
            "localDate", "огноо — дуудагчийн өөрийн check-in",
            "year", "он — дуудагчийн өөрийн жилийн тойм",
            "libraryId", "нийтийн санааны сан (контент) — хосын объект биш",
            "index", "upload chunk-ийн дугаар — uploadId-тай хамт л",
            "provider", "OAuth provider (public)");
    static final Map<String, String> OWN_SCOPE_VALUES = Map.of(
            "taskKey", "fw-1", "eventKey", "days:100", "listKind", "bucket", "localDate", "2026-11-10", "year", "2026",
            "libraryId", "lib-1", "index", "0", "provider", "google");
    static final Set<Integer> DENIED = Set.of(403, 404);

    private static final HttpClient CLIENT = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final OpenApiSampler contract = new OpenApiSampler();

    @Test
    @DisplayName("AC-55 INV-01 C2-ийн хэрэглэгч C1-ийн объектын ID-аар OpenAPI-ийн бүх endpoint-ийг дуудахад 403/404, C1-ийн өгөгдөл өөрчлөгдөхгүй")
    void crossCoupleAccessDenied() {
        TestUser a1 = user("iso-a1");
        TestUser b1 = user("iso-b1");
        UUID c1 = pair(a1, b1);
        TestUser a2 = user("iso-a2");
        TestUser b2 = user("iso-b2");
        pair(a2, b2);
        IsolationFixture fixture = new IsolationFixture(jdbc).seed(a1.id(), b1.id(), c1);
        List<UUID> c1Users = List.of(a1.id(), b1.id());
        Map<String, String> before = fingerprint(c1, c1Users);

        List<String> failures = new ArrayList<>();
        List<String> tested = new ArrayList<>();
        List<String> ownerOk = new ArrayList<>();
        Map<Operation, String> ownerChecks = new LinkedHashMap<>();
        Map<String, String> skipped = new LinkedHashMap<>();
        for (Operation op : contract.operations()) {
            String reason = exclusion(op);
            if (reason != null) {
                skipped.put(op.toString(), reason);
                continue;
            }
            if (op.pathParams().isEmpty()) {
                continue; // доорх listLeak шалгалт
            }
            String path = op.path();
            boolean missing = false;
            for (String p : op.pathParams()) {
                String v = OWN_SCOPE_PARAMS.containsKey(p) ? OWN_SCOPE_VALUES.get(p) : fixture.value(op.path(), p);
                if (v == null) {
                    failures.add(op + ": `" + p + "` параметрт IsolationFixture-д C1-ийн утга алга — fixture-ийг нөхнө үү");
                    missing = true;
                    break;
                }
                path = path.replace("{" + p + "}", v);
            }
            if (missing) {
                continue;
            }
            HttpResponse<String> r = request(a2, op, path + contract.requiredQuery(op));
            tested.add(op.toString());
            if (!DENIED.contains(r.statusCode())) {
                failures.add(op + " (" + path + ") → " + r.statusCode() + " " + abbreviate(r.body()));
            }
            if ("get".equals(op.method())) {
                ownerChecks.put(op, path + contract.requiredQuery(op));
            }
        }

        System.out.printf("CoupleIsolationIT: %d operation шалгав, %d хасав (%s)%n", tested.size(), skipped.size(),
                String.join("; ", skipped.keySet()));
        assertThat(failures).as("C2 → C1 хандалт 403/404 биш").isEmpty();
        // Гэрээнд path параметртэй space/user operation олон — жагсаалт хоосон биш эсэх (YAML уншилтын хамгаалалт)
        assertThat(tested).hasSizeGreaterThan(60);
        assertThat(fingerprint(c1, c1Users)).as("C1-ийн өгөгдөл C2-ийн хүсэлтээр өөрчлөгдөхгүй").isEqualTo(before);
        assertThat(skipped).isNotEmpty();

        // Эерэг хяналт: fixture бодит — эзэн (C1) нь ижил GET-ийг амжилттай дуудна
        ownerChecks.forEach((op, path) -> {
            int owner = request(a1, op, path).statusCode();
            if (owner >= 200 && owner < 400) {
                ownerOk.add(op.toString());
            }
        });
        assertThat(ownerOk).as("C1-ийн эзэн өөрийн объектыг уншиж чадна (fixture хүчинтэй)")
                .contains("GET /memories/{memoryId}", "GET /plans/{planId}", "GET /letters/{letterId}", "GET /goals/{goalId}",
                        "GET /media/{mediaId}", "GET /memory-groups/{groupId}", "GET /anniversaries/{anniversaryId}")
                .hasSizeGreaterThan(10);
    }

    @Test
    @DisplayName("AC-55 path параметргүй GET (жагсаалт, хайлт, нүүр, экспорт) — C2-ийн хариунд C1-ийн ID 0")
    void listsDoNotLeak() {
        TestUser a1 = user("iso-l-a1");
        TestUser b1 = user("iso-l-b1");
        UUID c1 = pair(a1, b1);
        TestUser a2 = user("iso-l-a2");
        TestUser b2 = user("iso-l-b2");
        pair(a2, b2);
        IsolationFixture fixture = new IsolationFixture(jdbc).seed(a1.id(), b1.id(), c1);
        List<String> secrets = new ArrayList<>(fixture.ids());
        secrets.add(c1.toString());
        secrets.add(a1.id().toString());
        secrets.add(b1.id().toString());

        List<String> leaks = new ArrayList<>();
        int checked = 0;
        for (Operation op : contract.operations()) {
            if (!"get".equals(op.method()) || !op.pathParams().isEmpty() || exclusion(op) != null) {
                continue;
            }
            HttpResponse<String> r = request(a2, op, op.path() + contract.requiredQuery(op));
            checked++;
            String body = r.body() == null ? "" : r.body();
            for (String s : secrets) {
                if (body.contains(s)) {
                    leaks.add(op + " → " + r.statusCode() + ": C1-ийн " + s);
                }
            }
        }
        assertThat(leaks).isEmpty();
        assertThat(checked).isGreaterThan(30);
    }

    /** Хасах шалтгаан эсвэл null. */
    static String exclusion(Operation op) {
        String scoped = EXCLUDED_SCOPES.get(op.scope());
        if (scoped != null) {
            return scoped;
        }
        if (!op.pathParams().isEmpty() && op.pathParams().stream().allMatch(OWN_SCOPE_PARAMS::containsKey)) {
            return OWN_SCOPE_PARAMS.get(op.pathParams().get(0));
        }
        return null;
    }

    private HttpResponse<String> request(TestUser u, Operation op, String path) {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url("/api/v1" + path)))
                .timeout(Duration.ofSeconds(30))
                .header("Authorization", "Bearer " + u.token())
                .header("Accept-Language", "mn")
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .header("If-Match", "\"0\"");
        Map.Entry<String, Object> body = contract.body(op);
        if (body == null) {
            b.method(op.method().toUpperCase(), HttpRequest.BodyPublishers.noBody());
        } else {
            byte[] bytes;
            try {
                bytes = body.getValue() instanceof byte[] raw ? raw : MAPPER.writeValueAsBytes(body.getValue());
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
            b.header("Content-Type", body.getKey());
            b.method(op.method().toUpperCase(), HttpRequest.BodyPublishers.ofByteArray(bytes));
        }
        try {
            return CLIENT.send(b.build(), HttpResponse.BodyHandlers.ofString());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    /**
     * C1-ийн мөр бүрийн хэш: `space_id` = C1 эсвэл `user_id`/`owner_id` = C1-ийн хэрэглэгч бүхий бүх хүснэгт,
     * мөн C1-ийн `users`, `space` мөр. Хүснэгтийн жагсаалт information_schema-аас (шинэ хүснэгт автоматаар орно).
     */
    private Map<String, String> fingerprint(UUID space, List<UUID> users) {
        Map<String, String> out = new LinkedHashMap<>();
        List<Map<String, Object>> cols = jdbc.queryForList("""
                SELECT table_name, column_name FROM information_schema.columns
                 WHERE table_schema = 'public' AND column_name IN ('space_id', 'user_id', 'owner_id')
                 ORDER BY table_name, column_name
                """);
        for (Map<String, Object> c : cols) {
            String table = (String) c.get("table_name");
            String column = (String) c.get("column_name");
            String sql = "SELECT coalesce(md5(string_agg(t::text, '|' ORDER BY t::text)), '') FROM " + table + " t WHERE "
                    + ("space_id".equals(column) ? "space_id = ?" : column + " IN (?, ?)");
            Object[] args = "space_id".equals(column) ? new Object[] {space} : new Object[] {users.get(0), users.get(1)};
            out.put(table + "." + column, jdbc.queryForObject(sql, String.class, args));
        }
        out.put("space", jdbc.queryForObject("SELECT md5(t::text) FROM space t WHERE id = ?", String.class, space));
        out.put("users", jdbc.queryForObject(
                "SELECT md5(string_agg(t::text, '|' ORDER BY t.id)) FROM users t WHERE id IN (?, ?)", String.class,
                users.get(0), users.get(1)));
        return out;
    }

    private static String abbreviate(String s) {
        if (s == null) {
            return "";
        }
        return s.length() > 160 ? s.substring(0, 160) + "…" : s;
    }
}
