import { downloadBlob, downloadHref, fetchBlob } from '@/pwa/webFallbacks';

import type { SaveFileInput, SaveOutcome } from './saveFileTypes';

export { safeFileName } from './saveFileTypes';
export type { SaveFileInput, SaveOutcome } from './saveFileTypes';

/**
 * Вэб (FR-19.8, AC-158): нэвтрэлтгүй (presigned) URL бол татах холбоосоор шууд нээнэ; нэвтрэлттэй бол
 * `fetch`-ээр (302-ыг дагаж) Blob болгоод татна. Хэрэглэгчийн зорилго «Хадгалах/Татах» тул хуваалцах
 * цонх биш шууд татна (`pwa/webFallbacks`).
 */
export async function saveFile({ url, fileName, headers }: SaveFileInput): Promise<SaveOutcome> {
  if (!headers) {
    downloadHref(url, fileName);
    return 'downloaded';
  }
  downloadBlob(await fetchBlob(url, headers), fileName);
  return 'downloaded';
}
