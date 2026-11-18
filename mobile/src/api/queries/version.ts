import { useQuery } from '@tanstack/react-query';

import { fetchVersion, type VersionInfo } from './auth';

export type { VersionInfo };

/**
 * `['version']` (`GET /version?platform&current`, FR-17.5): S-01 хаалга (`useBootstrap`), S-20 ба S-91-ийн
 * «Шинэ хувилбар бэлэн» карт нэг кэшийг хуваалцана. Нэвтрэлтгүй (public) — токен хүлээхгүй.
 */
export const VERSION_KEY = ['version'] as const;

export const versionQueryOptions = {
  queryKey: VERSION_KEY,
  queryFn: fetchVersion,
  retry: 0,
  staleTime: 5 * 60_000,
} as const;

export function useVersionQuery() {
  return useQuery(versionQueryOptions);
}
