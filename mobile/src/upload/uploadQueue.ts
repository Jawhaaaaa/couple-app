import { v7 as uuidv7 } from 'uuid';

import { api as defaultApi, type ApiClient, type ApiError } from '@/api/client';
import type { KeyValueStore } from '@/offline/storage';

import type { BlobStore } from './blobStoreTypes';
import { blobFromUri, chunkOf, type MediaRef, putChunk, type UploadPurpose, type UploadSession } from './simpleUpload';

/**
 * Тасарсан upload-ыг үргэлжлүүлэх дараалал (DD-AURA-012, FR-5.6, AC-20). Дараалал нь
 * `KeyValueStore`-д (native — AsyncStorage, вэб — IndexedDB) хадгалагдана: апп хаагдаж
 * нээгдэх, сүлжээ сэргэх үед `resume()` нь серверээс `GET /uploads/{id}`-аар хүлээн
 * авсан chunk-ийг асууж, ДУТУУ chunk-ийг л илгээнэ — серверт байгаа байтыг дахин
 * илгээхгүй. 410 (24 цаг өнгөрсөн) бол шинэ session-оос эхэлнэ; 415 бол шалтгаантай
 * бүтэлгүйтнэ; 507 `STORAGE_QUOTA_EXCEEDED` бол S-98 руу (`onQuotaExceeded`).
 */

export type UploadStatus = 'pending' | 'uploading' | 'done' | 'failed';
export type UploadFailure =
  | 'STORAGE_QUOTA_EXCEEDED'
  | 'MEDIA_TYPE_FORBIDDEN'
  | 'MEDIA_TOO_LARGE'
  | 'VIDEO_TOO_LONG'
  | 'AUDIO_TOO_LONG'
  | 'CHUNK_SIZE_MISMATCH'
  | 'SPACE_READ_ONLY'
  | 'VALIDATION_FAILED'
  | 'SOURCE_MISSING'
  | 'UNKNOWN';

export interface UploadItem {
  localId: string;
  /** Native файлын URI (`file://`) — апп дахин нээгдэхэд эндээс уншина. */
  uri: string | null;
  /** `BlobStore`-ийн түлхүүр (вэб — IndexedDB). */
  blobKey: string | null;
  fileName: string;
  mime: string;
  totalBytes: number;
  purpose: UploadPurpose;
  durationMs?: number;
  uploadId: string | null;
  chunkSize: number | null;
  /** Серверт хүрсэн chunk-ийн индекс (серверийн `receivedChunks`-аар үнэн болгоно). */
  received: number[];
  status: UploadStatus;
  failure?: UploadFailure;
  media?: MediaRef;
  createdAt: string;
}

export interface UploadInput {
  purpose: UploadPurpose;
  fileName: string;
  mime: string;
  /** Native-д URI өгвөл хангалттай; вэбд `data` (IndexedDB-д хадгалагдана). */
  uri?: string;
  data?: Blob;
  totalBytes?: number;
  durationMs?: number;
}

export class UploadError extends Error {
  constructor(
    readonly reason: UploadFailure,
    readonly localId: string,
  ) {
    super(`upload ${localId}: ${reason}`);
  }
}

export type ProgressFn = (sentBytes: number, totalBytes: number) => void;

export interface UploadQueueDeps {
  store: KeyValueStore;
  blobs: BlobStore;
  client?: ApiClient;
  readUri?: (uri: string) => Promise<Blob>;
  onQuotaExceeded?: (item: UploadItem) => void;
}

const KEY = 'aura.uploads.v1';
/** 410/UPLOAD_INCOMPLETE-ийн дараа дахин эхлэх дээд тоо (мөнхийн давталтаас хамгаална). */
const MAX_RESTARTS = 3;

type Call<T> = { ok: true; data: T } | { ok: false; status: number; code: string | undefined };

/** Сүлжээний алдаа (fetch reject) нь энд барихгүй — дуудагч «offline» гэж үзнэ. */
async function call<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<Call<T>> {
  const { data, error, response } = await p;
  if (response.ok && error === undefined) return { ok: true, data: data as T };
  return { ok: false, status: response.status, code: (error as ApiError | undefined)?.code };
}

