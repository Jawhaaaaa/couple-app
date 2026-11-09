package mn.aura.couple.anniversary;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import mn.aura.couple.anniversary.app.AutoMilestoneCalculator;
import mn.aura.couple.anniversary.app.AutoMilestoneCalculator.AutoOccasion;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class AutoMilestoneCalculatorTest {

    @Test
    @DisplayName("AC-38 2024-02-29-ний жил бүрийн ой: 2025-02-28, 2026-02-28, 2028-02-29 (SD-03)")
    void leapDay() {
        LocalDate date = LocalDate.parse("2024-02-29");
        assertThat(AutoMilestoneCalculator.nextOn(date, true, LocalDate.parse("2025-01-01"))).isEqualTo("2025-02-28");
        assertThat(AutoMilestoneCalculator.nextOn(date, true, LocalDate.parse("2025-03-01"))).isEqualTo("2026-02-28");
        assertThat(AutoMilestoneCalculator.nextOn(date, true, LocalDate.parse("2026-02-28"))).isEqualTo("2026-02-28");
        assertThat(AutoMilestoneCalculator.nextOn(date, true, LocalDate.parse("2027-03-01"))).isEqualTo("2028-02-29");
        // Давтагдахгүй ой өөрийн огноондоо үлдэнэ (AC-181)
        assertThat(AutoMilestoneCalculator.nextOn(date, false, LocalDate.parse("2027-03-01"))).isEqualTo("2024-02-29");
    }

    @Test
    @DisplayName("AC-102 эхэлсэн 2024-10-24: 100/200/300/365/500/1000 хоног (SD-01) ба 1/2/3/5/10 жил")
    void milestones() {
        Map<String, LocalDate> m = AutoMilestoneCalculator.milestones(LocalDate.parse("2024-10-24")).stream()
                .collect(Collectors.toMap(AutoOccasion::key, AutoOccasion::date));
        assertThat(m).containsEntry("days:100", LocalDate.parse("2025-01-31"))
                .containsEntry("days:200", LocalDate.parse("2025-05-11"))
                .containsEntry("days:300", LocalDate.parse("2025-08-19"))
                .containsEntry("days:365", LocalDate.parse("2025-10-23"))
                .containsEntry("days:500", LocalDate.parse("2026-03-07"))
                .containsEntry("days:1000", LocalDate.parse("2027-07-20"))
                .containsEntry("years:1", LocalDate.parse("2025-10-24"))
                .containsEntry("years:2", LocalDate.parse("2026-10-24"))
                .containsEntry("years:3", LocalDate.parse("2027-10-24"))
                .containsEntry("years:5", LocalDate.parse("2029-10-24"))
                .containsEntry("years:10", LocalDate.parse("2034-10-24"));
        assertThat(m).hasSize(11);
        assertThat(AutoMilestoneCalculator.milestones(null)).isEmpty();
    }

    @Test
    @DisplayName("AC-102 A-гийн төрсөн өдөр 1995-03-10 → 03-12 болгоход дараагийн огноо шинэчлэгдэнэ")
    void birthdayFollowsProfile() {
        UUID a = UUID.randomUUID();
        LocalDate today = LocalDate.parse("2026-11-07");
        AutoOccasion before = AutoMilestoneCalculator.birthday(a, LocalDate.parse("1995-03-10"));
        assertThat(before.key()).isEqualTo("birthday:" + a);
        assertThat(before.recurring()).isTrue();
        assertThat(AutoMilestoneCalculator.nextOn(before.date(), true, today)).isEqualTo("2027-03-10");
        AutoOccasion after = AutoMilestoneCalculator.birthday(a, LocalDate.parse("1995-03-12"));
        assertThat(AutoMilestoneCalculator.nextOn(after.date(), true, today)).isEqualTo("2027-03-12");
        // Эхэлсэн жилийн 02-29-тэй хос — 1 жилийн ой 02-28 (SD-03)
        assertThat(AutoMilestoneCalculator.milestones(LocalDate.parse("2024-02-29")).stream()
                .filter(o -> o.key().equals("years:1")).findFirst().orElseThrow().date()).isEqualTo("2025-02-28");
    }

    @Test
    @DisplayName("AC-103 «18 хоног үлдлээ», «3 хоногийн өмнө» — хэрэглэгчийн бүсийн (Asia/Tokyo) огноогоор")
    void daysUntilAndSinceInViewerZone() {
        Instant now = Instant.parse("2026-11-07T15:30:00Z"); // Токиод 11-08 00:30, УБ-д 11-07 23:30
        LocalDate tokyo = now.atZone(ZoneId.of("Asia/Tokyo")).toLocalDate();
        LocalDate ub = now.atZone(ZoneId.of("Asia/Ulaanbaatar")).toLocalDate();
        LocalDate ahead = LocalDate.parse("2026-11-26");
        LocalDate past = LocalDate.parse("2026-11-05");

        assertThat(AutoMilestoneCalculator.daysUntil(ahead, tokyo)).isEqualTo(18);
        assertThat(AutoMilestoneCalculator.daysSince(ahead, tokyo)).isNull();
        assertThat(AutoMilestoneCalculator.daysSince(past, tokyo)).isEqualTo(3);
        assertThat(AutoMilestoneCalculator.daysUntil(past, tokyo)).isZero();
        // Ижил агшинд УБ-ийн хэрэглэгчид нэг өдрөөр зөрнө
        assertThat(AutoMilestoneCalculator.daysUntil(ahead, ub)).isEqualTo(19);
        assertThat(AutoMilestoneCalculator.daysSince(past, ub)).isEqualTo(2);
        // Өнөөдөр бол 0 хоног үлдсэн, өнгөрөөгүй
        assertThat(AutoMilestoneCalculator.daysUntil(tokyo, tokyo)).isZero();
        assertThat(AutoMilestoneCalculator.daysSince(tokyo, tokyo)).isNull();
    }

    @Test
    @DisplayName("Түлхүүрээс эх тодорхойлох")
    void sourceOf() {
        assertThat(AutoMilestoneCalculator.sourceOf("days:1000")).isEqualTo(AutoMilestoneCalculator.Source.AUTO_DAYS);
        assertThat(AutoMilestoneCalculator.sourceOf("years:5")).isEqualTo(AutoMilestoneCalculator.Source.AUTO_YEARS);
        assertThat(AutoMilestoneCalculator.sourceOf("custom:" + UUID.randomUUID())).isEqualTo(AutoMilestoneCalculator.Source.CUSTOM);
        assertThat(AutoMilestoneCalculator.sourceOf("birthday:" + UUID.randomUUID())).isEqualTo(AutoMilestoneCalculator.Source.BIRTHDAY);
        assertThat(AutoMilestoneCalculator.sourceOf("nope")).isNull();
        assertThat(List.of(100, 200, 300, 365, 500, 1000)).isEqualTo(AutoMilestoneCalculator.DAY_MILESTONES);
    }
}
