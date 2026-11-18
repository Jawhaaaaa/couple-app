package mn.aura.couple.admin;

import static mn.aura.couple.HttpTestClient.json;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Админ API (GAP-16: `aura.admin.emails` — тестэд `application-test.yml`). */
class AdminIT extends AbstractSpaceIT {

    static final String ADMIN_EMAIL = "admin-it@aura.test";

    /** Тогтмол имэйлтэй админ — JVM-д нэг удаа бүртгэнэ, дараа нь нэвтэрнэ. */
    private TestUser admin() {
        Integer exists = jdbc.queryForObject("SELECT count(*) FROM users WHERE email = ?", Integer.class, ADMIN_EMAIL);
        if (exists == 0) {
            registerVerified(ADMIN_EMAIL);
        }
        return new TestUser(userId(ADMIN_EMAIL), ADMIN_EMAIL, loginOk(ADMIN_EMAIL, PASSWORD).path("accessToken").asText());
    }

    @Test
    @DisplayName("AC-186 AC-206 энгийн хэрэглэгч админ API бүрд 403 ADMIN_ONLY; токенгүй бол 401")
    void nonAdminForbidden() {
        TestUser u = user("adm-plain");
        TestUser victim = user("adm-victim");
        for (var r : List.of(
                call(u, "GET", "/admin/metrics"),
                call(u, "POST", "/admin/users/" + victim.id() + "/suspend", body("reason", "туршилт")),
                call(u, "POST", "/admin/users/" + victim.id() + "/unsuspend", ""))) {
            assertThat(r.statusCode()).as(r.body()).isEqualTo(403);
            assertThat(code(r)).isEqualTo("ADMIN_ONLY");
        }
        assertThat(jdbc.queryForObject("SELECT status FROM users WHERE id = ?", String.class, victim.id())).isEqualTo("ACTIVE");
        assertThat(mn.aura.couple.HttpTestClient.send("GET", url("/api/v1/admin/metrics"), null).statusCode()).isEqualTo(401);
    }

    @Test
    @DisplayName("AC-186 түдгэлзсэн акаунт: гарт байсан токен 401, refresh 401, нэвтрэх 403 ACCOUNT_SUSPENDED; цуцлахад дахин нэвтэрнэ")
    void suspendAndUnsuspend() {
        TestUser admin = admin();
        String email = email("adm-susp");
        JsonNode tokens = registerVerified(email);
        TestUser target = new TestUser(userId(email), email, tokens.path("accessToken").asText());
        assertThat(call(target, "GET", "/me").statusCode()).isEqualTo(200);

        assertThat(call(admin, "POST", "/admin/users/" + target.id() + "/suspend", body("reason", "")).statusCode())
                .isEqualTo(400);
        assertThat(call(admin, "POST", "/admin/users/" + UUID.randomUUID() + "/suspend", body("reason", "алга")).statusCode())
                .isEqualTo(404);
        ok(call(admin, "POST", "/admin/users/" + target.id() + "/suspend", body("reason", "Хууль бус агуулга (FR-14.8)")), 204);

        assertThat(call(target, "GET", "/me").statusCode()).isEqualTo(401);
        assertThat(refresh(tokens.path("refreshToken").asText()).statusCode()).isEqualTo(401);
        var login = login(email, PASSWORD);
        assertThat(login.statusCode()).isEqualTo(403);
        assertThat(code(login)).isEqualTo("ACCOUNT_SUSPENDED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM device_session WHERE user_id = ? AND revoked_at IS NULL",
                Integer.class, target.id())).isZero();
        assertThat(jdbc.queryForList("SELECT action FROM user_suspension WHERE user_id = ? ORDER BY created_at",
                String.class, target.id())).containsExactly("SUSPEND");

        // Админ өөрийгөө түдгэлзүүлэхгүй
        assertThat(call(admin, "POST", "/admin/users/" + admin.id() + "/suspend", body("reason", "өөрийгөө")).statusCode())
                .isEqualTo(400);

