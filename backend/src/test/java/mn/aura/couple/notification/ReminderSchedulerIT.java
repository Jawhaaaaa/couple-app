package mn.aura.couple.notification;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.AbstractSpaceIT;
import mn.aura.couple.notification.app.GreetingJob;
import mn.aura.couple.notification.app.InactivityReminderJob;
import mn.aura.couple.notification.app.ReminderScheduler;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** T-68: серверийн сануулга (Web Push), мэндчилгээ, идэвхгүй хэрэглэгчийн сануулга. */
class ReminderSchedulerIT extends AbstractSpaceIT {

    @Autowired
    ReminderScheduler scheduler;
    @Autowired
    GreetingJob greetings;
    @Autowired
    InactivityReminderJob inactivity;

    private int count(TestUser u, String type) {
        return jdbc.queryForObject("SELECT count(*) FROM notification WHERE user_id = ? AND type = ?", Integer.class,
                u.id(), type);
    }

    @Test
    @DisplayName("AC-155 AC-180 вэб хэрэглэгч (Токио), болзоо 1 цагийн сануулгатай → 1 цагийн өмнө серверээс Web Push; native локал төхөөрөмжид давхар push 0")
    void webPushReminder() throws Exception {
        clock.set(Instant.parse("2026-11-07T01:00:00Z"));
        TestUser a = user("rs-a");
        TestUser b = user("rs-b");
        jdbc.update("UPDATE users SET timezone = 'Asia/Tokyo' WHERE id = ?", b.id());
        pair(a, b);
        PushTestDevice web = PushTestDevice.create(this::url);
        ok(call(b, "POST", "/push-subscriptions", web.subscriptionJson()), 201);
        PushTestDevice nativeLocal = PushTestDevice.create(this::url);
        ok(call(b, "POST", "/push-subscriptions", nativeLocal.subscriptionJson()
                .replace("\"localReminders\":false", "\"localReminders\":true")), 201);
        // Болзоо Токиогийн 15:00 (06:00 UTC), сануулга 60 мин
        String id = ok(call(a, "POST", "/plans", "{\"clientId\":\"" + UUID.randomUUID() + "\",\"title\":\"Видео дуудлага\","
                + "\"startsAt\":\"2026-11-07T06:00:00Z\",\"timezone\":\"Asia/Tokyo\",\"reminderOffsets\":[60],"
                + "\"recurrence\":\"NONE\",\"checklist\":[]}"), 201).path("id").asText();
        ok(call(b, "POST", "/plans/" + id + "/respond", body("action", "ACCEPT")), 200);
        Thread.sleep(500);
        web.messages();
        int webBefore = web.messages().size();
        int localBefore = nativeLocal.messages().size();

        // Native: GET /reminders-оор локал товлоно
        JsonNode list = ok(call(b, "GET", "/reminders"), 200);
        JsonNode mine = null;
        for (JsonNode r : list) {
            if (r.path("sourceId").asText().equals(id)) {
                mine = r;
            }
        }
        assertThat(mine).isNotNull();
        assertThat(mine.path("sourceType").asText()).isEqualTo("DATE_PLAN");
        Instant fireAt = Instant.parse(mine.path("fireAt").asText());
        assertThat(fireAt).isEqualTo(Instant.parse("2026-11-07T05:00:00Z"));
        assertThat(fireAt.atZone(ZoneId.of("Asia/Tokyo")).toLocalTime()).isEqualTo(LocalTime.of(14, 0));
        assertThat(mine.path("title").asText()).isNotBlank();

        clock.set(Instant.parse("2026-11-07T04:59:00Z"));
        scheduler.runOnce();
        assertThat(count(b, "DATE_REMINDER")).isZero();
        clock.set(Instant.parse("2026-11-07T05:00:20Z"));
        assertThat(scheduler.runOnce()).isPositive();
        assertThat(count(b, "DATE_REMINDER")).isEqualTo(1);
        assertThat(count(a, "DATE_REMINDER")).isEqualTo(1);
        List<JsonNode> pushes = web.await(webBefore + 1, 5000);
        assertThat(pushes.subList(webBefore, pushes.size())).extracting(p -> p.path("type").asText()).contains("DATE_REMINDER");
        Thread.sleep(500);
        assertThat(nativeLocal.messages()).hasSize(localBefore);
        // Дахин ажиллахад давхар илгээхгүй
        scheduler.runOnce();
        assertThat(count(b, "DATE_REMINDER")).isEqualTo(1);
    }

