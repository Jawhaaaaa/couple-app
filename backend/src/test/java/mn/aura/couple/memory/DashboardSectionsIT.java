package mn.aura.couple.memory;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Нүүрний мэдээллийн хэсгүүд (FR-3.4, FR-3.6, T-66): дараагийн болзоо, сүүлийн дурсамж, уншаагүй мессеж
 * (AC-72) ба «Жилийн өмнөх өнөөдөр» (AC-73) нь `GET /dashboard`-д бодит өгөгдлөөр.
 */
class DashboardSectionsIT extends AbstractMemoryIT {

    @AfterEach
    void resetClock() {
        clock.reset();
    }

    @Test
    @DisplayName("AC-72 болзоо, сүүлийн дурсамж, уншаагүй мессеж бодит өгөгдлөөр; хоосон хост хоосон")
    void sections() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("ds-a");
        TestUser b = user("ds-b");
        pair(a, b);

        JsonNode empty = ok(call(a, "GET", "/dashboard"), 200);
        assertThat(empty.path("nextDate").isNull() || empty.path("nextDate").isMissingNode()).isTrue();
        assertThat(empty.path("recentMemories")).isEmpty();
        assertThat(empty.path("unreadMessages").asInt()).isZero();

        ok(call(b, "POST", "/plans", "{\"clientId\":\"" + UUID.randomUUID() + "\",\"title\":\"Хустайн нуруу руу\","
                + "\"startsAt\":\"2026-11-10T03:00:00Z\",\"timezone\":\"Asia/Ulaanbaatar\",\"reminderOffsets\":[60],"
                + "\"recurrence\":\"NONE\",\"checklist\":[]}"), 201);
        for (int i = 1; i <= 6; i++) {
            memory(b, "Дурсамж " + i, "2026-10-0" + i, null);
        }
        for (String t : new String[] {"Уншаагүй 1", "Уншаагүй 2"}) {
            ok(call(b, "POST", "/messages", body("clientMessageId", UUID.randomUUID().toString(), "kind", "TEXT", "text", t)), 201);
        }

        JsonNode d = ok(call(a, "GET", "/dashboard"), 200);
        assertThat(d.path("nextDate").path("title").asText()).isEqualTo("Хустайн нуруу руу");
        assertThat(d.path("recentMemories")).hasSize(5);
        assertThat(d.path("unreadMessages").asInt()).isEqualTo(2);
        // Илгээгчид өөрийнх нь мессеж уншаагүйд тоологдохгүй
        assertThat(ok(call(b, "GET", "/dashboard"), 200).path("unreadMessages").asInt()).isZero();
    }

    @Test
    @DisplayName("AC-73 2025-11-07-ны дурсамж 2026-11-07-нд «Жилийн өмнөх өнөөдөр»-д; тийм дурсамжгүй өдөр алга")
    void onThisDay() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("dt-a");
        TestUser b = user("dt-b");
        pair(a, b);
        memory(a, "Нэг жилийн өмнө", "2025-11-07", null);
        memory(a, "Өөр өдөр", "2025-11-08", null);

        JsonNode d = ok(call(b, "GET", "/dashboard"), 200).path("onThisDay");
        assertThat(d.path("date").asText()).isEqualTo("2026-11-07");
        assertThat(d.path("count").asInt()).isEqualTo(1);
        assertThat(d.path("memories").get(0).path("title").asText()).isEqualTo("Нэг жилийн өмнө");

        clock.set(Instant.parse("2026-11-09T04:00:00Z"));
        JsonNode next = ok(call(fresh(b), "GET", "/dashboard"), 200).path("onThisDay");
        assertThat(next.isNull() || next.isMissingNode()).isTrue();
    }
}
