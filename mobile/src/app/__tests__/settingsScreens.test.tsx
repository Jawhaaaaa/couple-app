import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';

import { api } from '@/api/client';
import { fromServer, toServer } from '@/api/queries/settings';
import AboutScreen from '@/app/settings/about';
import AppearanceScreen from '@/app/settings/appearance';
import SettingsScreen from '@/app/settings/index';
import LicensesScreen from '@/app/settings/licenses';
import { SettingsSync } from '@/components/settings/SettingsSync';
import { i18n } from '@/i18n';
import { playHaptic } from '@/motion/haptics';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';
import { colorsFor } from '@/theme/tokens';

import { ME, ok, PARTNER, renderWithClient } from '../../../test/memoryFixtures';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) } }));
jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));
// `EXPO_PUBLIC_*` нь build (babel) үед орлуулагддаг тул энд модулийг орлуулна; задлалт нь `buildInfo.test.ts`-д
jest.mock('@/platform/buildInfo', () => ({ buildInfo: () => ({ version: '1.2.0', build: '142', commit: '830fbfe' }) }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => {}),
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success' },
}));

const COUPLE = {
  id: 'c1',
  kind: 'COUPLE',
  status: 'ACTIVE',
  timezone: 'Asia/Ulaanbaatar',
  startDateStatus: 'CONFIRMED',
  theme: 'CORAL',
  partner: { id: PARTNER.id, displayName: 'Ану', avatar: null, timezone: 'Asia/Ulaanbaatar' },
  myView: { partnerNickname: null, partnerAvatar: null, mascotColor: 'sky' },
  isLongDistance: false,
};
const SERVER_PREFS = {
  theme: 'LIGHT',
  dateFormat: 'DMY_SLASH',
  animation: 'REDUCED',
  haptics: false,
  sound: true,
  checkinAutoShare: false,
  mascotColor: 'sky',
  introSeen: true,
  firstWeekHidden: false,
};

const spies: jest.SpyInstance[] = [];
let patch: jest.SpyInstance;
beforeEach(async () => {
  usePrefsStore.setState({ ...defaultPrefs });
  await i18n.changeLanguage('mn');
  useSessionStore.setState({ accessToken: 'at', userId: ME.id, signedOut: false });
  spies.push(
    jest.spyOn(api, 'GET').mockImplementation((async (path: string) => (path === '/me/preferences' ? ok(SERVER_PREFS) : ok(COUPLE))) as never),
  );
  patch = jest.spyOn(api, 'PATCH').mockImplementation((async () => ok(SERVER_PREFS)) as never);
  spies.push(patch);
  jest.clearAllMocks();
});
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

describe('S-80 тохиргооны жагсаалт', () => {
  it('S-81…S-91 бүх дэлгэц рүү холбоостой', async () => {
    await renderWithClient(<SettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('settings-breakup')).toBeTruthy());
    const routes: [string, string][] = [
      ['settings-profile', '/settings/profile'],
      ['settings-couple', '/settings/couple'],
      ['settings-notifications', '/settings/notifications'],
      ['settings-security', '/settings/security'],
      ['settings-data', '/settings/data'],
      ['settings-breakup', '/settings/breakup'],
      ['settings-delete-account', '/settings/delete-account'],
      ['settings-appearance', '/settings/appearance'],
      ['settings-licenses', '/settings/licenses'],
      ['settings-policies', '/settings/policies'],
      ['settings-about', '/settings/about'],
    ];
    for (const [testID, route] of routes) {
      await fireEvent.press(screen.getByTestId(testID));
      expect(router.push).toHaveBeenLastCalledWith(route);
    }
  });
});

