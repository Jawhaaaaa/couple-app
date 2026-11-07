/**
 * Сонгосон зургийн EXIF-ээс огноо ба байршлын санал (FR-5.2, AC-79). `expo-image-picker`
 * (`exif: true`) iOS дээр `{Exif}`, `{GPS}` дэд объекттой, Android дээр хавтгай
 * (`DateTimeOriginal`, `GPSLatitude` …) өгдөг — хоёуланг уншина. Вэбд EXIF ирдэггүй тул
 * санал хоосон (хэрэглэгч гараар бөглөнө).
 */
export type Exif = Record<string, unknown> | null | undefined;

export interface ExifSuggestion {
  /** `YYYY-MM-DD` */
  occurredOn: string | null;
  location: { lat: number; lon: number } | null;
}

function field(exif: Record<string, unknown>, flat: string[], group: string, nested: string[]): unknown {
  for (const k of flat) if (exif[k] !== undefined && exif[k] !== null) return exif[k];
  const sub = exif[group];
  if (sub && typeof sub === 'object') {
    const g = sub as Record<string, unknown>;
    for (const k of nested) if (g[k] !== undefined && g[k] !== null) return g[k];
  }
  return undefined;
}

/** «2025:07:12 14:30:00» → «2025-07-12» (буруу бол `null`). */
export function exifDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const month = Number(mo);
  const day = Number(d);
  if (Number(y) < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${mo}-${d}`;
}

function rational(part: string): number {
  const [n, d] = part.split('/').map(Number);
  return d === undefined ? n : d === 0 ? NaN : n / d;
}

/** Тоо, «47.9», «47/1,55/1,1234/100», `[47, 55, 12.3]` → аравтын бутархай градус. */
export function exifCoordinate(value: unknown): number | null {
  let parts: number[];
  if (typeof value === 'number') parts = [value];
  else if (Array.isArray(value)) parts = value.map(Number);
  else if (typeof value === 'string') parts = value.split(/[,\s]+/).filter(Boolean).map(rational);
  else return null;
  if (parts.length === 0 || parts.some((p) => !Number.isFinite(p))) return null;
  const [deg, min = 0, sec = 0] = parts;
  return deg + min / 60 + sec / 3600;
}

function signed(value: number | null, ref: unknown, negative: string): number | null {
  if (value === null) return null;
  return typeof ref === 'string' && ref.trim().toUpperCase() === negative ? -Math.abs(value) : value;
}

export function readExif(exif: Exif): ExifSuggestion {
  if (!exif || typeof exif !== 'object') return { occurredOn: null, location: null };
  const date =
    exifDate(field(exif, ['DateTimeOriginal'], '{Exif}', ['DateTimeOriginal'])) ??
    exifDate(field(exif, ['DateTimeDigitized'], '{Exif}', ['DateTimeDigitized'])) ??
    exifDate(field(exif, ['DateTime'], '{TIFF}', ['DateTime']));
  const lat = signed(
    exifCoordinate(field(exif, ['GPSLatitude'], '{GPS}', ['Latitude'])),
    field(exif, ['GPSLatitudeRef'], '{GPS}', ['LatitudeRef']),
    'S',
  );
  const lon = signed(
    exifCoordinate(field(exif, ['GPSLongitude'], '{GPS}', ['Longitude'])),
    field(exif, ['GPSLongitudeRef'], '{GPS}', ['LongitudeRef']),
    'W',
  );
  const valid = lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
  return { occurredOn: date, location: valid ? { lat: round(lat), lon: round(lon) } : null };
}

/** Хэд хэдэн зургаас: огноо — эхний огноотойгоос, байршил — эхний байршилтайгаас. */
export function suggestFromAssets(assets: { exif?: Exif }[]): ExifSuggestion {
  let occurredOn: string | null = null;
  let location: ExifSuggestion['location'] = null;
  for (const a of assets) {
    const s = readExif(a.exif);
    occurredOn ??= s.occurredOn;
    location ??= s.location;
    if (occurredOn && location) break;
  }
  return { occurredOn, location };
}

function round(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
