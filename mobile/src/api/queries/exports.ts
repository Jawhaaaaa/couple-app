import { useQuery } from '@tanstack/react-query';

import { api, ApiRequestError, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import { compareCalendarDates, isCalendarDate } from '@/i18n/calendarDate';
import { useSessionStore } from '@/stores/sessionStore';

type S = components['schemas'];
export type DataExport = S['DataExport'];
export type ExportRequest = S['ExportRequest'];
export type ExportKind = DataExport['kind'];
export type ExportStatus = DataExport['status'];

/** Дурсамжийн экспорт (FR-5.12, FR-14.5, AC-126) — S-39. */
export const EXPORTS_KEY = ['exports'] as const;
/** Бэлтгэгдэж буй экспорт байвал жагсаалтыг тогтмол шинэчилнэ (realtime-гүй ажил). */
export const EXPORT_POLL_MS = 5_000;

export function isExportActive(status: ExportStatus): boolean {
  return status === 'QUEUED' || status === 'RUNNING';
}

export function useExports() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: EXPORTS_KEY,
    queryFn: () => unwrap(api.GET('/exports')),
    enabled: !!accessToken,
    refetchInterval: (query) => (query.state.data?.some((e) => isExportActive(e.status)) ? EXPORT_POLL_MS : false),
  });
}

export function startExport(body: ExportRequest): Promise<DataExport> {
  return unwrap(api.POST('/exports', { body }));
}

/** 429 `RATE_LIMITED` — нэг зэрэг нэг л экспорт бэлтгэгдэнэ. */
export function isExportBusy(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 429;
}

export function exportDownloadPath(id: string): string {
  return `/exports/${encodeURIComponent(id)}/download`;
}

export type ExportScope = 'all' | 'group' | 'range';

/** Маягтаас `POST /exports`-ийн бие; дутуу бол `null` (товч идэвхгүй). */
export function exportRequest(
  kind: ExportKind,
  scope: ExportScope,
  values: { groupId?: string | null; from?: string; to?: string },
  locale: ExportRequest['locale'],
): ExportRequest | null {
  if (scope === 'group') return values.groupId ? { kind, groupId: values.groupId, locale } : null;
  if (scope === 'range') {
    const from = values.from?.trim() ?? '';
    const to = values.to?.trim() ?? '';
    if (!isCalendarDate(from) || !isCalendarDate(to) || compareCalendarDates(from, to) > 0) return null;
    return { kind, from, to, locale };
  }
  return { kind, locale };
}