describe('S-88 харагдах байдал', () => {
  it('AC-135 «English» — дахин ачаалалгүй (ижил дэлгэц, mount хэвээр) бичвэр англи болно', async () => {
    await renderWithClient(<AppearanceScreen />);
    const root = screen.getByTestId('screen-S-88');
    expect(screen.getByText('Харагдах байдал')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('appearance-locale-en'));
    await waitFor(() => expect(screen.getByText('Appearance')).toBeTruthy());
    expect(screen.getByTestId('screen-S-88')).toBe(root);
    expect(usePrefsStore.getState().locale).toBe('en');
  });

  it('AC-DS-03 «Цайвар» → «Системийн»: cross-fade, серверт LIGHT/SYSTEM', async () => {
    usePrefsStore.setState({ theme: 'dark' });
    await renderWithClient(<AppearanceScreen />);
    await fireEvent.press(screen.getByTestId('appearance-theme-mode-light'));
    expect(usePrefsStore.getState().theme).toBe('light');
    // Ижил дэлгэц дээр палитр солигдоно (дахин ачаалалгүй)
    expect(screen.getByTestId('theme-root')).toHaveStyle({ backgroundColor: colorsFor('CORAL', 'light').bg });
    expect(screen.getByTestId('screen-S-88')).toBeTruthy();
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/me/preferences', { body: { theme: 'LIGHT' } }));
    await fireEvent.press(screen.getByTestId('appearance-theme-mode-system'));
    await waitFor(() => expect(patch).toHaveBeenLastCalledWith('/me/preferences', { body: { theme: 'SYSTEM' } }));
  });

  it('AC-139 огнооны формат 3 — жишээ шууд, серверт хадгална', async () => {
    await renderWithClient(<AppearanceScreen />);
    expect(screen.getByTestId('appearance-date-example')).toHaveTextContent(/2026\.11\.07/);
    await fireEvent.press(screen.getByTestId('appearance-date-format-DMY_SLASH'));
    expect(screen.getByTestId('appearance-date-example')).toHaveTextContent(/07\/11\/2026/);
    await fireEvent.press(screen.getByTestId('appearance-date-format-MDY_SLASH'));
    expect(screen.getByTestId('appearance-date-example')).toHaveTextContent(/11\/07\/2026/);
    await waitFor(() => expect(patch).toHaveBeenLastCalledWith('/me/preferences', { body: { dateFormat: 'MDY_SLASH' } }));
  });

  it('AC-MO-03 анимаци «Унтраах»', async () => {
    await renderWithClient(<AppearanceScreen />);
    await fireEvent.press(screen.getByTestId('appearance-animation-OFF'));
    expect(usePrefsStore.getState().animation).toBe('OFF');
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/me/preferences', { body: { animation: 'OFF' } }));
  });

  it('AC-MO-04 haptic анхдагч асаалттай; унтраасны дараа haptic дуудлага 0', async () => {
    await renderWithClient(<AppearanceScreen />);
    expect(screen.getByTestId('appearance-haptics').props.value).toBe(true);
    await fireEvent(screen.getByTestId('appearance-haptics'), 'valueChange', false);
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/me/preferences', { body: { haptics: false } }));
    jest.clearAllMocks();
    expect(playHaptic('ANIM-01')).toBe('none');
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it('AC-217 «Дуу» анхдагч унтраастай, асаахад серверт хадгална', async () => {
    await renderWithClient(<AppearanceScreen />);
    expect(screen.getByTestId('appearance-sound').props.value).toBe(false);
    await fireEvent(screen.getByTestId('appearance-sound'), 'valueChange', true);
    expect(usePrefsStore.getState().sound).toBe(true);
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/me/preferences', { body: { sound: true } }));
  });

  it('сервер хүрэхгүй бол локал утга хэвээр, тайлбартай', async () => {
    patch.mockImplementation((async () => {
      throw new TypeError('network');
    }) as never);
    await renderWithClient(<AppearanceScreen />);
    await fireEvent.press(screen.getByTestId('appearance-animation-REDUCED'));
    expect(await screen.findByTestId('appearance-sync-failed')).toBeTruthy();
    expect(usePrefsStore.getState().animation).toBe('REDUCED');
  });
});

describe('Серверийн Preferences синк', () => {
  it('нэвтэрсэн үед GET /me/preferences → локал тохиргоо', async () => {
    await renderWithClient(<SettingsSync />);
    await waitFor(() => expect(usePrefsStore.getState().dateFormat).toBe('DMY_SLASH'));
    const s = usePrefsStore.getState();
    expect([s.theme, s.animation, s.haptics, s.sound, s.mascotColor]).toEqual(['light', 'REDUCED', false, true, 'sky']);
  });

  it('fromServer/toServer — танихгүй утгыг алгасна', () => {
    expect(fromServer({ theme: 'SYSTEM', dateFormat: 'NOPE' as never, mascotColor: 'neon' })).toEqual({ theme: 'system' });
    expect(toServer({ theme: 'dark', haptics: false })).toEqual({ theme: 'DARK', haptics: false });
  });
});

describe('S-89 лиценз ба талархал', () => {
  it('AC-AS-02 Noto (CC BY 4.0 © Google), Fluent (MIT), фонт (OFL), OSM ба Open-Meteo харагдана', async () => {
    await renderWithClient(<LicensesScreen />);
    expect(screen.getByText('Animated Noto Emoji © Google, CC BY 4.0')).toBeTruthy();
    expect(screen.getByText('Fluent Emoji 3D © Microsoft, MIT')).toBeTruthy();
    expect(screen.getAllByText(/SIL OFL 1\.1/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/OpenStreetMap contributors/)).toBeTruthy();
    expect(screen.getByText(/Open-Meteo — CC BY 4\.0/)).toBeTruthy();
    expect(screen.getByText(/Lucide/)).toBeTruthy();
  });
});

describe('S-91 тухай', () => {
  it('AC-190 semver + build + commit SHA (build-ийн EXPO_PUBLIC_*)', async () => {
    await renderWithClient(<AboutScreen />);
    expect(screen.getByTestId('about-version')).toHaveTextContent('1.2.0');
    expect(screen.getByTestId('about-build-number')).toHaveTextContent('142');
    expect(screen.getByTestId('about-commit')).toHaveTextContent('830fbfe');
    await fireEvent.press(screen.getByTestId('about-licenses'));
    expect(router.push).toHaveBeenCalledWith('/settings/licenses');
  });
});
