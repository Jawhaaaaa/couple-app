package mn.aura.couple.anniversary.app;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.common.time.CoupleCalendar;

/**
 * Автомат ой ба огнооны тооцоо (FR-8.2, FR-8.3) — цэвэр функц, DB-гүй:
 * <ul>
 *   <li>«N хоног» (100, 200, 300, 365, 500, 1000) = тоолуур N болох өдөр, эхэлсэн + N − 1 (SD-01, AC-102)</li>
 *   <li>«N жил» (1, 2, 3, 5, 10) = эхэлсэн өдрийн N жилийн ой; 02-29 → үсэрт бус жилд 02-28 (SD-03, AC-38)</li>
 *   <li>Төрсөн өдөр — профайлын `birth_date`-аас жил бүр; профайл солигдоход шууд шинэчлэгдэнэ (AC-102)</li>
 *   <li>`daysUntil` / `daysSince` — харагчийн бүсийн «өнөөдөр»-өөр (AC-103)</li>
 * </ul>
 */
public final class AutoMilestoneCalculator {

    public static final List<Integer> DAY_MILESTONES = List.of(100, 200, 300, 365, 500, 1000);
    public static final List<Integer> YEAR_MILESTONES = List.of(1, 2, 3, 5, 10);

    public enum Source { CUSTOM, AUTO_DAYS, AUTO_YEARS, BIRTHDAY }

    /** Нэг автомат ой: `n` нь хоног эсвэл жилийн тоо (төрсөн өдөрт 0). */
    public record AutoOccasion(String key, Source source, int n, LocalDate date, boolean recurring, UUID userId) {
    }

    private AutoMilestoneCalculator() {
    }

    /** Эхэлсэн өдрөөс тооцох бүх хоног ба жилийн ой (эхэлсэн өдөргүй бол хоосон). */
    public static List<AutoOccasion> milestones(LocalDate start) {
        List<AutoOccasion> out = new ArrayList<>();
        if (start == null) {
            return out;
        }
        for (int n : DAY_MILESTONES) {
            out.add(new AutoOccasion("days:" + n, Source.AUTO_DAYS, n, CoupleCalendar.dayMilestone(start, n), false, null));
        }
        for (int n : YEAR_MILESTONES) {
            out.add(new AutoOccasion("years:" + n, Source.AUTO_YEARS, n, CoupleCalendar.yearMilestone(start, n), false, null));
        }
        return out;
    }

    public static AutoOccasion birthday(UUID userId, LocalDate birthDate) {
        return new AutoOccasion("birthday:" + userId, Source.BIRTHDAY, 0, birthDate, true, userId);
    }

    /**
     * Харагдах тохиолдол: давтагдах ойд `anchor`-оос хойших хамгийн ойрын жилийн ой (SD-03), давтагдахгүйд
     * огноо өөрөө.
     */
    public static LocalDate nextOn(LocalDate date, boolean recurring, LocalDate anchor) {
        return recurring ? CoupleCalendar.nextAnnual(date, anchor) : date;
    }

    /** «N хоног үлдлээ» — өнгөрсөн бол 0. */
    public static int daysUntil(LocalDate nextOn, LocalDate today) {
        return (int) Math.max(0, ChronoUnit.DAYS.between(today, nextOn));
    }

    /** «N хоногийн өмнө» — зөвхөн өнгөрсөн тохиолдолд, үгүй бол null. */
    public static Integer daysSince(LocalDate nextOn, LocalDate today) {
        return nextOn.isBefore(today) ? (int) ChronoUnit.DAYS.between(nextOn, today) : null;
    }

    /** `days:1000` · `years:5` · `birthday:<uuid>` · `custom:<uuid>` → эх (танихгүй бол null). */
    public static Source sourceOf(String key) {
        if (key == null) {
            return null;
        }
        if (key.startsWith("custom:")) {
            return Source.CUSTOM;
        }
        if (key.startsWith("days:")) {
            return Source.AUTO_DAYS;
        }
        if (key.startsWith("years:")) {
            return Source.AUTO_YEARS;
        }
        return key.startsWith("birthday:") ? Source.BIRTHDAY : null;
    }
}
