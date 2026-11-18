/** Газрын зургийн цэг (`MemoryPlace`-ээс): нэр, координат, дурсамжийн тоо. */
export interface MapPoint {
  id: string;
  lat: number;
  lon: number;
  label: string;
  count: number;
}

/** Ойрхон цэгүүдийн бүлэг (AC-116): төв, нийт дурсамж, доторх цэгүүд. */
export interface MapCluster {
  id: string;
  lat: number;
  lon: number;
  count: number;
  points: MapPoint[];
}

export const TILE_SIZE = 256;
/** Энэ пикселээс ойр цэгүүд нэг cluster болно. */
export const CLUSTER_RADIUS_PX = 48;
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

/** Web Mercator — тухайн zoom-ын дэлхийн пиксел координат. */
export function project(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/**
 * Энгийн greedy cluster (markercluster-ын санаа, нэмэлт хамааралгүй): дурсамж ихтэйгээс эхлэн
 * цэг бүрийг `radiusPx` дотор байгаа хамгийн эхний бүлэгт нэгтгэнэ. Төв нь тоогоор жигнэсэн дундаж.
 */
export function clusterPoints(points: MapPoint[], zoom: number, radiusPx = CLUSTER_RADIUS_PX): MapCluster[] {
  const sorted = [...points].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  const clusters: { px: { x: number; y: number }; points: MapPoint[] }[] = [];
  for (const p of sorted) {
    const px = project(p.lat, p.lon, zoom);
    const hit = clusters.find((c) => Math.hypot(c.px.x - px.x, c.px.y - px.y) <= radiusPx);
    if (hit) hit.points.push(p);
    else clusters.push({ px, points: [p] });
  }
  return clusters.map((c) => {
    const count = c.points.reduce((n, p) => n + p.count, 0);
    const lat = c.points.reduce((n, p) => n + p.lat * p.count, 0) / count;
    const lon = c.points.reduce((n, p) => n + p.lon * p.count, 0) / count;
    return { id: c.points.map((p) => p.id).join('|'), lat, lon, count, points: c.points };
  });
}

/** Бүх цэгийг багтаах хүрээ ([[south, west], [north, east]]) — хоосон бол Улаанбаатар орчим. */
export function boundsOf(points: Pick<MapPoint, 'lat' | 'lon'>[]): [[number, number], [number, number]] {
  if (points.length === 0) return [[47.8, 106.8], [48.0, 107.1]];
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  return [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];
}