const FAILURE_CODES: readonly string[] = [
  'STORAGE_QUOTA_EXCEEDED',
  'MEDIA_TYPE_FORBIDDEN',
  'MEDIA_TOO_LARGE',
  'VIDEO_TOO_LONG',
  'AUDIO_TOO_LONG',
  'CHUNK_SIZE_MISMATCH',
  'SPACE_READ_ONLY',
  'VALIDATION_FAILED',
];

function failureOf(res: { status: number; code: string | undefined }): UploadFailure {
  if (res.code && FAILURE_CODES.includes(res.code)) return res.code as UploadFailure;
  if (res.status === 507) return 'STORAGE_QUOTA_EXCEEDED';
  if (res.status === 415) return 'MEDIA_TYPE_FORBIDDEN';
  if (res.status === 413) return 'MEDIA_TOO_LARGE';
  return 'UNKNOWN';
}

/** Түр зуурын (дараа дахин оролдох) хариу: 5xx, 401, 408, 429. */
function isTransient(status: number): boolean {
  return status >= 500 ? status !== 507 : status === 401 || status === 408 || status === 429;
}

class Transient extends Error {}
class Restart extends Error {}

/** Серверт хүрсэн байт — chunk бүрийн бодит хэмжээгээр (сүүлийнх нь богино). */
export function sentBytesOf(item: Pick<UploadItem, 'received' | 'chunkSize' | 'totalBytes'>): number {
  if (!item.chunkSize) return 0;
  const size = item.chunkSize;
  return item.received.reduce((sum, i) => sum + Math.max(0, Math.min(size, item.totalBytes - i * size)), 0);
}

export class UploadQueue {
  private running: Promise<void> | null = null;
  /** Гүйлт явж байхад ирсэн `resume()` — гүйлт дуусмагц дахин нэг удаа ажиллана. */
  private rerun = false;
  private writes: Promise<unknown> = Promise.resolve();
  private readonly memory = new Map<string, Blob>();
  private readonly listeners = new Set<(items: UploadItem[]) => void>();
  private readonly progress = new Map<string, Set<ProgressFn>>();
  private readonly waiters = new Map<string, { resolve: (m: MediaRef) => void; reject: (e: UploadError) => void }[]>();
  private readonly client: ApiClient;
  private readonly readUri: (uri: string) => Promise<Blob>;

  constructor(private readonly deps: UploadQueueDeps) {
    this.client = deps.client ?? defaultApi;
    this.readUri = deps.readUri ?? blobFromUri;
  }

  async items(): Promise<UploadItem[]> {
    const raw = await this.deps.store.get(KEY);
    return raw ? (JSON.parse(raw) as UploadItem[]) : [];
  }

  async item(localId: string): Promise<UploadItem | undefined> {
    return (await this.items()).find((i) => i.localId === localId);
  }

