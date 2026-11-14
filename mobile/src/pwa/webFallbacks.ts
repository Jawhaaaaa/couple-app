/**
 * Вэбийн орлуулга (FR-19.8, AC-158) — native API-гүй хөтчид ижил үр дүн өгөх нийтлэг util:
 * - `shareOrDownload` — Web Share (файл/текст) байвал хуваалцах цонх, үгүй бол татах (файл)
 *   эсвэл санах ойд хуулах (текст)
 * - `downloadIcs` — календарийн `.ics` файлыг татна (iOS Safari шууд «Календарьт нэмэх» санал болгоно)
 * - `getPosition` — `navigator.geolocation`-аар нэг удаагийн байршил
 *
 * `<input type="file" accept capture>` нь `expo-image-picker`-ийн вэб хэрэгжүүлэлтэд байгаа тул энд
 * давтахгүй (`memories/pickMedia.ts`, арын камер — `capture="environment"`).
 *
 * DOM, `navigator`-ыг шууд биш `WebEnv`-ээр авна — UT-д хуурамч орчин дамжуулна.
 */

type ShareNavigator = {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  geolocation?: Geolocation;
};

export interface WebEnv {
  navigator?: ShareNavigator;
  document?: Document;
  URL?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
  fetch?: typeof fetch;
}

function env(override?: WebEnv): Required<Pick<WebEnv, 'navigator'>> & WebEnv {
  return {
    navigator: override?.navigator ?? (typeof navigator !== 'undefined' ? (navigator as ShareNavigator) : {}),
    document: override?.document ?? (typeof document !== 'undefined' ? document : undefined),
    URL: override?.URL ?? (typeof URL !== 'undefined' ? URL : undefined),
    fetch: override?.fetch ?? (typeof fetch !== 'undefined' ? fetch : undefined),
  };
}

