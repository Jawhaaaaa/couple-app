package mn.aura.couple.plan;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import mn.aura.couple.plan.app.DateRecurrence;
import mn.aura.couple.plan.app.DateRecurrence.Kind;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class DateRecurrenceTest {

    @Test
    @DisplayName("AC-37 SD-03 сар бүрийн 31-нд давтагдах болзоо 11-р сард 30-нд, 2-р сард 28/29-нд; шилжилт хуримтлагдахгүй")
    void monthlyEndOfMonth() {
        LocalDate first = LocalDate.parse("2026-10-31");
        assertThat(DateRecurrence.nth(first, Kind.MONTHLY, 1)).isEqualTo(LocalDate.parse("2026-11-30"));
        assertThat(DateRecurrence.nth(first, Kind.MONTHLY, 2)).isEqualTo(LocalDate.parse("2026-12-31"));
        assertThat(DateRecurrence.nth(first, Kind.MONTHLY, 4)).isEqualTo(LocalDate.parse("2027-02-28"));
        assertThat(DateRecurrence.nth(LocalDate.parse("2027-01-29"), Kind.MONTHLY, 13)).isEqualTo(LocalDate.parse("2028-02-29"));
        assertThat(DateRecurrence.between(first, Kind.MONTHLY, null, LocalDate.parse("2026-11-01"), LocalDate.parse("2026-11-30")))
                .containsExactly(LocalDate.parse("2026-11-30"));
        assertThat(DateRecurrence.isOccurrence(first, Kind.MONTHLY, null, LocalDate.parse("2026-11-30"))).isTrue();
        assertThat(DateRecurrence.isOccurrence(first, Kind.MONTHLY, null, LocalDate.parse("2026-11-29"))).isFalse();
        assertThat(DateRecurrence.isOccurrence(first, Kind.MONTHLY, null, LocalDate.parse("2027-03-31"))).isTrue();
    }

    @Test
    @DisplayName("AC-37 7 хоног тутам: муж доторх бүх удаа, until-ээр зогсоно")
    void weekly() {
        LocalDate first = LocalDate.parse("2026-11-06");
        assertThat(DateRecurrence.between(first, Kind.WEEKLY, null, LocalDate.parse("2026-11-01"), LocalDate.parse("2026-11-30")))
                .containsExactly(LocalDate.parse("2026-11-06"), LocalDate.parse("2026-11-13"), LocalDate.parse("2026-11-20"),
                        LocalDate.parse("2026-11-27"));
        assertThat(DateRecurrence.between(first, Kind.WEEKLY, LocalDate.parse("2026-11-20"), LocalDate.parse("2026-11-01"),
                LocalDate.parse("2026-12-31"))).hasSize(3);
        assertThat(DateRecurrence.between(first, Kind.WEEKLY, null, LocalDate.parse("2027-06-01"), LocalDate.parse("2027-06-30")))
                .allMatch(d -> d.getDayOfWeek() == first.getDayOfWeek()).hasSize(4);
        assertThat(DateRecurrence.isOccurrence(first, Kind.WEEKLY, null, LocalDate.parse("2026-11-12"))).isFalse();
        assertThat(DateRecurrence.isOccurrence(first, Kind.WEEKLY, null, LocalDate.parse("2026-10-30"))).isFalse();
    }

    @Test
    @DisplayName("AC-37 AC-34 давталтын цаг нь эхний болзооны локал цаг (болзооны бүсээр), UTC-д хөрвөнө")
    void localTimeKept() {
        Instant start = Instant.parse("2026-11-06T11:30:00Z"); // УБ 19:30
        assertThat(DateRecurrence.startOf(start, ZoneId.of("Asia/Ulaanbaatar"), LocalDate.parse("2026-11-13")))
                .isEqualTo(Instant.parse("2026-11-13T11:30:00Z"));
        // DST-тэй бүсэд локал цаг хадгалагдана
        Instant ny = Instant.parse("2026-10-30T23:30:00Z"); // Нью-Йорк 19:30 (EDT)
        assertThat(DateRecurrence.startOf(ny, ZoneId.of("America/New_York"), LocalDate.parse("2026-11-06")))
                .isEqualTo(Instant.parse("2026-11-07T00:30:00Z")); // 19:30 EST
    }
}
