import { randomUUID } from 'node:crypto';

import { expect, type Page } from '@playwright/test';

import { API_BASE } from './env';
import { apiAs, apiJson, type TestUser } from './users';

/**
 * Дурсамжийн E2E бэлтгэл (T-38…T-42): тестийн JPEG (хөтчийн canvas-аар, сонголтоор EXIF/GPS-тэй),
 * гэрээний chunk upload (`POST /uploads` → `PUT …/chunks/{i}` → `complete`), `POST /memories`.
 */
export interface MediaRef {
  id: string;
  status: string;
  width?: number | null;
  height?: number | null;
}

export interface MemorySummary {
  id: string;
  title: string;
  occurredOn: string;
  status: 'UPLOADING' | 'READY';
  favorite: boolean;
  commentCount: number;
}

export interface Memory extends MemorySummary {
  version: number;
  media: { media: MediaRef; altText?: string | null }[];
  perspectives: { author: { id: string; displayName: string }; text: string }[];
  comments: { id: string; author: { id: string }; text: string }[];
  reactions: { emoji: string; count: number; mine: boolean }[];
}

/** Хөтчийн canvas-аар JPEG (өнгөт дэвсгэр) үүсгэнэ — сервер жинхэнэ зураг шиг decode хийнэ. */
export async function makeJpeg(page: Page, width = 640, height = 480, hue = 12): Promise<Buffer> {
  const bytes = await page.evaluate(
    async ({ w, h, hue: hh }) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas 2d');
      ctx.fillStyle = `hsl(${hh}, 70%, 60%)`;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = `hsl(${(hh + 180) % 360}, 70%, 40%)`;
      ctx.fillRect(w / 4, h / 4, w / 2, h / 2);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('toBlob');
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    },
    { w: width, h: height, hue },
  );
  return Buffer.from(bytes);
}

/** EXIF APP1 (DateTimeOriginal + GPS) — SOI-ийн дараа оруулна (AC-79, AC-21). */
export function withExif(jpeg: Buffer, exif: { date: string; lat: number; lon: number }): Buffer {
  const tiff = Buffer.alloc(178);
  const entry = (o: number, tag: number, type: number, count: number, value: number) => {
    tiff.writeUInt16LE(tag, o);
    tiff.writeUInt16LE(type, o + 2);
    tiff.writeUInt32LE(count, o + 4);
    tiff.writeUInt32LE(value, o + 8);
  };
  const dms = (o: number, v: number) => {
    const a = Math.abs(v);
    const d = Math.floor(a);
    const m = Math.floor((a - d) * 60);
    const s = Math.round(((a - d) * 60 - m) * 6000);
    [d, 1, m, 1, s, 100].forEach((n, i) => tiff.writeUInt32LE(n, o + i * 4));
  };
  tiff.write('II', 0, 'ascii');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(2, 8);
  entry(10, 0x8769, 4, 1, 38);
  entry(22, 0x8825, 4, 1, 76);
  tiff.writeUInt16LE(1, 38);
  entry(40, 0x9003, 2, 20, 56);
  tiff.write(exif.date, 56, 'ascii');
  tiff.writeUInt16LE(4, 76);
  entry(78, 1, 2, 2, 0);
  tiff.write(exif.lat < 0 ? 'S' : 'N', 86, 'ascii');
  entry(90, 2, 5, 3, 130);
  entry(102, 3, 2, 2, 0);
  tiff.write(exif.lon < 0 ? 'W' : 'E', 110, 'ascii');
  entry(114, 4, 5, 3, 154);
  dms(130, exif.lat);
  dms(154, exif.lon);
  const header = Buffer.from('Exif\0\0', 'binary');
  const length = 2 + header.length + tiff.length;
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, length >> 8, length & 0xff]), header, tiff]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

/** Гэрээний chunk upload (`purpose: MEMORY`) → `MediaRef`. */
export async function uploadMedia(user: TestUser, data: Buffer, fileName = 'photo.jpg', mime = 'image/jpeg'): Promise<MediaRef> {
  const session = await apiJson<{ id: string; chunkSize: number }>(user, 'POST', '/uploads', {
    purpose: 'MEMORY',
    fileName,
    mime,
    totalBytes: data.length,
  });
  for (let index = 0; index * session.chunkSize < data.length; index += 1) {
    const chunk = data.subarray(index * session.chunkSize, Math.min(data.length, (index + 1) * session.chunkSize));
    const res = await fetch(`${API_BASE}/uploads/${session.id}/chunks/${index}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${user.accessToken}`, 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(chunk),
    });
    if (!res.ok) throw new Error(`PUT chunk ${index} → ${res.status}: ${await res.text()}`);
  }
  return apiJson<MediaRef>(user, 'POST', `/uploads/${session.id}/complete`);
}

export interface NewMemory {
  title: string;
  occurredOn: string;
  tags?: string[];
  groupIds?: string[];
  description?: string;
  location?: { name: string; lat: number; lon: number };
}

/** API-аар дурсамж (UI-гүй бэлтгэл): нэг зурагтай. */
export async function createMemoryApi(user: TestUser, image: Buffer, input: NewMemory): Promise<Memory> {
  const media = await uploadMedia(user, image);
  return apiJson<Memory>(user, 'POST', '/memories', {
    clientId: randomUUID(),
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    occurredOn: input.occurredOn,
    dateSource: 'MANUAL',
    ...(input.location ? { location: input.location } : {}),
    locationSource: input.location ? 'MANUAL' : 'NONE',
    tags: input.tags ?? [],
    groupIds: input.groupIds ?? [],
    media: [{ mediaId: media.id, altText: input.title }],
  });
}

export async function getMemory(user: TestUser, id: string): Promise<Memory> {
  return apiJson<Memory>(user, 'GET', `/memories/${id}`);
}

export async function listMemories(user: TestUser, query: Record<string, string>): Promise<MemorySummary[]> {
  const qs = new URLSearchParams({ limit: '100', ...query }).toString();
  return (await apiJson<{ items: MemorySummary[] }>(user, 'GET', `/memories?${qs}`)).items;
}

export async function commentApi(user: TestUser, memoryId: string, text: string) {
  return apiJson(user, 'POST', `/memories/${memoryId}/comments`, { text, clientId: randomUUID() });
}

/** Медиа боловсруулагдаж дурсамж READY болтол хүлээнэ (UPLOADING → READY). */
export async function waitReady(user: TestUser, id: string) {
  await expect.poll(async () => (await getMemory(user, id)).status, { timeout: 30_000 }).toBe('READY');
}

/** `expo-image-picker` вэбд нуугдмал `<input type=file multiple>` нээнэ — файлуудыг тэнд өгнө. */
export async function pickFiles(page: Page, testId: string, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId(testId).click();
  await (await chooser).setFiles(files);
}

export { apiAs };
