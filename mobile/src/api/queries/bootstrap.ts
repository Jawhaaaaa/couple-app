import { useIsRestoring, useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import { api } from '@/api/client';
import { useSessionStore } from '@/stores/sessionStore';

import { fetchMe, fetchVersion, type Me, type VersionInfo } from './auth';

export type BootStatus = 'pending' | 'ready' | 'unreachable' | 'updateRequired';

/** `['me']` — нэвтэрсэн үед татна; offline-д persist кэшээс (AC-156). */
export function useMeQuery() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: ['me'], queryFn: fetchMe, enabled: !!accessToken });
}

export interface Bootstrap {
  status: BootStatus;
  /** Сесс хүчинтэй (эсвэл сервер хүрэхгүй ч кэштэй `me` байгаа — offline). */
  signedIn: boolean;
  me: Me | undefined;
  version: VersionInfo | undefined;
  retry: () => void;
}

/**
 * S-01 Splash-ийн ачаалал (LLD §4.3): `['version']` (шинэчлэх шаардлагатай эсэх),
 * хадгалсан refresh-ээр сесс сэргээх, `['me']`. Persist кэш сэргэж дуустал хүлээнэ.
 */
export function useBootstrap(): Bootstrap {
  const isRestoring = useIsRestoring();
  const accessToken = useSessionStore((s) => s.accessToken);
  const version = useQuery({
    queryKey: ['version'],
    queryFn: fetchVersion,
    enabled: !isRestoring,
    retry: 0,
    staleTime: 5 * 60_000,
  });
  const session = useQuery({
    queryKey: ['session-restore'],
    queryFn: () => api.restoreSession(),
    enabled: !isRestoring,
    retry: 0,
    staleTime: Infinity,
  });
  const me = useMeQuery();

  const { refetch: refetchSession } = session;
  const { refetch: refetchMe } = me;
  const { refetch: refetchVersion } = version;
  const retry = useCallback(() => {
    void refetchVersion();
    void refetchSession().then(() => (useSessionStore.getState().accessToken ? refetchMe() : undefined));
  }, [refetchMe, refetchSession, refetchVersion]);

  const offlineSession = !accessToken && session.data === 'unreachable' && !!me.data;
  const signedIn = !!accessToken || offlineSession;

  let status: BootStatus;
  if (version.data?.updateRequired) status = 'updateRequired';
  else if (isRestoring || session.isPending) status = 'pending';
  else if (!accessToken) status = session.data === 'unreachable' && !me.data ? 'unreachable' : 'ready';
  else if (me.isPending) status = 'pending';
  else if (me.isError && !me.data) status = 'unreachable';
  else status = 'ready';

  return { status, signedIn, me: signedIn ? me.data : undefined, version: version.data, retry };
}
