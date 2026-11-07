/** Дэлхийн дундаж радиус (IUGG, км) — backend `GeoMath`-тай ижил. */
export const EARTH_RADIUS_KM = 6371.0088;

export interface LatLon {
  lat: number;
  lon: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Агаарын шугамын зай (haversine, км) — алс зайн хэсэг (FR-3.7, AC-74). */
export function distanceKm(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
