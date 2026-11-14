import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Linking } from 'react-native';

import { api } from '@/api/client';
import { useBootstrap } from '@/api/queries/bootstrap';
import type { Dashboard } from '@/api/queries/dashboard';
import type { VersionInfo } from '@/api/queries/version';
import HomeScreen from '@/app/(tabs)/home/index';
import AboutScreen from '@/app/settings/about';
import UpdateRequiredScreen from '@/app/update-required';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { ok, renderWithClient } from '../../../test/memoryFixtures';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));
// Апп-ын хувилбар (build үеийн `EXPO_PUBLIC_APP_VERSION`) — задлалт нь `buildInfo.test.ts`-д
jest.mock('@/platform/buildInfo', () => ({ buildInfo: () => ({ version: '1.1.0', build: '141', commit: '830fbfe' }) }));

const DOWNLOAD = 'https://aura.example.mn/download';
const STORE = 'https://play.google.com/store/apps/details?id=mn.aura';

const version = (over: Partial<VersionInfo> = {}): VersionInfo => ({
  latest: '1.2.0',
  minVersion: '1.0.0',
  build: '142',
  commitSha: '830fbfe',
  downloadUrl: DOWNLOAD,
  storeUrl: null,
  updateAvailable: true,
  updateRequired: false,
  ...over,
});

const DASHBOARD: Dashboard = {
  counter: { days: 10, startDate: '2026-11-05', breakdown: { years: 0, months: 0, days: 10 }, confirmed: true },
  me: { name: 'Бат', localTime: '2026-11-14T20:30:00+08:00', utcOffsetMinutes: 480, offsetFromMeMinutes: 0, weather: null },
  partner: null,
  longDistance: null,
  signalsToday: { sent: 0, received: 0 },
  unseenSignals: null,
  nextDate: null,
  upcoming: [],
  recentMemories: [],
  unreadMessages: 0,
  onThisDay: null,
  recap: null,
  incomingLetters: [],
  survey: null,
  update: null,
};

let versionData: VersionInfo;
let getSpy: jest.SpyInstance;
let openSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  usePrefsStore.setState({ ...defaultPrefs, animation: 'OFF' });
  useSessionStore.setState({ accessToken: 'at', userId: 'u-bat', signedOut: false });
  versionData = version();
  getSpy = jest.spyOn(api, 'GET').mockImplementation((async (path: string) => {
    if (path === '/version') return ok(versionData);
    if (path === '/dashboard') return ok(DASHBOARD);
    if (path === '/me') {
      return ok({ id: 'u-bat', displayName: 'Бат', emailVerified: true, policyUpdateRequired: false, space: { id: 's', kind: 'SOLO', status: 'ACTIVE' } });
    }
    return ok({});
  }) as never);
  openSpy = jest.spyOn(Linking, 'openURL').mockImplementation(async () => undefined);
});

afterEach(() => {
  getSpy.mockRestore();
  openSpy.mockRestore();
});

describe('«Шинэ хувилбар бэлэн» карт (FR-17.5)', () => {
  it('AC-141 S-20 нүүрэнд — GET /version?current=апп-ын хувилбар, товшвол татах хуудас (DEV)', async () => {
    await renderWithClient(<HomeScreen />);
    await waitFor(() => expect(screen.getByTestId('home-update')).toBeTruthy());
    expect(getSpy).toHaveBeenCalledWith('/version', { params: { query: { platform: 'ios', current: '1.1.0' } } });
    expect(screen.getByTestId('home-update-body')).toHaveTextContent('Aura 1.2.0 гарлаа (танайх 1.1.0). Шинэчлээд шинэ боломжуудыг туршаарай.');
    await fireEvent.press(screen.getByTestId('home-update-open'));
    expect(openSpy).toHaveBeenCalledWith(DOWNLOAD);
  });

  it('AC-141 S-91 «Тухай»-д — store холбоос (prod) байвал түүнийг нээнэ', async () => {
    versionData = version({ storeUrl: STORE });
    await renderWithClient(<AboutScreen />);
    await waitFor(() => expect(screen.getByTestId('about-update')).toBeTruthy());
    expect(screen.getByText('Шинэ хувилбар бэлэн')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('about-update-open'));
    expect(openSpy).toHaveBeenCalledWith(STORE);
  });

  it('AC-141 апп хамгийн сүүлийн хувилбартай бол карт гарахгүй', async () => {
    versionData = version({ latest: '1.1.0', updateAvailable: false });
    await renderWithClient(<AboutScreen />);
    await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/version', expect.anything()));
    expect(screen.getByTestId('about-version')).toHaveTextContent('1.1.0');
    expect(screen.queryByTestId('about-update')).toBeNull();
  });

  it('AC-141 native-д татах холбоосгүй бол хоосон товчтой карт харуулахгүй', async () => {
    versionData = version({ downloadUrl: null, storeUrl: null });
    await renderWithClient(<AboutScreen />);
    await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/version', expect.anything()));
    expect(screen.queryByTestId('about-update')).toBeNull();
  });
});

describe('S-97 шинэчлэх шаардлагатай', () => {
  it('AC-141 minVersion > апп → useBootstrap `updateRequired` (бүх апп хаагдана)', async () => {
    versionData = version({ minVersion: '1.2.0', updateRequired: true });
    const restore = jest.spyOn(api, 'restoreSession').mockResolvedValue('restored');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = await renderHook(() => useBootstrap(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('updateRequired'));
    restore.mockRestore();
  });

  it('сервер `updateRequired` тооцоогүй ч minVersion > апп бол хаана; тэнцүү бол хаахгүй', async () => {
    versionData = version({ minVersion: '1.1.1', updateRequired: false });
    const restore = jest.spyOn(api, 'restoreSession').mockResolvedValue('restored');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = await renderHook(() => useBootstrap(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('updateRequired'));

    versionData = version({ minVersion: '1.1.0' });
    const client2 = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const wrapper2 = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client2}>{children}</QueryClientProvider>;
    const second = await renderHook(() => useBootstrap(), { wrapper: wrapper2 });
    await waitFor(() => expect(second.result.current.status).toBe('ready'));
    restore.mockRestore();
  });

  it('S-97 дэлгэц — хувилбарууд ба татах/store товч, буцах замгүй', async () => {
    versionData = version({ minVersion: '1.2.0', updateRequired: true, storeUrl: STORE });
    await renderWithClient(<UpdateRequiredScreen />);
    await waitFor(() => expect(screen.getByTestId('update-required-versions')).toHaveTextContent('Танайх 1.1.0 · хамгийн багадаа 1.2.0'));
    expect(screen.getByTestId('screen-S-97')).toBeTruthy();
    expect(screen.getByText('Шинэчлэх шаардлагатай')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('update-required-open'));
    expect(openSpy).toHaveBeenCalledWith(STORE);
  });

  it('S-97 холбоосгүй үед дэлгүүрээс шинэчлэх заавар (хоосон товч 0)', async () => {
    versionData = version({ minVersion: '1.2.0', updateRequired: true, downloadUrl: null });
    await renderWithClient(<UpdateRequiredScreen />);
    await waitFor(() => expect(screen.getByTestId('update-required-store-hint')).toBeTruthy());
    expect(screen.queryByTestId('update-required-open')).toBeNull();
  });
});
