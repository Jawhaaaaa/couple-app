import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { resizeTarget } from '@/memories/limits';

export interface ImageSource {
  uri: string;
  width: number;
  height: number;
}

export interface PreparedImage {
  uri: string;
  width: number;
  height: number;
  mime: 'image/jpeg';
}

/**
 * Зургийг илгээхийн өмнө GPS-ийг арилгана (FR-5.2, AC-21): `expo-image-manipulator`-оор
 * дахин JPEG болгож encode хийхэд EXIF (GPS-тэй нь) хуулагдахгүй — native ба вэбийн аль
 * алинд. Хэмжээ нь багтаж байсан ч заавал дахин encode хийнэ; урт тал > 2560 px бол
 * багасгана (AC-172). Сервер ч мөн metadata-г хасдаг (хоёр давхар хамгаалалт).
 * Видеог энд хөрвүүлэхгүй — серверийн хөрвүүлэлт metadata-гүй гаргана (T-34).
 */
export async function stripGps(source: ImageSource, quality = 0.88): Promise<PreparedImage> {
  const context = ImageManipulator.manipulate(source.uri);
  const target = resizeTarget(source.width, source.height);
  if (target) context.resize(target);
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: quality });
  return { uri: saved.uri, width: saved.width, height: saved.height, mime: 'image/jpeg' };
}

/** Файлын нэрийг `.jpg` болгоно (дахин encode хийсэн тул). */
export function jpegName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '') || 'photo';
  return `${base}.jpg`;
}
