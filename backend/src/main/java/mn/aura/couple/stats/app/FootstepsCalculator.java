package mn.aura.couple.stats.app;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import mn.aura.couple.common.geo.GeoMath;

/**
 * «Хамтын мөр» (FR-12.2, AC-47) — цэвэр функц. Байршилтай дурсамжуудыг огнооны (дараа нь үүсгэсэн) дарааллаар
 * холбосон агаарын шугамын нийлбэр (км, 1 оронтой), ялгаатай хот (хот + улсаар), ялгаатай улс.
 */
public final class FootstepsCalculator {

    /** Нэг байршилтай цэг. `order` нь ижил өдрийн дотор тогтвортой эрэмбэ (жишээ нь үүсгэсэн агшин). */
    public record Point(LocalDate on, long order, double lat, double lon, String city, String countryCode) {
    }

    public record Footsteps(int cities, int countries, BigDecimal distanceKm) {
    }

    private FootstepsCalculator() {
    }

    public static Footsteps compute(List<Point> points) {
        List<Point> sorted = points.stream()
                .sorted(Comparator.comparing(Point::on).thenComparingLong(Point::order)).toList();
        Set<String> cities = new HashSet<>();
        Set<String> countries = new HashSet<>();
        double km = 0;
        Point prev = null;
        for (Point p : sorted) {
            String country = p.countryCode() == null ? "" : p.countryCode().strip().toUpperCase(Locale.ROOT);
            if (p.city() != null && !p.city().isBlank()) {
                cities.add(p.city().strip().toLowerCase(Locale.ROOT) + "|" + country);
            }
            if (!country.isEmpty()) {
                countries.add(country);
            }
            if (prev != null) {
                km += GeoMath.distanceKm(prev.lat(), prev.lon(), p.lat(), p.lon());
            }
            prev = p;
        }
        return new Footsteps(cities.size(), countries.size(), BigDecimal.valueOf(km).setScale(1, RoundingMode.HALF_UP));
    }
}
