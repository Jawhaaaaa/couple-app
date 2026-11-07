import { useQuery } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import { formatNumber } from '@/i18n/format';
import type { Locale } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

export type StorageUsage = components['schemas']['StorageUsage'];

/** Хосын хадгалах сангийн хэрэглээ (NFR-11, AC-200) — S-98, S-85. */
export const STORAGE_KEY = ['storage'] as const;

export function fetchStorageUsage(): Promise<StorageUsage> {
  return unwrap(api.GET('/storage/usage'));
}

export function useStorageUsage() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: STORAGE_KEY, queryFn: fetchStorageUsage, enabled: !!accessToken });
}

const GIB = 1024 ** 3;

/** Байтыг GB-аар (сервер GiB-ээр тоолдог — `aura.storage.quota-bytes` 10 GiB). */
export function toGigabytes(bytes: number): number {
  return bytes / GIB;
}

/** «3,2 / 10 GB»-ийн тоо: 0.1-ээр бөөрөнхийлж, бүхэл бол бутархайгүй. */
export function formatGigabytes(bytes: number, locale: Locale): string {
  const rounded = Math.round(toGigabytes(bytes) * 10) / 10;
  return formatNumber(rounded, locale, Number.isInteger(rounded) ? 0 : 1);
}
