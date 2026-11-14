import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import type { DraftMedia } from '@/stores/draftStore';
import { blobFromUri } from '@/upload/simpleUpload';
import { jpegName, stripGps } from '@/upload/stripGps';
import { uploadQueue } from '@/upload/uploadRuntime';

import type { Exif } from './exif';
import { parseJpegExif } from './jpegExif';
import { type MediaKind, MEDIA_MAX, type PickCandidate, VIDEO_MAX_MS } from './limits';

export type PickSource = 'library' | 'camera';
export type PickResult =
  | { status: 'picked'; assets: ImagePicker.ImagePickerAsset[] }
  | { status: 'cancelled' }
  | { status: 'denied'; canAskAgain: boolean };

/**
 * S-32 медиа сонголт (FR-5.1): зургийн сангаас олныг (≤ 20 − байгаа) эсвэл камераар нэг
 * зураг. `exif: true` — огноо, GPS-ийн санал (AC-79). Вэбд image-picker нь
 * `<input type=file accept capture>`-аар ажиллана (зөвшөөрөл асуухгүй).
 */
export async function pickMedia(source: PickSource, existing: number): Promise<PickResult> {
  if (Platform.OS !== 'web') {
    const permission =
      source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status === ImagePicker.PermissionStatus.DENIED) return { status: 'denied', canAskAgain: permission.canAskAgain };
  }
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], exif: true, quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          allowsMultipleSelection: true,
          selectionLimit: Math.max(1, MEDIA_MAX - existing),
          videoMaxDuration: VIDEO_MAX_MS / 1000,
          exif: true,
          quality: 1,
        });
  if (result.canceled || result.assets.length === 0) return { status: 'cancelled' };
  return { status: 'picked', assets: result.assets };
}

export function assetKind(asset: Pick<ImagePicker.ImagePickerAsset, 'type' | 'mimeType'>): MediaKind | null {
  if (asset.type === 'video' || asset.mimeType?.startsWith('video/')) return 'video';
  if (asset.type === 'image' || asset.type === 'livePhoto' || asset.mimeType?.startsWith('image/')) return 'image';
  return null;
}

/**
 * Зургийн EXIF: native-д picker-ээс (`exif: true`), вэбд `File`-ийн JPEG APP1-ээс өөрсдөө
 * (image-picker вэбд EXIF өгдөггүй). Уншиж чадаагүй бол `null` — санал л алга болно.
 */
export async function assetExif(asset: Pick<ImagePicker.ImagePickerAsset, 'exif' | 'file' | 'mimeType'>): Promise<Exif> {
  if (asset.exif) return asset.exif;
  if (!asset.file || !/jpe?g/i.test(asset.mimeType ?? asset.file.type)) return null;
  try {
    return parseJpegExif(await asset.file.arrayBuffer());
  } catch {
    // Эвдэрсэн/уншигдахгүй файл — EXIF-ийн санал алгасна, хэрэглэгч гараар бөглөнө
    return null;
  }
}

export function assetName(asset: ImagePicker.ImagePickerAsset, index: number): string {
  return asset.fileName || asset.file?.name || `${assetKind(asset) === 'video' ? 'video' : 'photo'}-${index + 1}`;
}

/** Хязгаарын шалгалтад (`admitPicks`) өгөх хэлбэр. */
export function toCandidate(asset: ImagePicker.ImagePickerAsset, index: number): PickCandidate & { asset: ImagePicker.ImagePickerAsset } {
  return {
    asset,
    name: assetName(asset, index),
    kind: assetKind(asset),
    durationMs: asset.duration ?? null,
    sizeBytes: asset.fileSize ?? asset.file?.size ?? null,
  };
}

/**
 * Нэг файлыг бэлтгэж upload дараалалд (`purpose`, анхдагч MEMORY; чат — CHAT/FILE) оруулна: зургийг GPS-гүй, ≤ 2560 px
 * JPEG болгоно (AC-21, AC-172); видео нь хэвээр (сервер хөрвүүлнэ). Native-д файлын URI,
 * вэбд Blob (IndexedDB-д хадгалагдаж хуудас дахин ачаалсан ч үргэлжилнэ, AC-20).
 */
export async function queueAsset(
  asset: ImagePicker.ImagePickerAsset,
  index: number,
  purpose: 'MEMORY' | 'CHAT' | 'FILE' | 'LETTER' = 'MEMORY',
): Promise<DraftMedia> {
  const kind = assetKind(asset) ?? 'image';
  let uri = asset.uri;
  let mime = asset.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg');
  let name = assetName(asset, index);
  if (kind === 'image') {
    const prepared = await stripGps({ uri: asset.uri, width: asset.width, height: asset.height });
    uri = prepared.uri;
    mime = prepared.mime;
    name = jpegName(name);
  }
  let data: Blob | undefined;
  let totalBytes: number;
  if (Platform.OS === 'web') {
    data = kind === 'video' && asset.file ? asset.file : await blobFromUri(uri);
    totalBytes = data.size;
  } else {
    // Native видеог санах ойд уншихгүй — picker-ийн хэмжээ хангалттай
    totalBytes = kind === 'video' && asset.fileSize ? asset.fileSize : (await blobFromUri(uri)).size;
  }
  const durationMs = kind === 'video' && asset.duration ? Math.round(asset.duration) : undefined;
  const item = await uploadQueue.add({
    purpose,
    fileName: name,
    mime,
    totalBytes,
    ...(data ? { data } : { uri }),
    ...(durationMs !== undefined ? { durationMs } : {}),
  });
  return {
    key: item.localId,
    localId: item.localId,
    mediaId: null,
    previewUri: kind === 'video' ? null : uri,
    kind,
    name,
    altText: '',
    durationMs: durationMs ?? null,
  };
}
