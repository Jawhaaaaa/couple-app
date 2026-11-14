import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

import type { ChatPlace, Message } from '@/api/queries/chat';
import type { DraftPrefill } from '@/memories/editorModel';
import { blobFromUri } from '@/upload/simpleUpload';
import { uploadQueue } from '@/upload/uploadRuntime';

/** Чатын файлын дээд хэмжээ (FR-6.1, AC-87). */
export const FILE_MAX_BYTES = 50 * 1024 * 1024;
/** Гүйцэтгэгдэх/скрипт файл — сервер ч татгалзана (MediaInspector), энд эрт анхааруулна. */
const FORBIDDEN_EXT = new Set(['exe', 'apk', 'js', 'mjs', 'bat', 'cmd', 'sh', 'msi', 'jar', 'com', 'scr', 'vbs', 'ps1', 'dll', 'html', 'htm']);

export type FileCheck = { ok: true } | { ok: false; reason: 'TOO_LARGE' | 'FORBIDDEN' };

export function checkChatFile(name: string, size: number): FileCheck {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (FORBIDDEN_EXT.has(ext)) return { ok: false, reason: 'FORBIDDEN' };
  if (size > FILE_MAX_BYTES) return { ok: false, reason: 'TOO_LARGE' };
  return { ok: true };
}

export type PickFileOutcome = { status: 'uploaded'; mediaId: string } | { status: 'cancelled' } | { status: 'rejected'; reason: 'TOO_LARGE' | 'FORBIDDEN' };

/** S-40 «Файл» — баримт (PDF г.м.) сонгож `purpose: FILE`-аар upload хийнэ. */
export async function pickAndUploadFile(): Promise<PickFileOutcome> {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
  if (result.canceled || result.assets.length === 0) return { status: 'cancelled' };
  const asset = result.assets[0];
  const data = Platform.OS === 'web' ? (asset.file ?? (await blobFromUri(asset.uri))) : undefined;
  const size = asset.size ?? data?.size ?? (await blobFromUri(asset.uri)).size;
  const check = checkChatFile(asset.name, size);
  if (!check.ok) return { status: 'rejected', reason: check.reason };
  const media = await uploadQueue.upload({
    purpose: 'FILE',
    fileName: asset.name,
    mime: asset.mimeType ?? 'application/octet-stream',
    totalBytes: size,
    ...(data ? { data } : { uri: asset.uri }),
  });
  return { status: 'uploaded', mediaId: media.id };
}

export type LocationOutcome = { status: 'ok'; place: ChatPlace } | { status: 'denied' } | { status: 'failed' };

/** S-40 «Байршил» — одоогийн байршил (зөвшөөрөлтэй), native-д хотын нэрийг урвуу geocoding-оор. */
export async function currentPlace(fallbackName: string): Promise<LocationOutcome> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const lat = Math.round(pos.coords.latitude * 1e5) / 1e5;
    const lon = Math.round(pos.coords.longitude * 1e5) / 1e5;
    let name = fallbackName;
    let city: string | null = null;
    let countryCode: string | null = null;
    if (Platform.OS !== 'web') {
      const [geo] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon }).catch(() => []);
      if (geo) {
        city = geo.city ?? geo.subregion ?? null;
        countryCode = geo.isoCountryCode ?? null;
        name = [geo.name, city].filter(Boolean).join(', ') || fallbackName;
      }
    }
    return { status: 'ok', place: { name: name.slice(0, 200), lat, lon, city, countryCode } };
  } catch {
    return { status: 'failed' };
  }
}

/** Байршлыг газрын зурагт нээх холбоос (OpenStreetMap — түлхүүргүй, FR-6.1). */
export function mapUrl(place: Pick<ChatPlace, 'lat' | 'lon'>): string {
  return `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=16/${place.lat}/${place.lon}`;
}

function localDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

/**
 * «Дурсамж болгох» (FR-6.8, AC-91): мессежийн текст, зураг, огноо, байршлаар бөглөгдсөн S-32 ноорог.
 * Гарчиг — текстийн эхний мөр (≤ 60), тайлбар — бүтэн текст.
 */
export function memoryPrefillFrom(m: Message, tz: string): DraftPrefill {
  const text = m.text?.trim() ?? '';
  const firstLine = text.split('\n')[0]?.slice(0, 60) ?? '';
  return {
    ...(firstLine ? { title: firstLine } : {}),
    ...(text ? { description: text } : {}),
    occurredOn: localDate(m.createdAt, tz),
    ...(m.location ? { place: m.location } : {}),
    ...(m.kind === 'IMAGE' && m.media
      ? { media: [{ id: m.media.id, kind: 'image' as const, previewUri: m.media.urls.md ?? m.media.urls.original }] }
      : {}),
  };
}

/**
 * «Болзооны санаа болгох» (FR-6.8, AC-91, DEC-AURA-005): мессежийн текст, байршлаар бөглөгдсөн S-53
 * ноорог. Гарчиг — текстийн эхний мөр (≤ 60), тайлбар — бүтэн текст.
 */
export function ideaPrefillFrom(m: Message): { title?: string; description?: string; place?: ChatPlace } {
  const text = m.text?.trim() ?? '';
  const firstLine = text.split('\n')[0]?.slice(0, 60) ?? '';
  return {
    ...(firstLine ? { title: firstLine } : {}),
    ...(text ? { description: text } : {}),
    ...(m.location ? { place: m.location } : {}),
  };
}