  subscribe(fn: (items: UploadItem[]) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Явц (илгээсэн байт / нийт) — chunk бүрийн дараа. */
  onProgress(localId: string, fn: ProgressFn): () => void {
    let set = this.progress.get(localId);
    if (!set) {
      set = new Set();
      this.progress.set(localId, set);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }

  /** Дараалалд нэмж (хадгална) ар талд илгээж эхэлнэ. */
  async add(input: UploadInput): Promise<UploadItem> {
    const localId = uuidv7();
    const totalBytes = input.totalBytes ?? input.data?.size ?? 0;
    if (!(totalBytes > 0)) throw new Error('Хоосон файл');
    let blobKey: string | null = null;
    if (input.data) {
      this.memory.set(localId, input.data);
      if (!input.uri) {
        await this.deps.blobs.put(localId, input.data);
        blobKey = localId;
      }
    }
    const item: UploadItem = {
      localId,
      uri: input.uri ?? null,
      blobKey,
      fileName: input.fileName,
      mime: input.mime,
      totalBytes,
      purpose: input.purpose,
      ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
      uploadId: null,
      chunkSize: null,
      received: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    await this.mutate((items) => [...items, item]);
    void this.resume();
    return item;
  }

  /** Дуусахыг хүлээнэ: `MediaRef` эсвэл `UploadError`. Апп дахин нээгдсэн ч ажиллана. */
  async wait(localId: string): Promise<MediaRef> {
    const item = await this.item(localId);
    if (!item) throw new UploadError('SOURCE_MISSING', localId);
    if (item.status === 'done' && item.media) return item.media;
    if (item.status === 'failed') throw new UploadError(item.failure ?? 'UNKNOWN', localId);
    return new Promise((resolve, reject) => {
      const list = this.waiters.get(localId) ?? [];
      list.push({ resolve, reject });
      this.waiters.set(localId, list);
    });
  }

  /** `add` + `wait`. */
  async upload(input: UploadInput): Promise<MediaRef> {
    const item = await this.add(input);
    return this.wait(item.localId);
  }

  /**
   * Дуусаагүй бүхнийг дарааллаар нь илгээнэ (нэг зэрэг нэг л гүйлт). Сүлжээ тасарвал
   * зогсож дараагийн `resume()`-ийг хүлээнэ — хадгалсан төлөв алдагдахгүй.
   * Гүйлт явж байхад дахин дуудвал (жишээ нь хуудас ачаалсны дараа токен ирэх, `online`) тэр
   * гүйлтэд нэгдээд орхихгүй — дуусмагц шинэ нөхцөлөөр дахин гүйнэ. Өмнө нь токенгүй эхний гүйлт
   * унахад токен ирсний дараах дуудлага түүнтэй хамт алга болж upload «Илгээхээр хүлээж байна»
   * дээр үлддэг байв (AC-20, CI run 43790105841).
   */
  resume(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.rerun = false;
        await this.run();
      } while (this.rerun);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Цуцлах/арилгах: дуусаагүй бол серверийн session-ийг ч цуцална. */
  async remove(localId: string): Promise<void> {
    const item = await this.item(localId);
    if (!item) return;
    if (item.uploadId && item.status !== 'done') {
      await this.client
        .DELETE('/uploads/{uploadId}', { params: { path: { uploadId: item.uploadId } } })
        // Сервер 24 цагийн дараа өөрөө цэвэрлэнэ — сүлжээгүй үед ч локал арилгалт үргэлжилнэ
        .catch(() => undefined);
    }
    await this.dropSource(item);
    await this.mutate((items) => items.filter((i) => i.localId !== localId));
  }

  private async run(): Promise<void> {
    for (;;) {
      const next = (await this.items()).find((i) => i.status === 'pending' || i.status === 'uploading');
      if (!next) return;
      try {
        await this.process(next);
      } catch {
        // Сүлжээ тасарсан эсвэл сервер түр алдаатай — төлөв хадгалагдсан, дараагийн resume үргэлжлүүлнэ
        await this.update(next.localId, { status: 'pending' });
        return;
      }
    }
  }

  private async source(item: UploadItem): Promise<Blob | null> {
    const cached = this.memory.get(item.localId);
    if (cached) return cached;
    let blob: Blob | null = null;
    if (item.blobKey) blob = await this.deps.blobs.get(item.blobKey);
    else if (item.uri) blob = await this.readUri(item.uri);
    if (blob) this.memory.set(item.localId, blob);
    return blob;
  }

  private async dropSource(item: UploadItem) {
    this.memory.delete(item.localId);
    if (item.blobKey) await this.deps.blobs.remove(item.blobKey);
  }

  private async process(start: UploadItem): Promise<void> {
    let item = start;
    let data: Blob | null;
    try {
      data = await this.source(item);
    } catch {
      data = null;
    }
    if (!data) return this.fail(item, 'SOURCE_MISSING');

    for (let attempt = 0; attempt <= MAX_RESTARTS; attempt += 1) {
      try {
        item = await this.sync(item);
        const chunkSize = item.chunkSize as number;
        const uploadId = item.uploadId as string;
        const totalChunks = Math.ceil(item.totalBytes / chunkSize);
        this.emitProgress(item);
        for (let index = 0; index < totalChunks; index += 1) {
          if (item.received.includes(index)) continue;
          const res = await call(putChunk(this.client, uploadId, index, chunkOf(data, index, chunkSize)));
          if (!res.ok) this.raise(res);
          item = await this.update(item.localId, { received: [...item.received, index] });
          this.emitProgress(item);
        }
        const done = await call(this.client.POST('/uploads/{uploadId}/complete', { params: { path: { uploadId } } }));
        if (!done.ok) {
          // UPLOAD_INCOMPLETE — серверийн жагсаалтаар дахин тулгана
          if (done.status === 409 && done.code === 'UPLOAD_INCOMPLETE') throw new Restart('incomplete');
          this.raise(done);
        }
        if (done.ok) return this.finish(item, done.data);
      } catch (e) {
        if (e instanceof Restart) continue;
        if (e instanceof UploadError) return this.fail(item, e.reason);
        throw e;
      }
    }
    return this.fail(item, 'UNKNOWN');
  }

  /** Session нээх эсвэл серверээс хүлээн авсан chunk-ийг асуух (AC-20). */
  private async sync(item: UploadItem): Promise<UploadItem> {
    if (item.uploadId) {
      const res = await call<UploadSession>(this.client.GET('/uploads/{uploadId}', { params: { path: { uploadId: item.uploadId } } }));
      if (res.ok) {
        return this.update(item.localId, {
          status: 'uploading',
          chunkSize: res.data.chunkSize,
          received: [...new Set(res.data.receivedChunks)].sort((a, b) => a - b),
        });
      }
      if (res.status !== 410 && res.status !== 404) this.raise(res);
      // Хугацаа дууссан (24 цаг) эсвэл алга — шинэ session-оос
      item = await this.update(item.localId, { uploadId: null, chunkSize: null, received: [] });
    }
    const created = await call<UploadSession>(
      this.client.POST('/uploads', {
        body: {
          purpose: item.purpose,
          fileName: item.fileName,
          mime: item.mime,
          totalBytes: item.totalBytes,
          ...(item.durationMs !== undefined ? { durationMs: item.durationMs } : {}),
        },
      }),
    );
    if (!created.ok) this.raise(created);
    const session = (created as { ok: true; data: UploadSession }).data;
    if (!(session.chunkSize > 0)) throw new UploadError('UNKNOWN', item.localId);
    return this.update(item.localId, {
      status: 'uploading',
      uploadId: session.id,
      chunkSize: session.chunkSize,
      received: [...(session.receivedChunks ?? [])],
    });
  }

  /** Алдааны хариуг ангилна: 410 → дахин эхлэх, түр зуурын → дараа, бусад → бүтэлгүйтэл. */
  private raise(res: { status: number; code: string | undefined }): never {
    if (res.status === 410) throw new Restart('gone');
    if (isTransient(res.status)) throw new Transient(`HTTP ${res.status}`);
    throw new UploadError(failureOf(res), '');
  }

  private emitProgress(item: UploadItem) {
    const sent = sentBytesOf(item);
    this.progress.get(item.localId)?.forEach((fn) => fn(sent, item.totalBytes));
  }

  private async finish(item: UploadItem, media: MediaRef) {
    const done = await this.update(item.localId, { status: 'done', media, received: item.received });
    await this.dropSource(done);
    this.progress.get(item.localId)?.forEach((fn) => fn(item.totalBytes, item.totalBytes));
    this.waiters.get(item.localId)?.forEach((w) => w.resolve(media));
    this.waiters.delete(item.localId);
  }

  private async fail(item: UploadItem, reason: UploadFailure) {
    const failed = await this.update(item.localId, { status: 'failed', failure: reason });
    if (reason === 'STORAGE_QUOTA_EXCEEDED') this.deps.onQuotaExceeded?.(failed);
    const error = new UploadError(reason, item.localId);
    this.waiters.get(item.localId)?.forEach((w) => w.reject(error));
    this.waiters.delete(item.localId);
  }

  private async update(localId: string, patch: Partial<UploadItem>): Promise<UploadItem> {
    let updated: UploadItem | undefined;
    await this.mutate((items) =>
      items.map((i) => {
        if (i.localId !== localId) return i;
        updated = { ...i, ...patch };
        return updated;
      }),
    );
    if (!updated) throw new UploadError('SOURCE_MISSING', localId);
    return updated;
  }

  /** Хадгалалтыг цувруулна — `add` ба гүйлт зэрэг бичихэд мөр алдагдахгүй. */
  private mutate(fn: (items: UploadItem[]) => UploadItem[]): Promise<UploadItem[]> {
    const next = this.writes.then(async () => {
      const items = fn(await this.items());
      await this.deps.store.set(KEY, JSON.stringify(items));
      this.listeners.forEach((l) => l(items));
      return items;
    });
    this.writes = next.catch(() => undefined);
    return next;
  }
}