/** Татах нэрийн аюултай тэмдэгтийг солино (`saveFileTypes.safeFileName`-тэй ижил дүрэм). */
export function downloadName(name: string): string {
  return name.replace(/[\/:*?"<>|\s]+/g, '_').slice(0, 120) || 'aura-file';
}

/** `<a download>`-оор татна. Өөр origin-ы URL-д хөтөч нэрийг үл тоож шинэ таб нээж болно. */
export function downloadHref(href: string, fileName: string, override?: WebEnv): void {
  const doc = env(override).document;
  if (!doc) throw new Error('NO_DOCUMENT');
  const a = doc.createElement('a');
  a.href = href;
  a.download = downloadName(fileName);
  a.rel = 'noopener';
  doc.body.appendChild(a);
  a.click();
  a.remove();
}

/** Blob-ыг түр URL болгож татна; хөтөч татаж эхлэх хүртэл URL-ыг амьд үлдээнэ. */
export function downloadBlob(blob: Blob, fileName: string, override?: WebEnv): void {
  const e = env(override);
  if (!e.URL) throw new Error('NO_URL');
  const objectUrl = e.URL.createObjectURL(blob);
  downloadHref(objectUrl, fileName, e);
  setTimeout(() => e.URL?.revokeObjectURL(objectUrl), 60_000);
}

/** Нэвтрэлттэй URL-ыг (302-ыг дагаж) Blob болгоно. */
export async function fetchBlob(url: string, headers: Record<string, string> | undefined, override?: WebEnv): Promise<Blob> {
  const doFetch = env(override).fetch;
  if (!doFetch) throw new Error('NO_FETCH');
  const res = await doFetch(url, { headers, credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

export type ShareOrDownloadOutcome = 'shared' | 'dismissed' | 'downloaded' | 'copied';

export interface ShareOrDownloadInput {
  title?: string;
  text?: string;
  url?: string;
  /** Файл хуваалцах/татах; байхгүй бол текст/холбоос хуваалцана. */
  file?: { blob: Blob; fileName: string; mime?: string };
  /** Текстийн нөөц — Web Share-гүй үед (desktop хөтөч) санах ойд хуулах. */
  copy?: (text: string) => Promise<void>;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function toFile(file: NonNullable<ShareOrDownloadInput['file']>): File | null {
  if (typeof File === 'undefined') return null;
  return new File([file.blob], downloadName(file.fileName), { type: file.mime ?? file.blob.type });
}

/**
 * Хуваалцах бүх газрын нэг зам (S-08 урилга, S-72 жилийн зураг г.м.):
 * 1. Web Share байвал (утасны хөтөч, iOS PWA) системийн хуваалцах цонх — файлыг `canShare`-ээр шалгана.
 * 2. Хэрэглэгч хаавал (`AbortError`) — `dismissed`, нөөц рүү орохгүй.
 * 3. Бусад алдаа эсвэл Web Share-гүй — файлыг татна, текстийг санах ойд хуулна.
 */
export async function shareOrDownload(input: ShareOrDownloadInput, override?: WebEnv): Promise<ShareOrDownloadOutcome> {
  const e = env(override);
  const nav = e.navigator;
  if (input.file) {
    const file = toFile(input.file);
    const data: ShareData = { files: file ? [file] : [], ...(input.title ? { title: input.title } : {}), ...(input.text ? { text: input.text } : {}) };
    if (file && typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
      try {
        await nav.share(data);
        return 'shared';
      } catch (error) {
        if (isAbort(error)) return 'dismissed';
        // NotAllowedError (идэвхжүүлэлт хугацаа дууссан), дэмжигдээгүй төрөл — татах нөөц рүү
      }
    }
    downloadBlob(input.file.blob, input.file.fileName, e);
    return 'downloaded';
  }
  const text = [input.text, input.url].filter(Boolean).join('\n');
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ ...(input.title ? { title: input.title } : {}), ...(input.text ? { text: input.text } : {}), ...(input.url ? { url: input.url } : {}) });
      return 'shared';
    } catch (error) {
      if (isAbort(error)) return 'dismissed';
    }
  }
  if (!input.copy) throw new Error('NO_SHARE_FALLBACK');
  await input.copy(text);
  return 'copied';
}

export interface DownloadIcsInput {
  url: string;
  fileName: string;
  headers?: Record<string, string>;
}

/** `GET /plans/{id}/ics` (AC-101, AC-158): календарийн API-гүй вэбэд `.ics` файл татна. */
export async function downloadIcs({ url, fileName, headers }: DownloadIcsInput, override?: WebEnv): Promise<'downloaded'> {
  const raw = await fetchBlob(url, headers, override);
  const blob = raw.type === 'text/calendar' ? raw : new Blob([raw], { type: 'text/calendar' });
  downloadBlob(blob, fileName.endsWith('.ics') ? fileName : `${fileName}.ics`, override);
  return 'downloaded';
}

export type PositionOutcome =
  | { status: 'ok'; lat: number; lon: number; accuracy: number | null }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'failed' };

/** Координатыг 5 орон (~1 м) хүртэл бөөрөнхийлнө — илүү нарийвчлал хадгалахгүй. */
export function roundCoord(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

/**
 * `navigator.geolocation.getCurrentPosition` (AC-158): нэг зөвшөөрлийн цонх, 15 с хүлээнэ,
 * 1 минутаас хуучин кэш авахгүй. Татгалзвал `denied` (дуудагч гараар бичих талбар руу).
 */
export function getPosition(override?: WebEnv): Promise<PositionOutcome> {
  const geo = env(override).navigator.geolocation;
  if (!geo) return Promise.resolve({ status: 'unavailable' });
  return new Promise((resolve) => {
    geo.getCurrentPosition(
      (pos) => resolve({ status: 'ok', lat: roundCoord(pos.coords.latitude), lon: roundCoord(pos.coords.longitude), accuracy: pos.coords.accuracy ?? null }),
      (err) => resolve({ status: err.code === 1 ? 'denied' : 'failed' }),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}
