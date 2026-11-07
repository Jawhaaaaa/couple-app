import { readExif } from '../exif';
import { parseJpegExif } from '../jpegExif';
import { assetExif } from '../pickMedia';

jest.mock('@/upload/uploadRuntime', () => ({ uploadQueue: {} }));

/** EXIF APP1 (TIFF, little/big endian): DateTimeOriginal + GPS — тестийн зураг. */
function exifJpeg({ date, lat, lon, little = true }: { date: string; lat: number; lon: number; little?: boolean }): ArrayBuffer {
  const tiff = new DataView(new ArrayBuffer(178));
  const u16 = (o: number, v: number) => tiff.setUint16(o, v, little);
  const u32 = (o: number, v: number) => tiff.setUint32(o, v, little);
  const ascii = (o: number, s: string) => [...s].forEach((c, i) => tiff.setUint8(o + i, c.charCodeAt(0)));
  const entry = (o: number, tag: number, type: number, count: number, value: number) => {
    u16(o, tag);
    u16(o + 2, type);
    u32(o + 4, count);
    u32(o + 8, value);
  };
  const dms = (o: number, v: number) => {
    const d = Math.floor(Math.abs(v));
    const m = Math.floor((Math.abs(v) - d) * 60);
    const s = Math.round(((Math.abs(v) - d) * 60 - m) * 60 * 100);
    [
      [d, 1],
      [m, 1],
      [s, 100],
    ].forEach(([n, den], i) => {
      u32(o + i * 8, n);
      u32(o + i * 8 + 4, den);
    });
  };
  ascii(0, little ? 'II' : 'MM');
  u16(2, 42);
  u32(4, 8);
  u16(8, 2);
  entry(10, 0x8769, 4, 1, 38);
  entry(22, 0x8825, 4, 1, 76);
  u32(34, 0);
  u16(38, 1);
  entry(40, 0x9003, 2, 20, 56);
  u32(52, 0);
  ascii(56, date);
  u16(76, 4);
  entry(78, 1, 2, 2, 0);
  ascii(86, lat < 0 ? 'S' : 'N');
  entry(90, 2, 5, 3, 130);
  entry(102, 3, 2, 2, 0);
  ascii(110, lon < 0 ? 'W' : 'E');
  entry(114, 4, 5, 3, 154);
  u32(126, 0);
  dms(130, lat);
  dms(154, lon);

  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const header = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
  const length = 2 + header.length + tiff.byteLength;
  const bytes = [0xff, 0xd8, ...app0, 0xff, 0xe1, length >> 8, length & 0xff, ...header, ...new Uint8Array(tiff.buffer), 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9];
  return new Uint8Array(bytes).buffer;
}

describe('AC-79 вэбийн JPEG EXIF', () => {
  it('little-endian: огноо ба GPS → «2025-07-12», 47.918 / 106.917', () => {
    const raw = parseJpegExif(exifJpeg({ date: '2025:07:12 14:30:00', lat: 47.918, lon: 106.917 }));
    expect(raw).toMatchObject({ DateTimeOriginal: '2025:07:12 14:30:00', GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' });
    const s = readExif(raw);
    expect(s.occurredOn).toBe('2025-07-12');
    expect(s.location?.lat).toBeCloseTo(47.918, 3);
    expect(s.location?.lon).toBeCloseTo(106.917, 3);
  });

  it('big-endian, өмнөд/баруун хагас бөмбөрцөг', () => {
    const s = readExif(parseJpegExif(exifJpeg({ date: '2024:02:29 08:00:00', lat: -33.9, lon: -18.4, little: false })));
    expect(s.occurredOn).toBe('2024-02-29');
    expect(s.location?.lat).toBeCloseTo(-33.9, 3);
    expect(s.location?.lon).toBeCloseTo(-18.4, 3);
  });

  it('JPEG биш эсвэл EXIF-гүй бол null', () => {
    expect(parseJpegExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeNull();
    expect(parseJpegExif(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]).buffer)).toBeNull();
  });

  it('assetExif: picker-ийн exif байвал түүнийг, үгүй бол File-аас (вэб)', async () => {
    expect(await assetExif({ exif: { DateTimeOriginal: 'x' } })).toEqual({ DateTimeOriginal: 'x' });
    const buffer = exifJpeg({ date: '2025:07:12 14:30:00', lat: 47.918, lon: 106.917 });
    const file = { type: 'image/jpeg', arrayBuffer: async () => buffer } as unknown as File;
    expect(await assetExif({ exif: null, file, mimeType: 'image/jpeg' })).toMatchObject({ DateTimeOriginal: '2025:07:12 14:30:00' });
    const broken = { type: 'image/jpeg', arrayBuffer: async () => Promise.reject(new Error('read')) } as unknown as File;
    expect(await assetExif({ exif: null, file: broken, mimeType: 'image/jpeg' })).toBeNull();
  });
});
