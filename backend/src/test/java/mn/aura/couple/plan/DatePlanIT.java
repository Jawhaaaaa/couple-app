package mn.aura.couple.plan;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import mn.aura.couple.notification.app.ReminderRegistry;
import mn.aura.couple.notification.app.ReminderRegistry.SourceType;
import mn.aura.couple.realtime.StompTestClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class DatePlanIT extends AbstractSpaceIT {

    @Autowired
    ReminderRegistry reminders;

    private String create(TestUser u, String title, String startsAt, String extra) {
        String json = "{\"clientId\":\"" + UUID.randomUUID() + "\",\"title\":\"" + title + "\",\"startsAt\":\"" + startsAt
                + "\",\"timezone\":\"Asia/Ulaanbaatar\",\"reminderOffsets\":[1440,60],\"recurrence\":\"NONE\",\"checklist\":[]"
                + (extra == null ? "" : "," + extra) + "}";
        return json;
    }

    @Test
    @DisplayName("AC-33 A санал → B «Өөр цаг» 2 хувилбар → A нэгийг сонгоход хоёуланд CONFIRMED; plan.updated")
    void proposeCounterChoose() throws Exception {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("dp-a");
        TestUser b = user("dp-b");
        pair(a, b);
        JsonNode plan = ok(call(a, "POST", "/plans", create(a, "Кино", "2026-11-14T11:30:00Z", null)), 201);
        String id = plan.path("id").asText();
        assertThat(plan.path("status").asText()).isEqualTo("PENDING");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification WHERE user_id = ? AND type = 'DATE_PROPOSED'",
                Integer.class, b.id())).isEqualTo(1);
        // B-д «Хүлээгдэж буй»
        JsonNode pending = ok(call(b, "GET", "/plans?view=pending"), 200);
        assertThat(pending.size()).isEqualTo(1);
        assertThat(pending.get(0).path("id").asText()).isEqualTo(id);
        // Санал болгогч өөрөө хариулахгүй
        assertThat(code(call(a, "POST", "/plans/" + id + "/respond", body("action", "ACCEPT")))).isEqualTo("NOT_OWNER");
        assertThat(call(b, "POST", "/plans/" + id + "/respond", body("action", "COUNTER", "options", List.of())).statusCode())
                .isEqualTo(400);

        JsonNode countered = ok(call(b, "POST", "/plans/" + id + "/respond", body("action", "COUNTER", "options",
                List.of("2026-11-15T10:00:00Z", "2026-11-16T10:00:00Z"))), 200);
        assertThat(countered.path("status").asText()).isEqualTo("COUNTER_PROPOSED");
        assertThat(countered.path("counterOptions").size()).isEqualTo(2);
        assertThat(code(call(b, "POST", "/plans/" + id + "/respond", body("action", "ACCEPT")))).isEqualTo("PLAN_NOT_PENDING");
        JsonNode forA = ok(call(a, "GET", "/plans/" + id), 200);
        assertThat(forA.path("counterOptions").size()).isEqualTo(2);
        String option = forA.path("counterOptions").get(1).path("id").asText();
        assertThat(code(call(b, "POST", "/plans/" + id + "/choose-option", body("optionId", option)))).isEqualTo("NOT_OWNER");

        try (StompTestClient bClient = StompTestClient.connect(port, b.token()).events()) {
            Thread.sleep(300);
            JsonNode chosen = ok(call(a, "POST", "/plans/" + id + "/choose-option", body("optionId", option)), 200);
            assertThat(chosen.path("status").asText()).isEqualTo("CONFIRMED");
            assertThat(OffsetDateTime.parse(chosen.path("startsAt").asText()).toInstant())
                    .isEqualTo(Instant.parse("2026-11-16T10:00:00Z"));
            JsonNode ev = bClient.next("plan.updated", 3000);
            assertThat(ev.path("payload").path("status").asText()).isEqualTo("CONFIRMED");
        }
        assertThat(ok(call(b, "GET", "/plans/" + id), 200).path("status").asText()).isEqualTo("CONFIRMED");
        assertThat(code(call(a, "POST", "/plans/" + id + "/choose-option", body("optionId", option)))).isEqualTo("PLAN_NOT_PENDING");
        assertThat(ok(call(b, "GET", "/plans?view=upcoming"), 200).get(0).path("id").asText()).isEqualTo(id);
    }

    @Test
    @DisplayName("AC-34 2026-11-14 19:30 Улаанбаатар → DB-д UTC 11:30; A (УБ) 19:30, B (Токио) 20:30")
    void storedInUtc() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("dpu-a");
        TestUser b = user("dpu-b");
        pair(a, b);
        jdbc.update("UPDATE users SET timezone = 'Asia/Tokyo' WHERE id = ?", b.id());
        String id = ok(call(a, "POST", "/plans", create(a, "Оройн хоол", "2026-11-14T19:30:00+08:00", null)), 201)
                .path("id").asText();
        Instant stored = jdbc.queryForObject("SELECT starts_at FROM date_plan WHERE id = ?::uuid", java.sql.Timestamp.class, id)
                .toInstant();
        assertThat(stored).isEqualTo(Instant.parse("2026-11-14T11:30:00Z"));
        JsonNode forB = ok(call(b, "GET", "/plans/" + id), 200);
        Instant at = OffsetDateTime.parse(forB.path("startsAt").asText()).toInstant();
        assertThat(forB.path("timezone").asText()).isEqualTo("Asia/Ulaanbaatar");
        assertThat(at.atZone(ZoneId.of("Asia/Ulaanbaatar")).toLocalTime().toString()).isEqualTo("19:30");
        assertThat(at.atZone(ZoneId.of("Asia/Tokyo")).toLocalTime().toString()).isEqualTo("20:30");
    }

    @Test
    @DisplayName("AC-35 AC-180 1 өдөр ба 1 цагийн сануулга: батлахад товлогдоно, цаг өөрчлөхөд хуучин цуцлагдаж шинэ, цуцлахад бүгд алга")
    void remindersRescheduled() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("dpr-a");
        TestUser b = user("dpr-b");
        pair(a, b);
        String id = ok(call(a, "POST", "/plans", create(a, "Уулын алхалт", "2026-11-14T02:00:00Z", null)), 201)
                .path("id").asText();
        assertThat(reminders.pending(SourceType.DATE_PLAN, id)).isEmpty(); // батлагдаагүй
        ok(call(b, "POST", "/plans/" + id + "/respond", body("action", "ACCEPT")), 200);
        List<ReminderRegistry.Scheduled> first = reminders.pending(SourceType.DATE_PLAN, id);
        assertThat(first).hasSize(4); // 2 хүн × 2 сануулга
        assertThat(first).extracting(ReminderRegistry.Scheduled::fireAt).containsOnly(
                Instant.parse("2026-11-13T02:00:00Z"), Instant.parse("2026-11-14T01:00:00Z"));
        assertThat(first).extracting(ReminderRegistry.Scheduled::userId).containsOnly(a.id(), b.id());

        long version = ok(call(a, "GET", "/plans/" + id), 200).path("version").asLong();
        ok(call(b, "PATCH", "/plans/" + id, body("startsAt", "2026-11-15T03:00:00Z", "version", version, "scope", "SERIES")), 200);
        List<ReminderRegistry.Scheduled> moved = reminders.pending(SourceType.DATE_PLAN, id);
        assertThat(moved).hasSize(4);
        assertThat(moved).extracting(ReminderRegistry.Scheduled::fireAt).containsOnly(
                Instant.parse("2026-11-14T03:00:00Z"), Instant.parse("2026-11-15T02:00:00Z"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM scheduled_reminder WHERE source_id = ? AND status = 'CANCELLED'",
                Integer.class, id)).isEqualTo(4);

        ok(call(a, "DELETE", "/plans/" + id), 204);
        assertThat(reminders.pending(SourceType.DATE_PLAN, id)).isEmpty();
        assertThat(ok(call(a, "GET", "/plans/" + id), 200).path("status").asText()).isEqualTo("CANCELLED");
        assertThat(ok(call(a, "GET", "/plans?view=upcoming"), 200).size()).isZero();
    }

    @Test
    @DisplayName("AC-96 4 зүйлтэй checklist: A 1, B 1 тэмдэглэхэд хоёр талд «2 of 4», хэн тэмдэглэсэн; checklist.updated")
    void checklistRealtime() throws Exception {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("dpc-a");
        TestUser b = user("dpc-b");
        pair(a, b);
        String id = ok(call(a, "POST", "/plans", create(a, "Пикник", "2026-11-14T02:00:00Z",
                "\"checklist\":[{\"text\":\"Хоол\"},{\"text\":\"Хөнжил\"},{\"text\":\"Ус\"}]")), 201).path("id").asText();
        JsonNode added = ok(call(b, "POST", "/plans/" + id + "/checklist", body("text", "Камер")), 201);
        JsonNode plan = ok(call(a, "GET", "/plans/" + id), 200);
        assertThat(plan.path("checklist").size()).isEqualTo(4);
        String first = plan.path("checklist").get(0).path("id").asText();
        try (StompTestClient aClient = StompTestClient.connect(port, a.token()).events()) {
            Thread.sleep(300);
            ok(call(a, "PATCH", "/checklist-items/" + first, body("done", true, "version", 0)), 200);
            JsonNode byB = ok(call(b, "PATCH", "/checklist-items/" + added.path("id").asText(), body("done", true, "version", 0)), 200);
            assertThat(byB.path("doneBy").asText()).isEqualTo(b.id().toString());
            aClient.next("checklist.updated", 3000);
            JsonNode ev = aClient.next("checklist.updated", 3000);
            assertThat(ev.path("payload").path("progress").path("done").asInt()).isEqualTo(2);
            assertThat(ev.path("payload").path("progress").path("total").asInt()).isEqualTo(4);
            assertThat(ev.path("payload").path("item").path("doneBy").asText()).isEqualTo(b.id().toString());
        }
        JsonNode forB = ok(call(b, "GET", "/plans/" + id), 200);
        assertThat(forB.path("checklistProgress").path("done").asInt()).isEqualTo(2);
        assertThat(forB.path("checklistProgress").path("total").asInt()).isEqualTo(4);
        // Хуучин version-оор засвал 409
        JsonNode conflict = ok(call(b, "PATCH", "/checklist-items/" + first, body("text", "Их хоол", "version", 0)), 409);
        assertThat(conflict.path("code").asText()).isEqualTo("VERSION_CONFLICT");
        ok(call(b, "DELETE", "/checklist-items/" + first), 204);
        assertThat(ok(call(a, "GET", "/plans/" + id), 200).path("checklist").size()).isEqualTo(3);
    }

    @Test
    @DisplayName("AC-131 A, B зэрэг засахад хоёр дахь нь 409 VERSION_CONFLICT + одоогийн хувилбар, хэн өөрчилсөн")
    void versionConflict() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("dpv-a");
        TestUser b = user("dpv-b");
        pair(a, b);
        JsonNode plan = ok(call(a, "POST", "/plans", create(a, "Боулинг", "2026-11-14T10:00:00Z", null)), 201);
        String id = plan.path("id").asText();
        long v = plan.path("version").asLong();
        ok(call(a, "PATCH", "/plans/" + id, body("title", "Боулинг ба пицца", "version", v, "scope", "SERIES")), 200);
        JsonNode conflict = ok(call(b, "PATCH", "/plans/" + id, body("title", "Тоглоом", "version", v, "scope", "SERIES")), 409);
        assertThat(conflict.path("code").asText()).isEqualTo("VERSION_CONFLICT");
        assertThat(conflict.path("details").path("current").path("title").asText()).isEqualTo("Боулинг ба пицца");
        assertThat(conflict.path("details").path("updatedBy").asText()).isEqualTo(a.id().toString());
        assertThat(conflict.path("details").path("currentVersion").asLong()).isEqualTo(v + 1);
    }

    @Test
    @DisplayName("AC-95 өнгөрсөн болзооноос дурсамж — болзоо ба дурсамж хоёр талаас холбоотой; өөр хосын болзоо 404")
    void linkMemory() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("dpm-a");
        TestUser b = user("dpm-b");
        TestUser c = user("dpm-c");
        UUID space = pair(a, b);
        String id = ok(call(a, "POST", "/plans", create(a, "Тэрэлж", "2026-11-08T02:00:00Z",
                "\"place\":{\"name\":\"Тэрэлж\",\"lat\":47.98,\"lon\":107.45}")), 201).path("id").asText();
        ok(call(b, "POST", "/plans/" + id + "/respond", body("action", "ACCEPT")), 200);

        // Дурсамжийг болзооноос (datePlanId) үүсгэх
        UUID media = UUID.randomUUID();
        jdbc.update("INSERT INTO media (id, space_id, owner_id, kind, mime, size_bytes, s3_key, status) "
                + "VALUES (?, ?, ?, 'IMAGE', 'image/jpeg', 1000, ?, 'READY')", media, space, b.id(), "spaces/" + space + "/" + media);
        String memoryJson = "{\"clientId\":\"" + UUID.randomUUID() + "\",\"title\":\"Тэрэлж\",\"occurredOn\":\"2026-11-08\","
                + "\"dateSource\":\"MANUAL\",\"locationSource\":\"NONE\",\"tags\":[],\"groupIds\":[],\"media\":[{\"mediaId\":\""
                + media + "\"}],\"datePlanId\":\"" + id + "\"}";
        String memoryId = ok(call(b, "POST", "/memories", memoryJson), 201).path("id").asText();
        assertThat(ok(call(a, "GET", "/plans/" + id), 200).path("memoryId").asText()).isEqualTo(memoryId);
        JsonNode mem = ok(call(a, "GET", "/memories/" + memoryId), 200);
        assertThat(mem.path("datePlan").path("id").asText()).isEqualTo(id);
        assertThat(mem.path("datePlan").path("title").asText()).isEqualTo("Тэрэлж");

        // Шууд холбох endpoint — ижил дурсамж дахин бол OK
        ok(call(a, "POST", "/plans/" + id + "/memory", body("memoryId", memoryId)), 200);
        // Өөр хосын хэрэглэгч хандахгүй
        assertThat(call(c, "GET", "/plans/" + id).statusCode()).isEqualTo(404);
        String bad = "{\"clientId\":\"" + UUID.randomUUID() + "\",\"title\":\"Х\",\"occurredOn\":\"2026-11-08\","
                + "\"dateSource\":\"MANUAL\",\"locationSource\":\"NONE\",\"tags\":[],\"groupIds\":[],\"media\":[{\"mediaId\":\""
                + media + "\"}],\"datePlanId\":\"" + UUID.randomUUID() + "\"}";
        assertThat(call(b, "POST", "/memories", bad).statusCode()).isEqualTo(404);
    }

    @Test
    @DisplayName("AC-101 .ics файл UTC цаг, газар, сануулгатай")
    void icsExport() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("dpi-a");
        String id = ok(call(a, "POST", "/plans", create(a, "Кино, попкорн", "2026-11-14T11:30:00Z",
                "\"place\":{\"name\":\"Өргөө\",\"lat\":47.91,\"lon\":106.92}")), 201).path("id").asText();
        var r = call(a, "GET", "/plans/" + id + "/ics");
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(r.headers().firstValue("Content-Type").orElse("")).startsWith("text/calendar");
        assertThat(r.body()).contains("BEGIN:VEVENT").contains("DTSTART:20261114T113000Z")
                .contains("SUMMARY:Кино\\, попкорн").contains("LOCATION:Өргөө").contains("TRIGGER:-PT60M");
    }
}
