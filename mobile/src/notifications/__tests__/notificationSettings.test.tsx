import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { api } from '@/api/client';
import { groupEnabled, type NotificationSettings, toggleGroup } from '@/api/queries/notifications';
import NotificationSettingsScreen from '@/app/settings/notifications';
import { isInAppPath, routeForNotification, TYPE_ROUTES } from '@/notifications/notificationRoutes';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { ME, ok, renderWithClient } from '../../../test/memoryFixtures';

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

const BASE: NotificationSettings = {
  disabledTypes: [],
  dndStart: '23:00',
  dndEnd: '07:00',
  hideContent: false,
  greetingMorning: true,
  greetingEvening: true,
  greetingMorningAt: '08:00',
  greetingEveningAt: '22:00',
};

describe('AC-50 мэдэгдэл товшиход холбогдох дэлгэц', () => {
  it('серверийн deepLink-ийг апп-ын route руу (захидал → S-67, капсул → S-68)', () => {
    expect(routeForNotification({ type: 'LETTER_DELIVERED', deepLink: '/letters/l1' })).toBe('/together/letters/l1');
    expect(routeForNotification({ type: 'CAPSULE_OPENED', deepLink: '/capsules/c1' })).toBe('/together/capsules/c1');
    expect(routeForNotification({ type: 'MESSAGE_NEW', deepLink: '/chat' })).toBe('/chat');
    expect(routeForNotification({ type: 'DATE_PROPOSED', deepLink: '/plans/p1' })).toBe('/plans/p1');
    expect(routeForNotification({ type: 'SCREENSHOT_TAKEN', deepLink: '/chat?around=m1' })).toBe('/chat?around=m1');
  });

  it('deepLink алга эсвэл гадны URL бол төрлөөр; танихгүй бол S-24', () => {
    expect(routeForNotification({ type: 'MESSAGE_NEW', deepLink: 'https://evil.example/x' })).toBe('/chat');
    expect(routeForNotification({ type: 'ANNIVERSARY_REMINDER', deepLink: null })).toBe('/together/occasions');
    expect(routeForNotification({ type: 'UNKNOWN', deepLink: '//evil.example' })).toBe('/notifications');
    expect(isInAppPath('/a b')).toBe(false);
    expect(Object.values(TYPE_ROUTES).every(isInAppPath)).toBe(true);
  });
});

describe('S-83 мэдэгдлийн тохиргоо', () => {
  let current: NotificationSettings;
  const spies: jest.SpyInstance[] = [];
  beforeEach(() => {
    jest.clearAllMocks();
    current = { ...BASE };
    usePrefsStore.setState({ ...defaultPrefs });
    useSessionStore.setState({ accessToken: 'at', userId: ME.id, signedOut: false });
    spies.push(
      jest.spyOn(api, 'GET').mockImplementation((async () => ok(current)) as never),
      jest.spyOn(api, 'PUT').mockImplementation((async (path: string, init: { body: unknown }) => {
        if (path === '/notification-settings') {
          current = init.body as NotificationSettings;
          return ok(current);
        }
        return ok({ quietUntil: '2026-11-08T04:00:00Z' });
      }) as never),
      jest.spyOn(api, 'DELETE').mockImplementation((async () => ok(undefined, 204)) as never),
    );
  });
  afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

  it('AC-119 бүлгийн бүх төрлийг унтраах/асаах', () => {
    const off = toggleGroup(BASE, ['HEART_RECEIVED', 'HUG_RECEIVED'], false);
    expect(off.disabledTypes.sort()).toEqual(['HEART_RECEIVED', 'HUG_RECEIVED']);
    expect(groupEnabled(off, ['HEART_RECEIVED', 'HUG_RECEIVED'])).toBe(false);
    expect(toggleGroup(off, ['HEART_RECEIVED', 'HUG_RECEIVED'], true).disabledTypes).toEqual([]);
  });

  it('AC-119 «Мессеж» унтраахад PUT disabledTypes-д MESSAGE_NEW; AC-49 агуулга нуух', async () => {
    await renderWithClient(<NotificationSettingsScreen />);
    await fireEvent(await screen.findByTestId('notif-type-messages'), 'valueChange', false);
    await waitFor(() => expect(current.disabledTypes).toContain('MESSAGE_NEW'));
    await fireEvent(screen.getByTestId('notif-hide-content'), 'valueChange', true);
    await waitFor(() => expect(current.hideContent).toBe(true));
  });

  it('AC-48 «Бүү саад бол» цагийг ЦЦ:ММ-ээр; буруу утга хадгалагдахгүй', async () => {
    await renderWithClient(<NotificationSettingsScreen />);
    const start = await screen.findByTestId('notif-dndStart');
    await fireEvent.changeText(start, '25:00');
    await fireEvent(start, 'blur');
    expect(api.PUT).not.toHaveBeenCalledWith('/notification-settings', expect.anything());
    await fireEvent.changeText(start, '22:30');
    await fireEvent(start, 'blur');
    await waitFor(() => expect(current.dndStart).toBe('22:30'));
  });

  it('AC-123 «Түр тайван байх» 1 өдөр → PUT /me/quiet-mode 1440; дуусгах DELETE', async () => {
    await renderWithClient(<NotificationSettingsScreen />);
    await fireEvent.press(await screen.findByTestId('notif-quiet-1440'));
    await waitFor(() => expect(api.PUT).toHaveBeenCalledWith('/me/quiet-mode', { body: { durationMinutes: 1440 } }));
    expect(await screen.findByTestId('notif-notice')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('notif-quiet-stop'));
    await waitFor(() => expect(api.DELETE).toHaveBeenCalledWith('/me/quiet-mode'));
    await fireEvent.press(screen.getByTestId('notif-push'));
    expect(router.push).toHaveBeenCalledWith('/push-permission');
  });
});
