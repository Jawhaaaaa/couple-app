package mn.aura.couple.common;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.File;
import java.time.LocalDate;
import java.time.Period;
import mn.aura.couple.common.time.CoupleCalendar;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** DD-AURA-019: mobile `dates.ts`-тэй ижил хүснэгт (`mobile/src/domain/date-cases.json`). */
class CoupleCalendarTest {

    private static final JsonNode CASES = load();

    private static JsonNode load() {
        try {
            return new ObjectMapper().readTree(new File("../mobile/src/domain/date-cases.json"));
        } catch (java.io.IOException e) {
            throw new IllegalStateException("date-cases.json уншигдсангүй", e);
        }
    }

    @Test
    @DisplayName("AC-13 AC-69 тоолуур (SD-01) ба жил/сар/өдрийн задаргаа")
    void counter() {
        assertThat(CASES.path("counter")).isNotEmpty();
        for (JsonNode c : CASES.path("counter")) {
            LocalDate start = LocalDate.parse(c.path("start").asText());
            LocalDate today = LocalDate.parse(c.path("today").asText());
            assertThat(CoupleCalendar.counterDays(start, today)).as(c.toString()).isEqualTo(c.path("days").asLong());
            Period p = CoupleCalendar.breakdown(start, today);
            assertThat(p.getYears()).as(c.toString()).isEqualTo(c.path("years").asInt());
            assertThat(p.getMonths()).as(c.toString()).isEqualTo(c.path("months").asInt());
            assertThat(p.getDays()).as(c.toString()).isEqualTo(c.path("dayPart").asInt());
        }
    }

    @Test
    @DisplayName("AC-38 AC-102 «N хоног», «N жил» ой ба жил бүрийн давталт (02-29 → 02-28)")
    void milestones() {
        for (JsonNode c : CASES.path("dayMilestone")) {
            assertThat(CoupleCalendar.dayMilestone(LocalDate.parse(c.path("start").asText()), c.path("n").asInt()))
                    .as(c.toString()).isEqualTo(LocalDate.parse(c.path("date").asText()));
        }
        for (JsonNode c : CASES.path("yearMilestone")) {
            assertThat(CoupleCalendar.yearMilestone(LocalDate.parse(c.path("start").asText()), c.path("years").asInt()))
                    .as(c.toString()).isEqualTo(LocalDate.parse(c.path("date").asText()));
        }
        for (JsonNode c : CASES.path("nextAnnual")) {
            assertThat(CoupleCalendar.nextAnnual(LocalDate.parse(c.path("date").asText()),
                    LocalDate.parse(c.path("onOrAfter").asText())))
                    .as(c.toString()).isEqualTo(LocalDate.parse(c.path("next").asText()));
        }
    }
}
