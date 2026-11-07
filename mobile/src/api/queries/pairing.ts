import { useQuery } from '@tanstack/react-query';

import { api, ApiRequestError, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import { useSessionStore } from '@/stores/sessionStore';

type S = components['schemas'];
export type Invite = S['Invite'];
export type InvitePreview = S['InvitePreview'];
export type Pairing = S['Pairing'];
export type Couple = S['Couple'];
export type UserRef = S['UserRef'];
export type MediaRef = S['MediaRef'];

/**
 * Хос холбох (FR-2) REST дуудлагууд — гэрээ `contracts/openapi.yaml` (Invites, Couple).
 * Query key: `['invite']`, `['pairing']`, `['couple']` — realtime (`couple.linked`,
 * `pairing.requested`, `pairing.cancelled`) эдгээрийг шинэчилнэ (`eventRouter.ts`).
 */

/** 204 (агуулгагүй) бол `null`, бусад нь `unwrap`-тай ижил. */
async function unwrapOptional<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T | null> {
  const { data, error, response } = await p;
  if (response.status === 204) return null;
  if (!response.ok || error !== undefined) throw new ApiRequestError(response.status, (error as S['ApiError']) ?? null);
  return (data ?? null) as T | null;
}

export function fetchCurrentInvite(): Promise<Invite | null> {
  return unwrapOptional(api.GET('/invites/current'));
}

export function createInvite(): Promise<Invite> {
  return unwrap(api.POST('/invites'));
}

export function cancelInvite(inviteId: string): Promise<unknown> {
  return unwrap(api.DELETE('/invites/{inviteId}', { params: { path: { inviteId } } }));
}

export function lookupInvite(code: string): Promise<InvitePreview> {
  return unwrap(api.GET('/invites/lookup', { params: { query: { code } } }));
}

export function createPairing(code: string): Promise<Pairing> {
  return unwrap(api.POST('/pairings', { body: { code } }));
}

export function fetchCurrentPairing(): Promise<Pairing | null> {
  return unwrapOptional(api.GET('/pairings/current'));
}

export function confirmPairing(pairingId: string): Promise<Couple> {
  return unwrap(api.POST('/pairings/{pairingId}/confirm', { params: { path: { pairingId } } }));
}

export function cancelPairing(pairingId: string): Promise<unknown> {
  return unwrap(api.POST('/pairings/{pairingId}/cancel', { params: { path: { pairingId } } }));
}

export function fetchCouple(): Promise<Couple> {
  return unwrap(api.GET('/couple'));
}

export function proposeStartDate(date: string): Promise<Couple> {
  return unwrap(api.PUT('/couple/start-date', { body: { date } }));
}

export function decideSoloShare(share: boolean) {
  return unwrap(api.POST('/couple/solo-share', { body: { share } }));
}

/** Хүлээгдэж буй холболтыг (S-08, S-10, S-13) тогтмол шалгах — realtime тасарсан үеийн нөөц. */
export const PAIRING_POLL_MS = 15_000;

export function useCurrentInvite() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: ['invite'], queryFn: fetchCurrentInvite, enabled: !!accessToken });
}

export function useCurrentPairing({ poll = false }: { poll?: boolean } = {}) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['pairing'],
    queryFn: fetchCurrentPairing,
    enabled: !!accessToken,
    refetchInterval: poll ? PAIRING_POLL_MS : false,
  });
}

export function useCoupleQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: ['couple'], queryFn: fetchCouple, enabled: !!accessToken && enabled });
}

export function useInviteLookup(code: string | null) {
  return useQuery({
    queryKey: ['invite-lookup', code],
    queryFn: () => lookupInvite(code ?? ''),
    enabled: !!code,
    retry: 0,
    staleTime: 60_000,
  });
}

/** Хамтрагчийн дуудах нэр: миний өгсөн хоч → түүний дуудах нэр → нэр. */
export function partnerName(couple: Couple | null | undefined): string | null {
  if (!couple?.partner) return couple?.myView.partnerNickname ?? null;
  return couple.myView.partnerNickname ?? couple.partner.callName ?? couple.partner.displayName;
}

/** `MediaRef`-ийн жижиг хувилбарын URL (байхгүй бол эх). */
export function mediaThumb(media: MediaRef | null | undefined): string | null {
  if (!media) return null;
  return media.urls.sm ?? media.urls.md ?? media.urls.original;
}
