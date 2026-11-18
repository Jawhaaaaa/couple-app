package mn.aura.couple.stats;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import mn.aura.couple.common.geo.GeoMath;
import mn.aura.couple.stats.app.FootstepsCalculator;
import mn.aura.couple.stats.app.FootstepsCalculator.Footsteps;
import mn.aura.couple.stats.app.FootstepsCalculator.Point;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FootstepsCalculatorTest {

    static final double UB_LAT = 47.9184;
    static final double UB_LON = 106.9177;
    static final double DARKHAN_LAT = 49.4867;
    static final double DARKHAN_LON = 105.9228;
    static final double SEOUL_LAT = 37.5665;
    static final double SEOUL_LON = 126.9780;

    @Test
    @DisplayName("AC-47 3 хотод байршилтай 5 дурсамж: «3 хот», 2 улс, км = огнооны дарааллаар холбосон шугамын нийлбэр")
    void threeCities() {
        // Оролтын дараалал санамсаргүй — огноогоор эрэмбэлэгдэнэ
        List<Point> points = List.of(
                new Point(LocalDate.parse("2026-03-01"), 1, SEOUL_LAT, SEOUL_LON, "Seoul", "kr"),
                new Point(LocalDate.parse("2026-01-10"), 1, UB_LAT, UB_LON, "Улаанбаатар", "MN"),
                new Point(LocalDate.parse("2026-02-01"), 1, DARKHAN_LAT, DARKHAN_LON, "Дархан", "MN"),
                new Point(LocalDate.parse("2026-01-10"), 2, UB_LAT, UB_LON, "улаанбаатар", "MN"),
                new Point(LocalDate.parse("2026-04-01"), 1, UB_LAT, UB_LON, "Улаанбаатар", "MN"));
        Footsteps f = FootstepsCalculator.compute(points);
        assertThat(f.cities()).isEqualTo(3);
        assertThat(f.countries()).isEqualTo(2);
        double expected = GeoMath.distanceKm(UB_LAT, UB_LON, DARKHAN_LAT, DARKHAN_LON)
                + GeoMath.distanceKm(DARKHAN_LAT, DARKHAN_LON, SEOUL_LAT, SEOUL_LON)
                + GeoMath.distanceKm(SEOUL_LAT, SEOUL_LON, UB_LAT, UB_LON);
        assertThat(f.distanceKm()).isEqualByComparingTo(BigDecimal.valueOf(expected).setScale(1, java.math.RoundingMode.HALF_UP));
        assertThat(f.distanceKm().doubleValue()).isBetween(3500.0, 4500.0);
    }

    @Test
    @DisplayName("AC-47 байршилгүй/нэг цэг — 0 км")
    void empty() {
        assertThat(FootstepsCalculator.compute(List.of()).distanceKm()).isEqualByComparingTo(BigDecimal.ZERO);
        Footsteps one = FootstepsCalculator.compute(List.of(new Point(LocalDate.parse("2026-01-01"), 1, UB_LAT, UB_LON, null, null)));
        assertThat(one.cities()).isZero();
        assertThat(one.countries()).isZero();
        assertThat(one.distanceKm()).isEqualByComparingTo(BigDecimal.ZERO);
    }
}
