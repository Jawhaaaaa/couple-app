package mn.aura.couple.plan;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class DateRecurrenceIT extends AbstractSpaceIT {

    private static String plan(String title, String startsAt, String recurrence, String extra) {
        return "{\"clientId\":\"" + UUID.randomUUID() + "\",\"title\":\"" + title + "\",\"startsAt\":\"" + startsAt
                + "\",\"timezone\":\"Asia/Ulaanbaatar\",\"reminderOffsets\":[],\"recurrence\":\"" + recurrence
                + "\",\"checklist\":[]" + (extra == null ? "" : "," + extra) + "}";
    }

    private List<String> november(TestUser u, String id) {
        JsonNode list = ok(call(u, "GET", "/plans?from=2026-11-01T00:00:00%2B08:00&to=2026-11-30T23:59:59%2B08:00"), 200);
        List<String> out = new ArrayList<>();
        for (JsonNode p : list) {
            if (p.path("id").asText().equals(id)) {
                out.add(p.path("occurrenceOn").asText() + "@" + OffsetDateTime.parse(p.path("startsAt").asText()).toInstant());
            }
        }
        return out;
    }

    @Test
    @DisplayName("AC-37 7 хоног тутмын болзоо: нэг удааг цуцалж, нэгийн цагийг өөрчлөхөд бусад удаа хэвээр")
    void weeklyOccurrenceExceptions() {
        clock.set(Instant.parse("2026-10-30T04:00:00Z"));
        TestUser a = user("rec-a");
        TestUser b = user("rec-b");
        pair(a, b);
        String id = ok(call(a, "POST", "/plans", plan("Бассейн", "2026-11-06T11:00:00Z", "WEEKLY", null)), 201)
                .path("id").asText();
        ok(call(b, "POST", "/plans/" + id + "/respond", body("action", "ACCEPT")), 200);
        assertThat(november(a, id)).containsExactly("2026-11-06@2026-11-06T11:00:00Z", "2026-11-13@2026-11-13T11:00:00Z",
                "2026-11-20@2026-11-20T11:00:00Z", "2026-11-27@2026-11-27T11:00:00Z");

        ok(call(a, "DELETE", "/plans/" + id + "?scope=OCCURRENCE&occurrenceOn=2026-11-13"), 204);
        JsonNode one = ok(call(a, "GET", "/plans/" + id + "?occurrenceOn=2026-11-20"), 200);
        assertThat(one.path("occurrenceOn").asText()).isEqualTo("2026-11-20");
        ok(call(b, "PATCH", "/plans/" + id, body("startsAt", "2026-11-21T03:00:00Z", "version", one.path("version").asLong(),
                "scope", "OCCURRENCE", "occurrenceOn", "2026-11-20")), 200);

        assertThat(november(b, id)).containsExactly("2026-11-06@2026-11-06T11:00:00Z", "2026-11-20@2026-11-21T03:00:00Z",
                "2026-11-27@2026-11-27T11:00:00Z");
        JsonNode cancelled = ok(call(a, "GET", "/plans/" + id + "?occurrenceOn=2026-11-13"), 200);
        assertThat(cancelled.path("status").asText()).isEqualTo("CANCELLED");
        assertThat(ok(call(a, "GET", "/plans/" + id + "?occurrenceOn=2026-11-27"), 200).path("status").asText())
                .isEqualTo("CONFIRMED");
        // Давталт биш огноо → 404
        assertThat(call(a, "GET", "/plans/" + id + "?occurrenceOn=2026-11-14").statusCode()).isEqualTo(404);
    }

    @Test
    @DisplayName("AC-37 SD-03 сар бүрийн 31-нд давтагдах болзоо 11-р сард 30-нд харагдана")
    void monthlyThirtyFirst() {
        clock.set(Instant.parse("2026-10-01T04:00:00Z"));
        TestUser a = user("recm-a");
        String id = ok(call(a, "POST", "/plans", plan("Сарын болзоо", "2026-10-31T11:00:00Z", "MONTHLY", null)), 201)
                .path("id").asText();
        assertThat(november(a, id)).containsExactly("2026-11-30@2026-11-30T11:00:00Z");
    }

    @Test
    @DisplayName("AC-97 зардал нэмэх, сарын нэгтгэл (30 000 хэтэрсэн, 65/35), бусдын зардлыг устгахгүй (403)")
    void budgetApi() {
        clock.set(Instant.parse("2026-11-01T04:00:00Z"));
        TestUser a = user("bud-a");
        TestUser b = user("bud-b");
        pair(a, b);
        String id = ok(call(a, "POST", "/plans", plan("Тэрэлж", "2026-11-14T02:00:00Z", "NONE", "\"plannedBudgetMnt\":200000")), 201)
                .path("id").asText();
        String e1 = ok(call(a, "POST", "/plans/" + id + "/expenses", body("amountMnt", 150000, "payerId", a.id().toString(),
                "spentOn", "2026-11-14", "note", "Буудал")), 201).path("id").asText();
        ok(call(b, "POST", "/plans/" + id + "/expenses", body("amountMnt", 80000, "payerId", b.id().toString(),
                "spentOn", "2026-11-14")), 201);
        assertThat(call(b, "POST", "/plans/" + id + "/expenses", body("amountMnt", 1, "payerId", UUID.randomUUID().toString(),
                "spentOn", "2026-11-14")).statusCode()).isEqualTo(400);

        JsonNode plan = ok(call(b, "GET", "/plans/" + id), 200);
        assertThat(plan.path("expenses").size()).isEqualTo(2);
        assertThat(plan.path("budget").path("overBy").asLong()).isEqualTo(30000);

        JsonNode s = ok(call(b, "GET", "/budget/summary?month=2026-11"), 200);
        assertThat(s.path("actualTotal").asLong()).isEqualTo(230000);
        assertThat(s.path("plannedTotal").asLong()).isEqualTo(200000);
        assertThat(s.path("overBy").asLong()).isEqualTo(30000);
        for (JsonNode share : s.path("shares")) {
            int expected = share.path("userId").asText().equals(a.id().toString()) ? 65 : 35;
            assertThat(share.path("percent").asInt()).isEqualTo(expected);
        }
        assertThat(ok(call(b, "GET", "/budget/summary?month=2026-12"), 200).path("actualTotal").asLong()).isZero();

        assertThat(code(call(b, "DELETE", "/expenses/" + e1))).isEqualTo("NOT_OWNER");
        ok(call(a, "DELETE", "/expenses/" + e1), 204);
        assertThat(ok(call(b, "GET", "/budget/summary?month=2026-11"), 200).path("actualTotal").asLong()).isEqualTo(80000);
    }
}
