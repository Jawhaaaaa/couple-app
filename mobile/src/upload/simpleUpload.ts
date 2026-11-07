import { api as defaultApi, type ApiClient, unwrap } from '@/api/client';
import type { components } from '@/api/schema';

type S = components['schemas'];
export type UploadPurpose = S['UploadCreate']['purpose'];
export type MediaRef = S['MediaRef'];
export type UploadSession = S['UploadSession'];

export interface SimpleUploadInput {
  purpose: UploadPurpose;
  fileName: string;
  mime: string;
  data: Blob;
  /** Явц (0–1) — chunk бүрийн дараа. */
  onProgress?: (fraction: number) => void;
}

/**
 * Жижиг файлын (аватар г.м.) chunk upload — гэрээний протокол (DD-AURA-013):
 * `POST /uploads` → chunk бүрд `PUT /uploads/{id}/chunks/{index}` (octet-stream,
 * сүүлийнхээс бусад нь яг `chunkSize`) → `POST /uploads/{id}/complete` → `MediaRef`.
 * Тасарсан upload-ыг сэргээх, дараалал (`uploadQueue`) нь дурсамжийн нэгжид.
 */
export async function simpleUpload(
  { purpose, fileName, mime, data, onProgress }: SimpleUploadInput,
  client: ApiClient = defaultApi,
): Promise<MediaRef> {
  const totalBytes = data.size;
  if (totalBytes < 1) throw new Error('Хоосон файл');
  const session = await unwrap(client.POST('/uploads', { body: { purpose, fileName, mime, totalBytes } }));
  const chunkSize = session.chunkSize;
  if (!(chunkSize > 0)) throw new Error(`chunkSize буруу: ${chunkSize}`);
  const totalChunks = Math.ceil(totalBytes / chunkSize);
  const received = new Set(session.receivedChunks ?? []);

  for (let index = 0; index < totalChunks; index += 1) {
    if (!received.has(index)) {
      const chunk = data.slice(index * chunkSize, Math.min(totalBytes, (index + 1) * chunkSize));
      await unwrap(
        client.PUT('/uploads/{uploadId}/chunks/{index}', {
          params: { path: { uploadId: session.id, index } },
          // Байтыг JSON болгохгүй — шууд илгээнэ
          body: chunk as unknown as string,
          bodySerializer: (body: unknown) => body as BodyInit,
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
      );
    }
    onProgress?.((index + 1) / totalChunks);
  }
  return unwrap(client.POST('/uploads/{uploadId}/complete', { params: { path: { uploadId: session.id } } }));
}

/** Локал URI (`file://`, `blob:`, `data:`) → `Blob` (native ба вэбд `fetch` дэмжинэ). */
export async function blobFromUri(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  if (!res.ok && res.status !== 0) throw new Error(`Файл уншиж чадсангүй (${res.status})`);
  return res.blob();
}
