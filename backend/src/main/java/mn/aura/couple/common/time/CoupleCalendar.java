package mn.aura.couple.common.time;

import java.time.LocalDate;
import java.time.Period;
import java.time.temporal.ChronoUnit;

/**
 * Хосын тоолуур ба ойн огноо (DD-AURA-019) — цэвэр функц. Mobile `src/domain/dates.ts`-тэй ижил
 * тестийн хүснэгт (`mobile/src/domain/date-cases.json`) хоёр талд уншигдана.
 * <ul>
 *   <li>SD-01: эхэлсэн өдөр = 1 дэх өдөр — тоолуур = (өнөөдөр − эхэлсэн) + 1; эхлээгүй бол 0</li>
 *   <li>Задаргаа — хуанлийн зөрүү «2 жил 0 сар 14 өдөр» (AC-69)</li>
 *   <li>«N хоног»-ийн ой = эхэлсэн + N − 1; «N жил» = эхэлсэн өдрийн N жилийн дараах ижил огноо</li>
 *   <li>SD-03: 02-29 → үсэрт бус жилд 02-28 (сарын сүүлийн өдөр, AC-38)</li>
 * </ul>
 */
public final class CoupleCalendar {

    private CoupleCalendar() {
    }

    public static long counterDays(LocalDate start, LocalDate today) {
        if (start == null || today.isBefore(start)) {
            return 0;
        }
        return ChronoUnit.DAYS.between(start, today) + 1;
    }

    public static Period breakdown(LocalDate start, LocalDate today) {
        if (start == null || today.isBefore(start)) {
            return Period.ZERO;
        }
        return Period.between(start, today);
    }

    /** Тоолуур N болох өдөр (SD-01, SD-06). */
    public static LocalDate dayMilestone(LocalDate start, int n) {
        return start.plusDays(n - 1L);
    }

    /** Эхэлсэн өдрийн N жилийн ой — `plusYears` нь 02-29-ийг 02-28 болгоно (SD-03). */
    public static LocalDate yearMilestone(LocalDate start, int years) {
        return start.plusYears(years);
    }

    /** Жил бүр давтагдах огнооны `onOrAfter`-аас хойших хамгийн ойрын тохиолдол (SD-03). */
    public static LocalDate nextAnnual(LocalDate date, LocalDate onOrAfter) {
        if (!date.isBefore(onOrAfter)) {
            return date;
        }
        // withYear нь 02-29-ийг үсэрт бус жилд 02-28 болгоно
        LocalDate candidate = date.withYear(onOrAfter.getYear());
        return candidate.isBefore(onOrAfter) ? date.withYear(onOrAfter.getYear() + 1) : candidate;
    }
}
