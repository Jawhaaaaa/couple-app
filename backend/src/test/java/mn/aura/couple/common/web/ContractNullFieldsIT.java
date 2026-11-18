package mn.aura.couple.common.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import mn.aura.couple.AbstractSpaceIT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * DEV_TEST согог 1: `contracts/openapi.yaml`-д `required` + `nullable` гэж зарласан талбар утга нь `null`
 * үед ч хариунд (`"x": null`) байна. Deployed дээр хасагдаж байсан 8 endpoint-ийг бодит HTTP-ээр шалгана.
 */
class ContractNullFieldsIT extends AbstractSpaceIT {

    @Test
    @DisplayName("Гэрээний required + nullable талбар null утгатайгаар хариунд байна (8 endpoint)")
    void requiredNullableFieldsArePresentAsNull() {
        clock.set(Instant.parse("2026-11-10T02:00:00Z"));
        TestUser a = user("cnull-a");
        TestUser b = user("cnull-b");

        // POST /pairings/{id}/confirm → Couple.myView.partnerNickname (хоч өгөөгүй)
        String code = ok(call(a, "POST", "/invites"), 201).path("code").asText();
        String pairingId = ok(call(b, "POST", "/pairings", body("code", code)), 201).path("id").asText();
        JsonNode confirmed = ok(call(a, "POST", "/pairings/" + pairingId + "/confirm"), 200);
        assertNullPresent(confirmed.path("myView"), "partnerNickname", "POST /pairings/{id}/confirm");

        // PUT /couple/start-date
        JsonNode startDate = ok(call(a, "PUT", "/couple/start-date", body("date", "2024-10-24")), 200);
        assertNullPresent(startDate.path("myView"), "partnerNickname", "PUT /couple/start-date");

        // GET /couple
        assertNullPresent(ok(call(b, "GET", "/couple"), 200).path("myView"), "partnerNickname", "GET /couple");

        // GET /questions/today → myAnswer (хариулаагүй)
        assertNullPresent(ok(call(a, "GET", "/questions/today"), 200), "myAnswer", "GET /questions/today");

        // Хуудаслалтын сүүлийн хуудас → nextCursor
        assertNullPresent(ok(call(a, "GET", "/memories"), 200), "nextCursor", "GET /memories");
        assertNullPresent(ok(call(a, "GET", "/questions/history"), 200), "nextCursor", "GET /questions/history");
        assertNullPresent(ok(call(a, "GET", "/notifications"), 200), "nextCursor", "GET /notifications");

        // GET /me/first-week-tasks → today.status (хийгээгүй даалгавар)
        JsonNode firstWeek = ok(call(a, "GET", "/me/first-week-tasks"), 200);
        assertNullPresent(firstWeek.path("today"), "status", "GET /me/first-week-tasks");
    }

    @Test
    @DisplayName("Гэрээний required биш талбар null үед хариунаас хасагдана")
    void optionalNullFieldsAreOmitted() {
        TestUser a = user("cnull-opt");
        // FirstWeekState.today — required биш; ганцаараа үед утгагүй
        JsonNode solo = ok(call(a, "GET", "/me/first-week-tasks"), 200);
        assertThat(solo.has("today")).isFalse();
        // DailyQuestion.partnerAnswer — required биш; хамтрагч хариулах хүртэл API-д байхгүй (AC-15)
        TestUser b = user("cnull-opt-b");
        pair(a, b);
        assertThat(ok(call(a, "GET", "/questions/today"), 200).has("partnerAnswer")).isFalse();
    }

    private static void assertNullPresent(JsonNode node, String field, String endpoint) {
        assertThat(node.has(field)).as(endpoint + " → " + field + " хариунд байх ёстой: " + node).isTrue();
        assertThat(node.get(field).isNull()).as(endpoint + " → " + field + " = null").isTrue();
    }
}
