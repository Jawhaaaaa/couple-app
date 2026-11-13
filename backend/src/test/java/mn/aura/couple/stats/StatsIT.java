package mn.aura.couple.stats;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class StatsIT extends AbstractSpaceIT {

    private UUID memory(UUID space, TestUser author, String title, String on, String place, Double lat, Double lon,
                        String city, String country, String... mediaKinds) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO memory (id, space_id, author_id, client_id, title, occurred_on, location_name, lat, lon, city,
                    country_code, location_source)
                VALUES (?, ?, ?, ?, ?, ?::date, ?, ?, ?, ?, ?, ?)
                """, id, space, author.id(), UUID.randomUUID(), title, on, place, lat, lon, city, country,
                lat == null ? "NONE" : "MANUAL");
        int pos = 0;
        for (String kind : mediaKinds) {
            UUID m = UUID.randomUUID();
            jdbc.update("INSERT INTO media (id, space_id, owner_id, kind, mime, size_bytes, s3_key, status) "
                    + "VALUES (?, ?, ?, ?, 'image/jpeg', 10, ?, 'READY')", m, space, author.id(), kind, "k/" + m);
            jdbc.update("INSERT INTO memory_media (memory_id, media_id, position) VALUES (?, ?, ?)", id, m, pos++);
        }
        return id;
    }

    private UUID seed(TestUser a, TestUser b) {
        UUID space = pair(a, b);
        jdbc.update("UPDATE space SET start_date = '2025-11-08' WHERE id = ?", space);
        memory(space, a, "Шинэ жил", "2026-01-01", "Улаанбаатар", 47.92, 106.92, "Улаанбаатар", "MN", "IMAGE", "IMAGE");
        memory(space, b, "Дархан", "2026-03-08", "Дархан", 49.49, 105.92, "Дархан", "MN", "IMAGE", "VIDEO");
        memory(space, a, "Сөүл", "2026-05-20", "Сөүл", 37.57, 126.98, "Seoul", "KR", "VIDEO");
        memory(space, b, "Сөүл 2", "2026-05-21", "Сөүл", 37.57, 126.98, "Seoul", "KR", "IMAGE");
        memory(space, a, "Гэртээ", "2025-12-24", null, null, null, null, null, "IMAGE");
        UUID deleted = memory(space, a, "Устгасан", "2026-02-02", null, null, null, null, null, "IMAGE");
        jdbc.update("UPDATE memory SET deleted_at = now() WHERE id = ?", deleted);
        for (int i = 0; i < 3; i++) {
            jdbc.update("INSERT INTO heart_signal (id, space_id, sender_id, client_id, kind, couple_day, created_at) "
                    + "VALUES (?, ?, ?, ?, 'HEART', '2026-06-01', '2026-06-01T04:00:00Z')", UUID.randomUUID(), space,
                    i % 2 == 0 ? a.id() : b.id(), UUID.randomUUID());
        }
        jdbc.update("INSERT INTO heart_signal (id, space_id, sender_id, client_id, kind, couple_day, created_at) "
                + "VALUES (?, ?, ?, ?, 'HUG', '2026-06-01', '2026-06-01T04:00:00Z')", UUID.randomUUID(), space, a.id(), UUID.randomUUID());
        jdbc.update("""
                INSERT INTO date_plan (id, space_id, proposer_id, title, starts_at, timezone, status)
                VALUES (?, ?, ?, 'Кино', '2026-04-10T11:00:00Z', 'Asia/Ulaanbaatar', 'CONFIRMED'),
                       (?, ?, ?, 'Цуцалсан', '2026-04-11T11:00:00Z', 'Asia/Ulaanbaatar', 'CANCELLED'),
                       (?, ?, ?, 'Ирээдүй', '2026-12-30T11:00:00Z', 'Asia/Ulaanbaatar', 'CONFIRMED')
                """, UUID.randomUUID(), space, a.id(), UUID.randomUUID(), space, a.id(), UUID.randomUUID(), space, b.id());
        jdbc.update("INSERT INTO goal (id, space_id, title, created_by, completed_at) VALUES (?, ?, 'Зорилго', ?, '2026-07-01T00:00:00Z')",
                UUID.randomUUID(), space, a.id());
        jdbc.update("""
                INSERT INTO letter (id, space_id, author_id, recipient_id, template, body, status, delivered_at)
                VALUES (?, ?, ?, ?, 'PAPER_1', 'x', 'READ', '2026-08-01T00:00:00Z'),
                       (?, ?, ?, ?, 'PAPER_1', 'y', 'SCHEDULED', NULL)
                """, UUID.randomUUID(), space, a.id(), b.id(), UUID.randomUUID(), space, b.id(), a.id());
        return space;
    }

    @Test
    @DisplayName("AC-117 AC-47 статистик DB-ийн тоотой тэнцүү: дурсамж, зураг, видео, болзоо, зорилго, захидал, хоног, зүрх, хот, км")
    void statsMatchDb() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("st-a");
        TestUser b = user("st-b");
        seed(a, b);
        JsonNode s = ok(call(b, "GET", "/stats"), 200);
        assertThat(s.path("memories").asInt()).isEqualTo(5);
        assertThat(s.path("photos").asInt()).isEqualTo(5);
        assertThat(s.path("videos").asInt()).isEqualTo(2);
        assertThat(s.path("dates").asInt()).isEqualTo(1);
        assertThat(s.path("goalsCompleted").asInt()).isEqualTo(1);
        assertThat(s.path("letters").asInt()).isEqualTo(1);
        assertThat(s.path("heartsSent").asInt()).isEqualTo(3);
        // 2025-11-08 … 2026-11-07 (SD-01: өдөр + 1)
        assertThat(s.path("daysTogether").asInt()).isEqualTo(365);
        assertThat(s.path("cities").asInt()).isEqualTo(3);
        assertThat(s.path("countries").asInt()).isEqualTo(2);
        assertThat(s.path("distanceKm").asDouble()).isBetween(2200.0, 2500.0);

        TestUser c = user("st-c");
        TestUser d = user("st-d");
        pair(c, d);
        assertThat(ok(call(c, "GET", "/stats"), 200).path("memories").asInt()).isZero();
    }

    @Test
    @DisplayName("AC-118 «Бидний жил 2026»: жилийн тоо, хамгийн их дурсамжтай сар, газар, 6–10 слайд; өөр хосод харагдахгүй")
    void yearInReview() {
        clock.set(Instant.parse("2026-11-07T04:00:00Z"));
        TestUser a = user("yr-a");
        TestUser b = user("yr-b");
        seed(a, b);
        JsonNode y = ok(call(a, "GET", "/year-in-review/2026"), 200);
        assertThat(y.path("year").asInt()).isEqualTo(2026);
        assertThat(y.path("totals").path("memories").asInt()).isEqualTo(4);
        assertThat(y.path("totals").path("dates").asInt()).isEqualTo(1);
        assertThat(y.path("topMonth").path("month").asInt()).isEqualTo(5);
        assertThat(y.path("topMonth").path("count").asInt()).isEqualTo(2);
        assertThat(y.path("topPlace").path("placeName").asText()).isEqualTo("Сөүл");
        assertThat(y.path("slides").size()).isBetween(6, 10);
        assertThat(y.path("slides").get(0).path("kind").asText()).isEqualTo("TITLE");
        assertThat(y.path("slides").get(y.path("slides").size() - 1).path("kind").asText()).isEqualTo("CLOSING");
        assertThat(y.path("topMemories").size()).isEqualTo(4);
        assertThat(ok(call(a, "GET", "/year-in-review/2025"), 200).path("totals").path("memories").asInt()).isEqualTo(1);
        assertThat(call(a, "GET", "/year-in-review/2027").statusCode()).isEqualTo(404);

        TestUser c = user("yr-c");
        TestUser d = user("yr-d");
        pair(c, d);
        JsonNode other = ok(call(c, "GET", "/year-in-review/2026"), 200);
        assertThat(other.path("totals").path("memories").asInt()).isZero();
        assertThat(other.path("topMemories").size()).isZero();
        assertThat(other.path("slides").size()).isBetween(6, 10);
        assertThat(LocalDate.of(2026, 1, 1)).isNotNull();
    }
}
