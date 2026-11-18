import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import type { Me } from '@/api/queries/auth';
import { setAvatar } from '@/api/queries/profile';

import { blobFromUri, simpleUpload } from './simpleUpload';

/** Профайл зургийн дээд хэмжээ (FR-1.4, AC-62; гэрээ `AvatarRequest` — ≤ 10 MB). */
export const MAX_AVATAR_BYTES = 10 * 1024 * 1024;
/** Илгээхийн өмнө багасгах хамгийн урт тал. */
export const AVATAR_MAX_SIDE = 1024;

export interface PreparedAvatar {
  uri: string;
  width: number;
  height: number;
}

export type PickOutcome =
  | { status: 'picked'; avatar: PreparedAvatar }
  | { status: 'cancelled' }
  | { status: 'tooLarge' }
  | { status: 'denied'; canAskAgain: boolean };

/** Сонгосон зургийн хэмжээ (байт) — picker өгөөгүй бол файлыг уншиж тоолно. */
async function assetBytes(asset: ImagePicker.ImagePickerAsset): Promise<number> {
  if (typeof asset.fileSize === 'number') return asset.fileSize;
  if (asset.file) return asset.file.size;
  return (await blobFromUri(asset.uri)).size;
}

/** Төвөөс дөрвөлжин тайраад ≤ 1024 px болгоно (вэбд picker тайрдаггүй). */
export function squareCropPlan(width: number, height: number) {
  const side = Math.min(width, height);
  return {
    crop: width === height ? null : { originX: Math.floor((width - side) / 2), originY: Math.floor((height - side) / 2), width: side, height: side },
    resize: side > AVATAR_MAX_SIDE ? AVATAR_MAX_SIDE : null,
  };
}

async function prepare(asset: ImagePicker.ImagePickerAsset): Promise<PreparedAvatar> {
  const plan = squareCropPlan(asset.width, asset.height);
  const context = ImageManipulator.manipulate(asset.uri);
  if (plan.crop) context.crop(plan.crop);
  if (plan.resize) context.resize({ width: plan.resize, height: plan.resize });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/**
 * Зургийн сангаас сонгоно (`allowsEditing` + 1:1 — native-д дугуй тайралтын суурь
 * дөрвөлжин). 10 MB-аас их бол татгалзана (AC-62); дараа нь ≤ 1024 px JPEG болгоно.
 */
export async function pickAvatar(): Promise<PickOutcome> {
  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status === ImagePicker.PermissionStatus.DENIED) return { status: 'denied', canAskAgain: permission.canAskAgain };
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
  if (result.canceled || !result.assets[0]) return { status: 'cancelled' };
  const asset = result.assets[0];
  if ((await assetBytes(asset)) > MAX_AVATAR_BYTES) return { status: 'tooLarge' };
  return { status: 'picked', avatar: await prepare(asset) };
}

/** Бэлтгэсэн зургийг upload хийж (`purpose: AVATAR`) профайлд тавина (`PUT /me/avatar`). */
export async function uploadAvatar(avatar: PreparedAvatar, onProgress?: (fraction: number) => void): Promise<Me> {
  const data = await blobFromUri(avatar.uri);
  if (data.size > MAX_AVATAR_BYTES) throw new AvatarTooLargeError();
  const media = await simpleUpload({ purpose: 'AVATAR', fileName: 'avatar.jpg', mime: 'image/jpeg', data, onProgress });
  return setAvatar(media.id);
}

export class AvatarTooLargeError extends Error {
  constructor() {
    super('avatar > 10 MB');
  }
}
