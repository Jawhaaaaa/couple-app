import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, renderHook, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { api } from '@/api/client';
import { usePreferencesSync } from '@/api/queries/settings';
import IntroScreen from '@/app/(onboarding)/intro';
import { resolveGate } from '@/auth/gate';
import onboarding from '@/content/onboarding.json';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { ok, renderWithClient } from '../../../test/memoryFixtures';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const PREFS = {
  theme: 'DARK',
  dateFormat: 'YMD_DOT',
  animation: 'OFF',
  haptics: false,
  sound: false,
  checkinAutoShare: false,
  mascotColor: 'coral',
  introSeen: false,
  firstWeekHidden: false,
};

let patch: jest.SpyInstance;
let get: jest.SpyInstance;
let serverPrefs: typeof PREFS;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  usePrefsStore.setState({ ...defaultPrefs, animation: 'OFF' });
  useOnboardingStore.setState({ introSeen: false, hydrated: true });
  useSessionStore.setState({ accessToken: null, userId: null, signedOut: false });
  serverPrefs = { ...PREFS };
  get = jest.spyOn(api, 'GET').mockImplementation((async () => ok(serverPrefs)) as never);
  patch = jest.spyOn(api, 'PATCH').mockImplementation((async () => ok({ ...serverPrefs, introSeen: true })) as never);
});

afterEach(() => {
  get.mockRestore();
  patch.mockRestore();
});

describe('S-02 танилцуулга (FR-16.1)', () => {
  it('AC-133 3–4 слайд маскоттой: юу хийдэг → нууцлал → хос болох; «Дараах»/«Буцах»', async () => {
    const total = onboarding.items.length;
    expect(total).toBeGreaterThanOrEqual(3);
    expect(total).toBeLessThanOrEqual(4);
    await renderWithClient(<IntroScreen />);
    expect(screen.getByTestId('screen-S-02')).toBeTruthy();
    for (let i = 0; i < total; i++) {
      expect(screen.getByTestId(`intro-slide-${i + 1}`)).toBeTruthy();
      expect(screen.getByTestId('intro-title')).toHaveTextContent(onboarding.items[i].mn.title);
      expect(screen.getAllByTestId(/^mascot-/, { includeHiddenElements: true }).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId('intro-dots')).toHaveProp('accessibilityLabel', `${total}-аас ${i + 1} дахь слайд`);
      if (i < total - 1) await fireEvent.press(screen.getByTestId('intro-next'));
    }
    expect(screen.getByTestId('intro-title')).toHaveTextContent(onboarding.items[total - 1].mn.title);
    await fireEvent.press(screen.getByTestId('intro-back'));
    expect(screen.getByTestId(`intro-slide-${total - 1}`)).toBeTruthy();
  });

  it('AC-133 «Алгасах» → туг persist (дахин нээхэд гарахгүй), хаалга руу', async () => {
    await renderWithClient(<IntroScreen />);
    await fireEvent.press(screen.getByTestId('intro-skip'));
    expect(useOnboardingStore.getState().introSeen).toBe(true);
    expect(router.replace).toHaveBeenCalledWith('/');
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem('aura.onboarding')) ?? '{}')).toMatchObject({ state: { introSeen: true } }));
    // Нэвтрээгүй тул серверт бичихгүй
    expect(patch).not.toHaveBeenCalled();
  });

  it('AC-133 сүүлийн слайдын «Эхлэх» — нэвтэрсэн бол Preferences.introSeen = true', async () => {
    useSessionStore.setState({ accessToken: 'at', userId: 'u-bat', signedOut: false });
    await renderWithClient(<IntroScreen />);
    for (let i = 1; i < onboarding.items.length; i++) await fireEvent.press(screen.getByTestId('intro-next'));
    expect(screen.queryByTestId('intro-skip')).toBeNull();
    await fireEvent.press(screen.getByTestId('intro-start'));
    expect(useOnboardingStore.getState().introSeen).toBe(true);
    expect(patch).toHaveBeenCalledWith('/me/preferences', { body: { introSeen: true } });
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('англи хэлээр — `onboarding.json`-ийн en бичвэр', async () => {
    usePrefsStore.setState({ locale: 'en' });
    await renderWithClient(<IntroScreen />);
    expect(screen.getByTestId('intro-title')).toHaveTextContent(onboarding.items[0].en.title);
  });
});

describe('AC-133 эхлэлийн хаалга ба синк', () => {
  const me = {
    id: 'u',
    email: 'bat@aura.test',
    displayName: 'Бат',
    birthDate: '1998-05-14',
    timezone: 'Asia/Ulaanbaatar',
    locale: 'mn',
    emailVerified: true,
    policyVersionAccepted: '2026-11-14',
    policyUpdateRequired: false,
    onlineVisible: true,
    typingVisible: true,
    space: { id: 's', kind: 'COUPLE', status: 'ACTIVE' },
  } as unknown as Parameters<typeof resolveGate>[0]['me'];

  it('AC-133 анх суулгасан (туг алга, нэвтрээгүй) → S-02; үзсэн бол S-03', () => {
    expect(resolveGate({ signedIn: false, me: undefined, introSeen: false })).toEqual({ pathname: '/intro' });
    expect(resolveGate({ signedIn: false, me: undefined, introSeen: true })).toEqual({ pathname: '/login' });
  });

  it('AC-133 нэвтэрсэн хэрэглэгчид танилцуулга гаргахгүй', () => {
    expect(resolveGate({ signedIn: true, me, introSeen: false })).toEqual({ pathname: '/home' });
  });

  it('AC-133 серверт `introSeen` үнэн бол локал туг тавигдана (өөр төхөөрөмжид дахин гарахгүй)', async () => {
    serverPrefs = { ...PREFS, introSeen: true };
    await renderHook(() => usePreferencesSync('at'), { wrapper: makeWrapper() });
    await waitFor(() => expect(useOnboardingStore.getState().introSeen).toBe(true));
    expect(patch).not.toHaveBeenCalled();
  });

  it('AC-133 энэ төхөөрөмж дээр үзсэн боловч серверт худал бол серверт бичнэ', async () => {
    useOnboardingStore.setState({ introSeen: true });
    await renderHook(() => usePreferencesSync('at'), { wrapper: makeWrapper() });
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/me/preferences', { body: { introSeen: true } }));
  });
});

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
