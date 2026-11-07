/**
 * Вэбийн JPEG EXIF уншигч (FR-5.2, AC-79): `expo-image-picker` вэбд `exif` буцаадаггүй тул
 * сонгосон `File`-ийн APP1 сегментээс огноо (DateTimeOriginal …) ба GPS-ийг өөрсдөө уншина.
 * Гаралт нь Android-ийн хавтгай хэлбэртэй (`readExif`-д шууд өгнө). Зөвхөн уншина — илгээх
 * файл нь `stripGps`-ээр дахин encode хийгдэж EXIF-гүй болно.
 */
const TAG = {
  DateTime: 0x0132,
  ExifIFD: 0x8769,
  GPSIFD: 0x8825,
  DateTimeOriginal: 0x9003,
  DateTimeDigitized: 0x9004,
  GPSLatitudeRef: 1,
  GPSLatitude: 2,
  GPSLongitudeRef: 3,
  GPSLongitude: 4,
} as const;

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

type Value = string | number | number[];

function readIfd(view: DataView, tiff: number, offset: number, little: boolean): Map<number, Value> {
  const out = new Map<number, Value>();
  if (tiff + offset + 2 > view.byteLength) return out;
  const count = view.getUint16(tiff + offset, little);
  for (let i = 0; i < count; i += 1) {
    const entry = tiff + offset + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;
    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const n = view.getUint32(entry + 4, little);
    const size = (TYPE_SIZE[type] ?? 0) * n;
    if (size === 0) continue;
    const at = size <= 4 ? entry + 8 : tiff + view.getUint32(entry + 8, little);
    if (at + size > view.byteLength) continue;
    if (type === 2) {
      let s = '';
      for (let k = 0; k < n; k += 1) {
        const c = view.getUint8(at + k);
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      out.set(tag, s);
    } else if (type === 5 || type === 10) {
      const values: number[] = [];
      for (let k = 0; k < n; k += 1) {
        const num = type === 5 ? view.getUint32(at + k * 8, little) : view.getInt32(at + k * 8, little);
        const den = type === 5 ? view.getUint32(at + k * 8 + 4, little) : view.getInt32(at + k * 8 + 4, little);
        values.push(den === 0 ? NaN : num / den);
      }
      out.set(tag, values.length === 1 ? values[0] : values);
    } else if (type === 3) {
      out.set(tag, view.getUint16(at, little));
    } else if (type === 4) {
      out.set(tag, view.getUint32(at, little));
    }
  }
  return out;
}

/** JPEG байтаас EXIF-ийн огноо, GPS. JPEG биш эсвэл EXIF-гүй бол `null`. */
export function parseJpegExif(buffer: ArrayBuffer): Record<string, unknown> | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let pos = 2;
  while (pos + 4 <= view.byteLength) {
    if (view.getUint8(pos) !== 0xff) return null;
    const marker = view.getUint8(pos + 1);
    // SOS — зургийн өгөгдөл эхэллээ, цаашид metadata байхгүй
    if (marker === 0xda) return null;
    const length = view.getUint16(pos + 2);
    if (marker === 0xe1 && pos + 10 <= view.byteLength && view.getUint32(pos + 4) === 0x45786966 && view.getUint16(pos + 8) === 0) {
      const tiff = pos + 10;
      const order = view.getUint16(tiff);
      if (order !== 0x4949 && order !== 0x4d4d) return null;
      const little = order === 0x4949;
      const ifd0 = readIfd(view, tiff, view.getUint32(tiff + 4, little), little);
      const exifPtr = ifd0.get(TAG.ExifIFD);
      const gpsPtr = ifd0.get(TAG.GPSIFD);
      const exif = typeof exifPtr === 'number' ? readIfd(view, tiff, exifPtr, little) : new Map<number, Value>();
      const gps = typeof gpsPtr === 'number' ? readIfd(view, tiff, gpsPtr, little) : new Map<number, Value>();
      const out: Record<string, unknown> = {};
      const put = (key: string, value: Value | undefined) => {
        if (value !== undefined) out[key] = value;
      };
      put('DateTime', ifd0.get(TAG.DateTime));
      put('DateTimeOriginal', exif.get(TAG.DateTimeOriginal));
      put('DateTimeDigitized', exif.get(TAG.DateTimeDigitized));
      put('GPSLatitudeRef', gps.get(TAG.GPSLatitudeRef));
      put('GPSLatitude', gps.get(TAG.GPSLatitude));
      put('GPSLongitudeRef', gps.get(TAG.GPSLongitudeRef));
      put('GPSLongitude', gps.get(TAG.GPSLongitude));
      return Object.keys(out).length > 0 ? out : null;
    }
    pos += 2 + length;
  }
  return null;
}