        ok(call(admin, "POST", "/admin/users/" + target.id() + "/unsuspend", ""), 204); // бие заавал биш
        TestUser again = new TestUser(target.id(), email, loginOk(email, PASSWORD).path("accessToken").asText());
        assertThat(call(again, "GET", "/me").statusCode()).isEqualTo(200);
        // Idempotent
        ok(call(admin, "POST", "/admin/users/" + target.id() + "/unsuspend", body("reason", "давтан")), 204);
    }

    @Test
    @DisplayName("AC-206 /admin/metrics: холболт, эхний 7 хоногийн 3+ дурсамж, өдрийн дундаж, санал асуулгын нэгтгэл — хувь хүний агуулга, ID 0")
    void metricsAggregatesOnly() {
        // Өөр IT-ийн өгөгдөлтэй холилдохгүйн тулд тусгай он
        clock.set(Instant.parse("2033-05-01T03:00:00Z"));
        TestUser a = user("adm-ma");
        TestUser b = user("adm-mb");
        TestUser c = user("adm-mc");
        UUID space = pair(a, b);
        ok(call(c, "POST", "/invites"), 201); // ашиглагдаагүй урилга → холболт 1/2

        Timestamp day2 = Timestamp.from(Instant.parse("2033-05-02T10:00:00Z"));
        List<String> titles = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            String title = "Нууц дурсамж " + i;
            titles.add(title);
            jdbc.update("INSERT INTO memory (id, space_id, author_id, client_id, title, occurred_on, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    UUID.randomUUID(), space, a.id(), UUID.randomUUID(), title, LocalDate.parse("2033-05-02"), day2);
        }
        for (int i = 0; i < 4; i++) {
            jdbc.update("INSERT INTO chat_message (id, space_id, sender_id, client_message_id, kind, text, created_at) VALUES (?, ?, ?, ?, 'TEXT', ?, ?)",
                    UUID.randomUUID(), space, b.id(), UUID.randomUUID(), "Хувийн мессеж " + i, day2);
        }
        jdbc.update("INSERT INTO heart_signal (id, space_id, sender_id, client_id, kind, couple_day, created_at) VALUES (?, ?, ?, ?, 'HEART', ?, ?)",
                UUID.randomUUID(), space, a.id(), UUID.randomUUID(), LocalDate.parse("2033-05-02"), day2);

        ok(call(a, "GET", "/me"), 200);
        ok(call(a, "GET", "/me"), 200); // нэг session-ийн өдрийн давтан нээлт тоологдохгүй
        ok(call(b, "GET", "/me"), 200);
        ok(call(a, "POST", "/me/survey", body("score", 4)), 204);
        ok(call(b, "POST", "/me/survey", body("score", 2)), 204);
        ok(call(c, "POST", "/me/survey", body("score", null)), 204); // алгассан — тоологдохгүй

        TestUser admin = admin();
        var r = call(admin, "GET", "/admin/metrics?from=2033-05-01&to=2033-05-02");
        JsonNode m = ok(r, 200);
        assertThat(m.path("pairingSuccessRate").decimalValue()).isEqualByComparingTo("0.5");
        assertThat(m.path("firstWeek3MemoriesRate").decimalValue()).isEqualByComparingTo("1");
        assertThat(m.path("weeklyActiveAfter30d").decimalValue()).isBetween(java.math.BigDecimal.ZERO, java.math.BigDecimal.ONE);
        JsonNode daily = m.path("dailyAvg");
        assertThat(daily.path("opens").decimalValue()).isEqualByComparingTo("1"); // 2 нээлт / 2 өдөр
        assertThat(daily.path("messages").decimalValue()).isEqualByComparingTo("2");
        assertThat(daily.path("memories").decimalValue()).isEqualByComparingTo("1.5");
        assertThat(daily.path("hearts").decimalValue()).isEqualByComparingTo("0.5");
        JsonNode survey = m.path("survey");
        assertThat(survey.path("count").asInt()).isEqualTo(2);
        assertThat(survey.path("average").decimalValue()).isEqualByComparingTo("3");
        assertThat(survey.path("distribution").toString()).isEqualTo("[0,1,0,1,0]");

        // Зөвхөн гэрээний нэгтгэсэн талбар — ID, имэйл, нэр, агуулга 0
        List<String> fields = new ArrayList<>();
        m.fieldNames().forEachRemaining(fields::add);
        assertThat(fields).containsExactlyInAnyOrder("pairingSuccessRate", "firstWeek3MemoriesRate", "weeklyActiveAfter30d",
                "dailyAvg", "survey");
        String raw = r.body();
        for (TestUser u : List.of(a, b, c)) {
            assertThat(raw).doesNotContain(u.id().toString()).doesNotContain(u.email());
        }
        assertThat(raw).doesNotContain(space.toString()).doesNotContain("Бат").doesNotContain("Хувийн мессеж");
        titles.forEach(t -> assertThat(raw).doesNotContain(t));
        assertThat(json(r).findValues("id")).isEmpty();

        assertThat(call(admin, "GET", "/admin/metrics?from=2033-05-02&to=2033-05-01").statusCode()).isEqualTo(400);
        // Анхдагч хугацаа (сүүлийн 30 хоног) ажиллана
        ok(call(admin, "GET", "/admin/metrics"), 200);
    }
}
