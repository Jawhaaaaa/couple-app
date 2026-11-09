package mn.aura.couple.anniversary;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class AnniversaryIT extends AbstractSpaceIT {

    static final Instant NOW = Instant.parse("2026-11-07T04:00:00Z"); // УБ 12:00

    @Test
    @DisplayName("AC-181 «Анх уулзсан» жил бүр давтагдах ба давталтгүй ой — төрөлтэйгөө; ирэх жил давтагдах нь л гарна")
    void kindsAndRecurrence() {
        clock.set(NOW);
        TestUser a = user("an-a");
        TestUser b = user("an-b");
        pair(a, b);
        JsonNode met = ok(call(a, "POST", "/anniversaries", anniversary("Анх уулзсан", "2025-03-01", "FIRST_MET", true, "[]")), 201);
        assertThat(met.path("kind").asText()).isEqualTo("FIRST_MET");
        assertThat(met.path("author").path("id").asText()).isEqualTo(a.id().toString());
        ok(call(a, "POST", "/anniversaries", anniversary("Тоглолт", "2026-12-01", "OTHER", false, "[]")), 201);

        JsonNode list = ok(call(b, "GET", "/anniversaries"), 200);
        JsonNode first = find(list, "custom:" + met.path("id").asText());
        assertThat(first.path("kind").asText()).isEqualTo("FIRST_MET");
        assertThat(first.path("source").asText()).isEqualTo("CUSTOM");
        assertThat(first.path("nextOn").asText()).isEqualTo("2027-03-01");
        assertThat(titles(list)).contains("Анх уулзсан", "Тоглолт");

        clock.set(Instant.parse("2027-02-01T04:00:00Z"));
        b = fresh(b);
        JsonNode nextYear = ok(call(b, "GET", "/anniversaries"), 200);
        assertThat(titles(nextYear)).contains("Анх уулзсан").doesNotContain("Тоглолт");
        assertThat(find(nextYear, "custom:" + met.path("id").asText()).path("daysUntil").asInt()).isEqualTo(28);
    }

    @Test
    @DisplayName("AC-102 автомат ой (SD-01) ба хоёр гишүүний төрсөн өдөр; профайл солиход шинэчлэгдэнэ")
    void autoOccasions() {
        clock.set(NOW);
        TestUser a = user("ao-a");
        TestUser b = user("ao-b");
        UUID space = pair(a, b);
        jdbc.update("UPDATE space SET start_date = '2024-10-24', start_date_confirmed = true WHERE id = ?", space);
        jdbc.update("UPDATE users SET birth_date = '1995-03-10' WHERE id = ?", a.id());

        JsonNode list = ok(call(a, "GET", "/anniversaries?from=2024-10-24"), 200);
        assertThat(find(list, "days:100").path("date").asText()).isEqualTo("2025-01-31");
        assertThat(find(list, "days:100").path("kind").asText()).isEqualTo("MILESTONE");
        assertThat(find(list, "days:1000").path("nextOn").asText()).isEqualTo("2027-07-20");
        assertThat(find(list, "years:10").path("source").asText()).isEqualTo("AUTO_YEARS");
        assertThat(find(list, "birthday:" + a.id()).path("kind").asText()).isEqualTo("BIRTHDAY");
        assertThat(find(list, "birthday:" + b.id()).isMissingNode()).isFalse();

        JsonNode def = ok(call(a, "GET", "/anniversaries"), 200);
        assertThat(find(def, "birthday:" + a.id()).path("nextOn").asText()).isEqualTo("2027-03-10");
        // 365 хоног нь 2025-10-23 — 30 хоногоос өмнө өнгөрсөн тул анхдагч жагсаалтад үгүй
        assertThat(find(def, "days:365").isMissingNode()).isTrue();
        assertThat(find(def, "years:1").isMissingNode()).isTrue();
        assertThat(find(def, "days:1000").path("daysUntil").asInt()).isEqualTo(255);

        jdbc.update("UPDATE users SET birth_date = '1995-03-12' WHERE id = ?", a.id());
        JsonNode after = ok(call(b, "GET", "/anniversaries"), 200);
        assertThat(find(after, "birthday:" + a.id()).path("nextOn").asText()).isEqualTo("2027-03-12");
    }

    @Test
    @DisplayName("AC-103 өнгөрсөн ой «N хоногийн өмнө» (daysSince), ирэх нь daysUntil — tz-ээр")
    void daysSince() {
        clock.set(Instant.parse("2026-11-07T15:30:00Z")); // Токиод 11-08
        TestUser a = user("ad-a");
        TestUser b = user("ad-b");
        pair(a, b);
        ok(call(a, "POST", "/anniversaries", anniversary("Өмнөх", "2026-11-05", "OTHER", false, "[]")), 201);
        ok(call(a, "POST", "/anniversaries", anniversary("Удахгүй", "2026-11-26", "ANNIVERSARY", false, "[]")), 201);
        JsonNode tokyo = ok(call(a, "GET", "/anniversaries?tz=Asia/Tokyo"), 200);
        JsonNode past = byTitle(tokyo, "Өмнөх");
        assertThat(past.path("daysSince").asInt()).isEqualTo(3);
        assertThat(past.path("daysUntil").asInt()).isZero();
        assertThat(byTitle(tokyo, "Удахгүй").path("daysUntil").asInt()).isEqualTo(18);
        assertThat(byTitle(tokyo, "Удахгүй").has("daysSince")).isFalse();
        assertThat(code(call(a, "GET", "/anniversaries?tz=Mars/Base"))).isEqualTo("VALIDATION_FAILED");
    }

    @Test
    @DisplayName("AC-104 7/1/0 хоногийн сануулга хоёр гишүүнд товлогдож, унтраахад цуцлагдана (автомат ойд ч)")
    void reminders() {
        clock.set(NOW);
        TestUser a = user("ar-a");
        TestUser b = user("ar-b");
        UUID space = pair(a, b);
        JsonNode an = ok(call(a, "POST", "/anniversaries", anniversary("Ой", "2026-12-07", "ANNIVERSARY", true, "[7,1,0]")), 201);
        String id = an.path("id").asText();
        assertThat(pending(id)).isEqualTo(6);
        // 7 хоногийн өмнөх сануулга УБ-ийн 09:00-д
        assertThat(jdbc.queryForList("SELECT fire_at FROM scheduled_reminder WHERE source_id = ? AND status = 'PENDING' "
                        + "AND user_id = ? ORDER BY fire_at", java.sql.Timestamp.class, id, a.id()).get(0).toInstant())
                .isEqualTo(Instant.parse("2026-11-30T01:00:00Z"));

        JsonNode patched = ok(call(a, "PATCH", "/anniversaries/" + id,
                "{\"reminderDays\":[1],\"version\":" + an.path("version").asLong() + "}"), 200);
        assertThat(patched.path("reminderDays")).hasSize(1);
        assertThat(pending(id)).isEqualTo(2);

        jdbc.update("UPDATE space SET start_date = '2024-10-24', start_date_confirmed = true WHERE id = ?", space);
        JsonNode note = ok(call(b, "PUT", "/occasions/days:1000/note",
                "{\"note\":null,\"memoryIds\":[],\"reminderDays\":[7,0],\"version\":0}"), 200);
        assertThat(note.path("reminderDays")).hasSize(2);
        assertThat(note.path("version").asLong()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM scheduled_reminder WHERE space_id = ? AND status = 'PENDING' "
                + "AND source_id <> ?", Integer.class, space, id)).isEqualTo(4);
        ok(call(b, "PUT", "/occasions/days:1000/note", "{\"memoryIds\":[],\"reminderDays\":[],\"version\":1}"), 200);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM scheduled_reminder WHERE space_id = ? AND status = 'PENDING' "
                + "AND source_id <> ?", Integer.class, space, id)).isZero();

        ok(call(a, "DELETE", "/anniversaries/" + id), 204);
        assertThat(pending(id)).isZero();
    }

    @Test
    @DisplayName("AC-105 ойд тэмдэглэл + 2 дурсамж хавсаргах — хоёуланд харагдана; version зөрвөл 409")
    void noteAndMemories() {
        clock.set(NOW);
        TestUser a = user("am-a");
        TestUser b = user("am-b");
        UUID space = pair(a, b);
        UUID m1 = memory(a, space, "Анхны аялал");
        UUID m2 = memory(a, space, "Кино");
        JsonNode an = ok(call(a, "POST", "/anniversaries", anniversary("Ой", "2026-12-07", "ANNIVERSARY", true, "[]")), 201);
        String key = "custom:" + an.path("id").asText();
        JsonNode detail = ok(call(b, "PUT", "/occasions/" + key + "/note", "{\"note\":\"Хамтдаа оройн хоол\",\"memoryIds\":[\""
                + m1 + "\",\"" + m2 + "\"],\"reminderDays\":[],\"version\":" + an.path("version").asLong() + "}"), 200);
        assertThat(detail.path("note").asText()).isEqualTo("Хамтдаа оройн хоол");
        assertThat(detail.path("memories")).hasSize(2);

        JsonNode aView = ok(call(a, "GET", "/occasions/" + key), 200);
        assertThat(aView.path("memories").get(0).path("id").asText()).isEqualTo(m1.toString());
        assertThat(aView.path("occasion").path("memoryCount").asInt()).isEqualTo(2);
        assertThat(find(ok(call(a, "GET", "/anniversaries"), 200), key).path("note").asText()).isEqualTo("Хамтдаа оройн хоол");
        assertThat(ok(call(a, "GET", "/anniversaries/" + an.path("id").asText()), 200).path("memories")).hasSize(2);

        assertThat(code(call(a, "PUT", "/occasions/" + key + "/note",
                "{\"memoryIds\":[],\"reminderDays\":[],\"version\":0}"))).isEqualTo("VERSION_CONFLICT");

        // Автомат ойд ч мөн адил
        jdbc.update("UPDATE space SET start_date = '2024-10-24', start_date_confirmed = true WHERE id = ?", space);
        JsonNode auto = ok(call(a, "PUT", "/occasions/days:1000/note", "{\"note\":\"Мянга!\",\"memoryIds\":[\"" + m1
                + "\"],\"reminderDays\":[],\"version\":0}"), 200);
        assertThat(auto.path("occasion").path("note").asText()).isEqualTo("Мянга!");
        assertThat(ok(call(b, "GET", "/occasions/days:1000"), 200).path("memories")).hasSize(1);
        ok(call(a, "GET", "/occasions/days:999"), 404);
    }

    @Test
    @DisplayName("INV-03 өөрийн оруулсан ойг л засна/устгана (403), өөр хосынх 404")
    void ownership() {
        clock.set(NOW);
        TestUser a = user("aw-a");
        TestUser b = user("aw-b");
        TestUser c = user("aw-c");
        TestUser d = user("aw-d");
        pair(a, b);
        pair(c, d);
        JsonNode an = ok(call(a, "POST", "/anniversaries", anniversary("Ой", "2026-12-07", "ANNIVERSARY", true, "[]")), 201);
        String path = "/anniversaries/" + an.path("id").asText();
        assertThat(code(call(b, "PATCH", path, "{\"title\":\"Б\",\"version\":0}"))).isEqualTo("NOT_OWNER");
        assertThat(code(call(b, "DELETE", path))).isEqualTo("NOT_OWNER");
        assertThat(code(call(c, "GET", path))).isEqualTo("NOT_FOUND");
        assertThat(code(call(c, "GET", "/occasions/custom:" + an.path("id").asText()))).isEqualTo("NOT_FOUND");
        assertThat(code(call(a, "PATCH", path, "{\"title\":\"Б\",\"version\":5}"))).isEqualTo("VERSION_CONFLICT");
        assertThat(ok(call(a, "PATCH", path, "{\"title\":\"Шинэ\",\"version\":0}"), 200).path("version").asLong()).isEqualTo(1);
    }

    // --- туслах ---

    static String anniversary(String title, String date, String kind, boolean recurring, String reminderDays) {
        return "{\"title\":\"" + title + "\",\"date\":\"" + date + "\",\"kind\":\"" + kind + "\",\"recurring\":" + recurring
                + ",\"reminderDays\":" + reminderDays + "}";
    }

    private int pending(String sourceId) {
        return jdbc.queryForObject("SELECT count(*) FROM scheduled_reminder WHERE source_id = ? AND status = 'PENDING'",
                Integer.class, sourceId);
    }

    static JsonNode find(JsonNode list, String key) {
        for (JsonNode o : list) {
            if (key.equals(o.path("occasionKey").asText())) {
                return o;
            }
        }
        return com.fasterxml.jackson.databind.node.MissingNode.getInstance();
    }

    private static JsonNode byTitle(JsonNode list, String title) {
        for (JsonNode o : list) {
            if (title.equals(o.path("title").asText())) {
                return o;
            }
        }
        throw new AssertionError(title + " олдсонгүй: " + list);
    }

    private static List<String> titles(JsonNode list) {
        List<String> out = new ArrayList<>();
        list.forEach(o -> out.add(o.path("title").asText()));
        return out;
    }

    /** Хосын space-д READY зурагтай дурсамж (S3 объектгүй). */
    private UUID memory(TestUser u, UUID space, String title) {
        UUID media = UUID.randomUUID();
        jdbc.update("INSERT INTO media (id, space_id, owner_id, kind, mime, size_bytes, s3_key, status) "
                + "VALUES (?, ?, ?, 'IMAGE', 'image/jpeg', 1000, ?, 'READY')", media, space, u.id(),
                "spaces/" + space + "/" + media + "/original");
        String json = "{\"clientId\":\"" + UUID.randomUUID() + "\",\"title\":\"" + title + "\",\"occurredOn\":\""
                + LocalDate.parse("2026-10-01") + "\",\"dateSource\":\"MANUAL\",\"locationSource\":\"NONE\",\"tags\":[],"
                + "\"groupIds\":[],\"media\":[{\"mediaId\":\"" + media + "\"}]}";
        return UUID.fromString(ok(call(u, "POST", "/memories", json), 201).path("id").asText());
    }
}
