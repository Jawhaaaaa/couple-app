package mn.aura.couple.common.geo;

/** Агаарын шугамын зай (haversine, дэлхийн дундаж радиус 6371 км) — AC-74, FR-12.2. Mobile `src/domain/geo.ts`-тэй ижил. */
public final class GeoMath {

    public static final double EARTH_RADIUS_KM = 6371.0088;

    private GeoMath() {
    }

    public static double distanceKm(double lat1, double lon1, double lat2, double lon2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
    }
}
