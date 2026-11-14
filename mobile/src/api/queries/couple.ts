import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import type { components } from '@/api/schema';

import { type Couple, useCoupleQuery } from './pairing';

type S = components['schemas'];
export type BreakupState = S['BreakupState'];
export type SpaceStatus = S['SpaceStatus'];

/**
 * Хосын тохиргоо ба тасалалт (FR-14.6, FR-18.5…18.7) — гэрээ `contracts/openapi.yaml` (Couple).
 * Бүгд `['couple']` кэшийг шинэчилнэ; хамтрагчийн тал realtime `couple.updated`-аар (`eventRouter.ts`).
 */
export const COUPLE_KEY = ['couple'] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `POST /couple/breakup` — давхар баталгаа (`confirmStep: 2`) + нууц үг (AC-185). */
export function startBreakup(password: string): Promise<BreakupState> {
  return unwrap(api.POST('/couple/breakup', { body: { password, confirmStep: 2 } }));
}

/** `POST /couple/restore` — хоёулаа дарвал `ACTIVE`, нэг нь л бол хүлээнэ (AC-127). */
export function restoreCouple(): Promise<BreakupState> {
  return unwrap(api.POST('/couple/restore'));
}

/** Зөвхөн харах/экспорт горим: хос тасалсан (14 хоног) эсвэл хамтрагч акаунтаа устгасан (30 хоног) — DD-AURA-034. */
export function isReadOnlySpace(couple: Pick<Couple, 'status'> | null | undefined): boolean {
  return couple?.status === 'BREAKING' || couple?.status === 'ORPHANED';
}

/** Эцсийн хугацаа хүртэл үлдсэн бүтэн хоног (дээш тоймлоно; өнгөрсөн бол 0). */
export function daysLeft(deadline: string | null | undefined, now: number): number {
  if (!deadline) return 0;
  const ms = new Date(deadline).getTime() - now;
  return ms <= 0 ? 0 : Math.ceil(ms / DAY_MS);
}

/** Хос тасалсны дараах хугацаа: `breakup.restoreDeadline`, эс бөгөөс `readOnlyUntil`. */
export function readOnlyDeadline(couple: Couple | null | undefined): string | null {
  return couple?.breakup?.restoreDeadline ?? couple?.readOnlyUntil ?? null;
}

/** Хосын орон зай одоо бичих боломжгүй эсэх — бичих товчийг идэвхгүй болгоход (сервер 423 `SPACE_READ_ONLY`). */
export function useSpaceReadOnly(): boolean {
  const couple = useCoupleQuery();
  return isReadOnlySpace(couple.data);
}

/** Тасалалт/сэргээлтийн хариуг `['couple']` кэшид шууд тусгаад серверээс дахин татна. */
export function useBreakupMutations() {
  const queryClient = useQueryClient();
  const apply = (state: BreakupState) => {
    queryClient.setQueryData<Couple>(COUPLE_KEY, (prev) =>
      prev ? { ...prev, status: state.status, readOnlyUntil: state.restoreDeadline, breakup: state.status === 'ACTIVE' ? null : state } : prev,
    );
    void queryClient.invalidateQueries({ queryKey: COUPLE_KEY });
    void queryClient.invalidateQueries({ queryKey: ['me'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const breakup = useMutation({ mutationFn: startBreakup, onSuccess: apply });
  const restore = useMutation({ mutationFn: restoreCouple, onSuccess: apply });
  return { breakup, restore };
}
