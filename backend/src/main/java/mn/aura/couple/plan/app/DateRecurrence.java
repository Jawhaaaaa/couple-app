package mn.aura.couple.plan.app;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

/**
 * Давтагдах болзооны огноо (FR-7.10, SD-03, AC-37) — цэвэр функц.
 * <ul>
 *   <li>`WEEKLY` — эхний өдрөөс 7 хоног тутам</li>
 *   <li>`MONTHLY` — эхний өдрийн сарын өдөр; тухайн сард тэр өдөр байхгүй бол (29–31) сарын сүүлийн өдөр.
 *       Үргэлж анхны өдрөөс тооцно — 1-31 → 2-28 → 3-31 (шилжилт хуримтлагдахгүй)</li>
 * </ul>
 * Огноо нь болзооны өөрийн бүсийн (`timezone`) локал огноо; цаг нь эхний болзооны локал цаг (DST-д ч локал цаг
 * хадгалагдана). `until` (хамааруулсан) хүртэл.
 */
public final class DateRecurrence {

    public enum Kind { NONE, WEEKLY, MONTHLY }

    /** Нэг удаад задлах дээд тоо (хязгааргүй давталтын хамгаалалт). */
    public static final int MAX_OCCURRENCES = 1000;

    private DateRecurrence() {
    }

    /** `n` дэх (0-ээс) давталтын огноо. */
    public static LocalDate nth(LocalDate first, Kind kind, long n) {
        return switch (kind) {
            case NONE -> first;
            case WEEKLY -> first.plusWeeks(n);
            case MONTHLY -> {
                YearMonth ym = YearMonth.from(first).plusMonths(n);
                yield ym.atDay(Math.min(first.getDayOfMonth(), ym.lengthOfMonth()));
            }
        };
    }

    /** `date` нь энэ цувааны давталт мөн эсэх (`until`-ийг тооцно). */
    public static boolean isOccurrence(LocalDate first, Kind kind, LocalDate until, LocalDate date) {
        if (date.isBefore(first) || (until != null && date.isAfter(until))) {
            return false;
        }
        return switch (kind) {
            case NONE -> date.equals(first);
            case WEEKLY -> ChronoUnit.DAYS.between(first, date) % 7 == 0;
            case MONTHLY -> nth(first, kind, ChronoUnit.MONTHS.between(YearMonth.from(first), YearMonth.from(date)))
                    .equals(date);
        };
    }

    /** `[from, to]` (хамааруулсан) муж дахь давталтын огноонууд. */
    public static List<LocalDate> between(LocalDate first, Kind kind, LocalDate until, LocalDate from, LocalDate to) {
        List<LocalDate> out = new ArrayList<>();
        if (kind == Kind.NONE) {
            if (!first.isBefore(from) && !first.isAfter(to)) {
                out.add(first);
            }
            return out;
        }
        LocalDate end = until != null && until.isBefore(to) ? until : to;
        long n = 0;
        if (from.isAfter(first)) {
            // Эхлэлээс хол бол шууд ойролцоо алхам руу үсэрнэ
            n = kind == Kind.WEEKLY ? ChronoUnit.WEEKS.between(first, from)
                    : Math.max(0, ChronoUnit.MONTHS.between(YearMonth.from(first), YearMonth.from(from)) - 1);
        }
        for (; out.size() < MAX_OCCURRENCES; n++) {
            LocalDate d = nth(first, kind, n);
            if (d.isAfter(end)) {
                break;
            }
            if (!d.isBefore(from)) {
                out.add(d);
            }
        }
        return out;
    }

    /** Тухайн давталтын эхлэх агшин: огноо + эхний болзооны локал цаг, болзооны бүсээр → UTC. */
    public static Instant startOf(Instant seriesStart, ZoneId zone, LocalDate occurrenceOn) {
        LocalTime localTime = seriesStart.atZone(zone).toLocalTime();
        return ZonedDateTime.of(occurrenceOn, localTime, zone).toInstant();
    }

    public static LocalDate localDate(Instant at, ZoneId zone) {
        return at.atZone(zone).toLocalDate();
    }
}
