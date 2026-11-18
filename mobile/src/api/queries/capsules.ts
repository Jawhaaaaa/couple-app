import { type QueryClient, useQuery } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import { useSessionStore } from '@/stores/sessionStore';

type S = components['schemas'];
export type Capsule = S['Capsule'];
export type CapsuleSummary = S['CapsuleSummary'];
export type CapsulePart = Capsule['parts'][number];

/** Цагийн капсул (FR-10.5, GAP-15) — гэрээ `Capsules`. Key: `['capsules']`, `['capsule', id]` (`capsule.opened`). */
export const CAPSULES_KEY = ['capsules'] as const;
export const capsuleKey = (id: string) => ['capsule', id] as const;

export function useCapsules({ enabled = true }: { enabled?: boolean } = {}) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: CAPSULES_KEY, queryFn: () => unwrap(api.GET('/capsules')), enabled: !!accessToken && enabled });
}

export function useCapsule(id: string | undefined) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: capsuleKey(id ?? ''),
    queryFn: () => unwrap(api.GET('/capsules/{capsuleId}', { params: { path: { capsuleId: id ?? '' } } })),
    enabled: !!accessToken && !!id,
  });
}

/** Үүсгэх — үүсгэгч хамтрагчаа урина: капсул хоёуланд харагдаж тус бүр өөрийн хэсгээ бичнэ (GAP-15). */
export function createCapsule(title: string, openOn: string): Promise<Capsule> {
  return unwrap(api.POST('/capsules', { body: { title, openOn } }));
}

export function putMyCapsulePart(id: string, body: string, mediaIds: string[]): Promise<Capsule> {
  return unwrap(api.PUT('/capsules/{capsuleId}/my-part', { params: { path: { capsuleId: id } }, body: { body, mediaIds } }));
}

/** Өөрийн хэсгийг битүүмжлэх — дараа нь засахгүй; хоёулаа битүүмжилмэгц түгжинэ (AC-45). */
export function sealCapsule(id: string): Promise<Capsule> {
  return unwrap(api.POST('/capsules/{capsuleId}/seal', { params: { path: { capsuleId: id } } }));
}

export function invalidateCapsules(client: QueryClient): Promise<void> {
  return Promise.all([client.invalidateQueries({ queryKey: CAPSULES_KEY }), client.invalidateQueries({ queryKey: ['capsule'] })]).then(() => undefined);
}
