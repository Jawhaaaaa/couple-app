import { type SaveFileInput, type SaveOutcome, safeFileName } from './saveFileTypes';

export { safeFileName } from './saveFileTypes';
export type { SaveFileInput, SaveOutcome } from './saveFileTypes';

function clickDownload(href: string, fileName: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = safeFileName(fileName);
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Вэб: нэвтрэлтгүй (presigned) URL бол татах холбоосоор шууд нээнэ; нэвтрэлттэй бол
 * `fetch`-ээр (302-ыг дагаж) Blob болгоод татна.
 */
export async function saveFile({ url, fileName, headers }: SaveFileInput): Promise<SaveOutcome> {
  if (!headers) {
    clickDownload(url, fileName);
    return 'downloaded';
  }
  const res = await fetch(url, { headers, credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const objectUrl = URL.createObjectURL(await res.blob());
  clickDownload(objectUrl, fileName);
  // Хөтөч татаж эхлэх хүртэл URL амьд байх ёстой
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  return 'downloaded';
}
