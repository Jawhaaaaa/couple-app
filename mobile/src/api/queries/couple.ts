import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { api, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import { blobFromUri, simpleUpload } from '@/upload/simpleUpload';

import { type Couple, type MediaRef, partnerName, useCoupleQuery } from './pairing';

type S = components['schemas'];
export type BreakupState = S['BreakupState'];
export type SpaceStatus = S['SpaceStatus'];
export type CoupleTheme = S['Theme'];
export type MyViewUpdate = S['MyViewUpdate'];
export type ThemeProposal = S['ThemeProposal'];
export const COUPLE_THEMES: CoupleTheme[] = ['CORAL', 'LAVENDER', 'FOREST', 'OCEAN'];

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

/** `PATCH /couple/my-view` — хоч, хамтрагчийн зураг, маскотын өнгө; зөвхөн дуудагчид (AC-137, AC-190). */
export function updateMyView(body: MyViewUpdate): Promise<Couple> {
  return unwrap(api.PATCH('/couple/my-view', { body }));
}

/** `POST /couple/theme-proposals` (AC-138) — хүлээгдэж буй санал байвал 409. */
export function proposeTheme(theme: CoupleTheme): Promise<ThemeProposal> {
  return unwrap(api.POST('/couple/theme-proposals', { body: { theme } }));
}

export function acceptThemeProposal(proposalId: string): Promise<Couple> {
  return unwrap(api.POST('/couple/theme-proposals/{proposalId}/accept', { params: { path: { proposalId } } }));
}

export function declineThemeProposal(proposalId: string): Promise<unknown> {
  return unwrap(api.POST('/couple/theme-proposals/{proposalId}/decline', { params: { path: { proposalId } } }));
}

/**
 * Хамтрагчид өгөх хувийн зураг: `AVATAR` зорилгоор (дуудагчийн SOLO space — хамтрагчид харагдахгүй)
 * upload хийгээд `partnerAvatarMediaId` болгоно (AC-137).
 */
export async function uploadPartnerAvatar(uri: string, onProgress?: (fraction: number) => void): Promise<Couple> {
  const data = await blobFromUri(uri);
  const media = await simpleUpload({ purpose: 'AVATAR', fileName: 'partner.jpg', mime: 'image/jpeg', data, onProgress });
  return updateMyView({ partnerAvatarMediaId: media.id });
}

/** S-82-ийн бичих үйлдлүүд — хариуг `['couple']`-д шууд тусгана. */
export function useCoupleSettingsMutations() {
  const queryClient = useQueryClient();
  const setCouple = (couple: Couple) => queryClient.setQueryData(COUPLE_KEY, couple);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: COUPLE_KEY });
  return {
    myView: useMutation({ mutationFn: updateMyView, onSuccess: setCouple }),
    partnerAvatar: useMutation({ mutationFn: (uri: string) => uploadPartnerAvatar(uri), onSuccess: setCouple }),
    propose: useMutation({ mutationFn: proposeTheme, onSuccess: refresh }),
    accept: useMutation({ mutationFn: acceptThemeProposal, onSuccess: setCouple }),
    decline: useMutation({ mutationFn: declineThemeProposal, onSuccess: refresh }),
  };
}

/** Хамтрагчийн харагдах зураг: миний өгсөн хувийн зураг → түүний профайл зураг (AC-137). */
export function partnerAvatar(couple: Couple | null | undefined): MediaRef | null {
  return couple?.myView?.partnerAvatar ?? couple?.partner?.avatar ?? null;
}

export interface DisplayUser {
  name: string;
  avatar: MediaRef | null;
}

/**
 * Хэрэглэгчийн лавлагааг (зохиогч, илгээгч) дэлгэцэд харуулах нэр, зураг болгоно: хамтрагч бол миний
 * өгсөн хоч ба зураг (AC-137 — «A-гийн бүх дэлгэцэд тэр хоч, avatar»), бусад нь хэвээр.
 */
export function displayUser(couple: Couple | null | undefined, ref: { id: string; displayName: string; avatar?: MediaRef | null }): DisplayUser {
  if (couple?.partner && couple.myView && ref.id === couple.partner.id) {
    return { name: couple.myView.partnerNickname ?? ref.displayName, avatar: couple.myView.partnerAvatar ?? ref.avatar ?? null };
  }
  return { name: ref.displayName, avatar: ref.avatar ?? null };
}

/** `displayUser`-ийн hook хувилбар — `['couple']` кэшээс. */
export function useDisplayUser(): (ref: { id: string; displayName: string; avatar?: MediaRef | null }) => DisplayUser {
  const couple = useCoupleQuery().data;
  return useCallback((ref) => displayUser(couple, ref), [couple]);
}

/** Хамтрагчийн нэр (хоч → дуудах нэр → нэр); хос биш бол `null`. */
export function usePartnerName(): string | null {
  const couple = useCoupleQuery().data;
  return couple?.myView ? partnerName(couple) : null;
}
