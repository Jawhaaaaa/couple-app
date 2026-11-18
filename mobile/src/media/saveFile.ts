import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { type SaveFileInput, type SaveOutcome, safeFileName } from './saveFileTypes';

export { safeFileName } from './saveFileTypes';
export type { SaveFileInput, SaveOutcome } from './saveFileTypes';

/**
 * Native (S-33 «Хадгалах», S-39 «Татах»): файлыг кэш рүү татаж (302-ыг дагана) системийн
 * хуваалцах цонхоор нээнэ — «Зураг хадгалах», «Files-д хадгалах» зэргийг хэрэглэгч тэндээс
 * сонгоно. `expo-media-library` (зургийн санд шууд бичих зөвшөөрөл) шаардлагагүй.
 */
export async function saveFile({ url, fileName, headers, mime }: SaveFileInput): Promise<SaveOutcome> {
  const target = new File(Paths.cache, safeFileName(fileName));
  const file = await File.downloadFileAsync(url, target, { headers, idempotent: true });
  if (!(await Sharing.isAvailableAsync())) return 'downloaded';
  await Sharing.shareAsync(file.uri, mime ? { mimeType: mime } : undefined);
  return 'shared';
}
