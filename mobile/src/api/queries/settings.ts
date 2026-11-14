import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import { type PrefsState, usePrefsStore } from '@/stores/prefsStore';
import { mascotColors, type ThemePreference } from '@/theme/tokens';

type S = components['schemas'];
export type Preferences = S['Preferences'];
export type PreferencesUpdate = S['PreferencesUpdate'];

/**
 * Хэрэглэгчийн тохиргоо (FR-18.2, FR-18.3, FR-19.7) — `GET/PATCH /me/preferences`. Локал `prefsStore`
 * нь UI-г шууд солино (дахин ачаалалгүй — AC-135, AC-DS-03); сервертэй синк нь өөр төхөөрөмжид ижил
 * тохиргоо гаргана. Хэл нь зөвхөн энэ төхөөрөмжид (мэдэгдэл, имэйлийн хэл нь S-81 профайлд).
 */
export const PREFERENCES_KEY = ['preferences'] as const;

const THEME_TO_SERVER: Record<ThemePreference, Preferences['theme']> = { dark: 'DARK', light: 'LIGHT', system: 'SYSTEM' };
const THEME_FROM_SERVER: Record<Preferences['theme'], ThemePreference> = { DARK: 'dark', LIGHT: 'light', SYSTEM: 'system' };

export const DATE_FORMATS: Preferences['dateFormat'][] = ['YMD_DOT', 'DMY_SLASH', 'MDY_SLASH'];
export const ANIMATIONS: Preferences['animation'][] = ['ALL', 'REDUCED', 'OFF'];

export type SyncedPrefs = Pick<PrefsState, 'theme' | 'dateFormat' | 'animation' | 'haptics' | 'sound' | 'mascotColor'>;

/** Серверийн `Preferences` → локал талбарууд (танихгүй утгыг алгасна — локал хэвээр). */
export function fromServer(p: Partial<Preferences>): Partial<SyncedPrefs> {
  const local: Partial<SyncedPrefs> = {};
  if (p.theme && p.theme in THEME_FROM_SERVER) local.theme = THEME_FROM_SERVER[p.theme];
  if (p.dateFormat && DATE_FORMATS.includes(p.dateFormat)) local.dateFormat = p.dateFormat;
  if (p.animation && ANIMATIONS.includes(p.animation)) local.animation = p.animation;
  if (typeof p.haptics === 'boolean') local.haptics = p.haptics;
  if (typeof p.sound === 'boolean') local.sound = p.sound;
  if (p.mascotColor && p.mascotColor in mascotColors) local.mascotColor = p.mascotColor as SyncedPrefs['mascotColor'];
  return local;
}

/** Локал өөрчлөлт → `PreferencesUpdate`. */
export function toServer(patch: Partial<SyncedPrefs>): PreferencesUpdate {
  const body: PreferencesUpdate = {};
  if (patch.theme) body.theme = THEME_TO_SERVER[patch.theme];
  if (patch.dateFormat) body.dateFormat = patch.dateFormat;
  if (patch.animation) body.animation = patch.animation;
  if (patch.haptics !== undefined) body.haptics = patch.haptics;
  if (patch.sound !== undefined) body.sound = patch.sound;
  if (patch.mascotColor) body.mascotColor = patch.mascotColor;
  return body;
}

export function fetchPreferences(): Promise<Preferences> {
  return unwrap(api.GET('/me/preferences'));
}

export function patchPreferences(body: PreferencesUpdate): Promise<Preferences> {
  return unwrap(api.PATCH('/me/preferences', { body }));
}

/**
 * Тохиргоог өөрчилнө: локалд шууд (UI тэр даруй), дараа нь серверт. Нэвтрээгүй эсвэл сүлжээ алга бол
 * локал утга хэвээр — дараагийн амжилттай синкээр серверийнх ирнэ.
 */
export async function setPreference(patch: Partial<SyncedPrefs>): Promise<void> {
  usePrefsStore.getState().set(patch);
  const body = toServer(patch);
  if (Object.keys(body).length === 0) return;
  await patchPreferences(body);
}

/** Нэвтэрсэн үед серверийн тохиргоог татаж локалд тусгана (`SettingsSync`). */
export function usePreferencesSync(accessToken: string | null) {
  const query = useQuery({ queryKey: PREFERENCES_KEY, queryFn: fetchPreferences, enabled: !!accessToken, staleTime: 5 * 60_000 });
  const data = query.data;
  useEffect(() => {
    if (data) usePrefsStore.getState().set(fromServer(data));
  }, [data]);
  return query;
}