    @Test
    @DisplayName("AC-121 GAP-26 B (Токио) «Сайхан өглөө» асаалттай → түүний 08:00 ± 5 мин-д мэндчилгээ; унтраасан хэрэглэгчид 0")
    void morningGreetingInRecipientZone() {
        clock.set(Instant.parse("2026-11-07T22:40:00Z")); // Токио 11-08 07:40
        TestUser a = user("gr-a");
        TestUser b = user("gr-b");
        jdbc.update("UPDATE users SET timezone = 'Asia/Tokyo' WHERE id = ?", b.id());
        pair(a, b);
        JsonNode sb = ok(call(b, "GET", "/notification-settings"), 200);
        ok(call(b, "PUT", "/notification-settings", sb.toString().replace("\"greetingMorning\":false", "\"greetingMorning\":true")
                .replace("\"greetingEvening\":true", "\"greetingEvening\":false")), 200);
        JsonNode sa = ok(call(a, "GET", "/notification-settings"), 200);
        ok(call(a, "PUT", "/notification-settings", sa.toString().replace("\"greetingMorning\":true", "\"greetingMorning\":false")
                .replace("\"greetingEvening\":true", "\"greetingEvening\":false")), 200);

        greetings.runOnce();
        JsonNode list = ok(call(b, "GET", "/reminders"), 200);
        boolean scheduled = false;
        for (JsonNode r : list) {
            if ("GREETING".equals(r.path("sourceType").asText())) {
                assertThat(Instant.parse(r.path("fireAt").asText())).isEqualTo(Instant.parse("2026-11-07T23:00:00Z"));
                scheduled = true;
            }
        }
        assertThat(scheduled).isTrue();

        clock.set(Instant.parse("2026-11-07T23:00:30Z"));
        scheduler.runOnce();
        greetings.runOnce(); // дараагийн өдрийнхийг товлоно, өнөөдрийнх давхардахгүй
        scheduler.runOnce();
        assertThat(count(b, "GREETING_MORNING")).isEqualTo(1);
        Instant at = jdbc.queryForObject("SELECT created_at FROM notification WHERE user_id = ? AND type = 'GREETING_MORNING'",
                Timestamp.class, b.id()).toInstant();
        assertThat(Duration.between(Instant.parse("2026-11-07T23:00:00Z"), at).abs()).isLessThanOrEqualTo(Duration.ofMinutes(5));
        assertThat(count(a, "GREETING_MORNING")).isZero();
        assertThat(jdbc.queryForObject("""
                SELECT fire_at FROM scheduled_reminder WHERE user_id = ? AND source_type = 'GREETING' AND status = 'PENDING'
                """, Timestamp.class, b.id()).toInstant()).isEqualTo(Instant.parse("2026-11-08T23:00:00Z"));
    }

    @Test
    @DisplayName("AC-122 B 7 хоног апп нээгээгүй: 14 хоног ажиллуулахад 7 хоногийн дараа нэг сануулга, дараагийн 7 хоногт ≤ 1")
    void inactivityWeekly() {
        Instant t0 = Instant.parse("2027-03-01T03:00:00Z");
        clock.set(t0);
        TestUser a = user("ia-a");
        TestUser b = user("ia-b");
        pair(a, b);
        jdbc.update("UPDATE users SET last_active_at = ? WHERE id = ?", Timestamp.from(t0), b.id());
        jdbc.update("UPDATE device_session SET last_used_at = ? WHERE user_id = ?", Timestamp.from(t0), b.id());
        int firstDay = -1;
        for (int day = 1; day <= 14; day++) {
            Instant now = t0.plus(Duration.ofDays(day));
            clock.set(now);
            // A өдөр бүр апп нээнэ
            jdbc.update("UPDATE users SET last_active_at = ? WHERE id = ?", Timestamp.from(now), a.id());
            for (int hour = 0; hour < 24; hour += 6) {
                clock.set(now.plus(Duration.ofHours(hour)));
                inactivity.runOnce();
            }
            if (firstDay < 0 && count(b, "INACTIVITY_NUDGE") > 0) {
                firstDay = day;
            }
            if (day < 7) {
                assertThat(count(b, "INACTIVITY_NUDGE")).as("day " + day).isZero();
            }
        }
        assertThat(firstDay).isEqualTo(7);
        assertThat(count(b, "INACTIVITY_NUDGE")).isBetween(1, 2);
        Timestamp[] at = jdbc.queryForList("SELECT created_at FROM notification WHERE user_id = ? AND type = 'INACTIVITY_NUDGE' "
                + "ORDER BY created_at", Timestamp.class, b.id()).toArray(Timestamp[]::new);
        for (int i = 1; i < at.length; i++) {
            assertThat(Duration.between(at[i - 1].toInstant(), at[i].toInstant())).isGreaterThanOrEqualTo(Duration.ofDays(7));
        }
        assertThat(count(a, "INACTIVITY_NUDGE")).isZero();
    }
}
