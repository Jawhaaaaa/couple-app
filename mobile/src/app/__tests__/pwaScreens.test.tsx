import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { InstallContent } from '@/app/install';
import NotificationOpen from '@/app/notification-open';
import PushPermissionSheet from '@/app/push-permission';
import { PushPermissionNotice } from '@/components/PushPermissionNotice';
import { isNotificationClick } from '@/notifications/useNotificationTapRouting';
import * as push from '@/pwa/subscribePush';
import type { InstallPrompt } from '@/pwa/useInstallPrompt';
import { useSessionStore } from '@/stores/sessionStore';

import { ME, renderWithClient } from '../../../test/memoryFixtures';

const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  Redirect: ({ href }: { href: string }) => {
    mockRedirect(href);
    return null;
  },
  useLocalSearchParams: () => ({ type: 'LETTER_DELIVERED', deepLink: '/letters/l1' }),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const install = (patch: Partial<InstallPrompt>): InstallPrompt => ({
  context: 'ios-safari',
  canPrompt: false,
  offerAt: () => true,
  prompt: jest.fn(async () => 'accepted' as const),
  dismiss: jest.fn(),
  ...patch,
});

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ accessToken: 'at', userId: ME.id, signedOut: false });
});

describe('S-100 суулгах заавар (AC-153)', () => {
  it('(а) iOS Safari — зурагтай 3 алхам ба push/offline суулгасны дараа гэсэн тайлбар', async () => {
    await renderWithClient(<InstallContent install={install({})} />);
    expect(screen.getByTestId('screen-S-100')).toBeTruthy();
    for (const n of [1, 2, 3]) expect(screen.getByTestId(`install-ios-step-${n}`)).toBeTruthy();
    expect(screen.getByTestId('install-benefits')).toHaveTextContent(/суулгасны дараа/);
    expect(screen.queryByTestId('install-button')).toBeNull();
  });

  it('(б) standalone — заавар, «Дараа» алга; «аль хэдийн суусан»', async () => {
    await renderWithClient(<InstallContent install={install({ context: 'standalone', offerAt: () => false })} />);
    expect(screen.getByTestId('install-standalone')).toBeTruthy();
    expect(screen.queryByTestId('install-ios-steps')).toBeNull();
    expect(screen.queryByTestId('install-later')).toBeNull();
  });

  it('(г) iOS Chrome — «Safari-аар нээнэ үү», холбоос хуулах', async () => {
    await renderWithClient(<InstallContent install={install({ context: 'ios-other' })} />);
    expect(screen.getByTestId('install-ios-other')).toHaveTextContent(/Safari-аар нээнэ үү/);
    await fireEvent.press(screen.getByTestId('install-copy-link'));
    expect(await screen.findByTestId('install-message')).toHaveTextContent(/хуулагдлаа/);
    expect(screen.getByTestId('install-benefits')).toBeTruthy();
  });

  it('(д) Android Chrome beforeinstallprompt — «Суулгах» товч хөтчийн цонхыг нээнэ', async () => {
    const state = install({ context: 'android', canPrompt: true });
    await renderWithClient(<InstallContent install={state} />);
    expect(screen.getByTestId('install-button')).toHaveTextContent(/Суулгах/);
    await fireEvent.press(screen.getByTestId('install-button'));
    expect(state.prompt).toHaveBeenCalled();
    expect(await screen.findByTestId('install-message')).toBeTruthy();
    expect(screen.getByTestId('install-benefits')).toBeTruthy();
  });

  it('(в) «Дараа» — хааж 7 хоногийн хугацааг эхлүүлнэ', async () => {
    const state = install({});
    await renderWithClient(<InstallContent install={state} />);
    await fireEvent.press(screen.getByTestId('install-later'));
    expect(state.dismiss).toHaveBeenCalled();
    expect(router.back).toHaveBeenCalled();
  });
});

describe('S-101 мэдэгдлийн зөвшөөрөл (AC-154)', () => {
  it('нээгдэхэд системийн цонх асуухгүй; «Зөвшөөрөх» товшилтоор л enablePush', async () => {
    jest.spyOn(push, 'pushPermission').mockResolvedValue('default');
    const enable = jest.spyOn(push, 'enablePush').mockResolvedValue('granted');
    await renderWithClient(<PushPermissionSheet />);
    expect(screen.getByTestId('screen-S-101')).toBeTruthy();
    expect(screen.getByTestId('push-reasons')).toBeTruthy();
    expect(enable).not.toHaveBeenCalled();
    await fireEvent.press(await screen.findByTestId('push-allow'));
    await waitFor(() => expect(enable).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('push-granted')).toBeTruthy();
  });

  it('татгалзсан бол тохиргооноос асаах заавар (native — «Тохиргоо нээх»)', async () => {
    jest.spyOn(push, 'pushPermission').mockResolvedValue('denied');
    await renderWithClient(<PushPermissionSheet />);
    expect(await screen.findByTestId('push-denied')).toBeTruthy();
    expect(screen.getByTestId('push-open-settings')).toBeTruthy();
    expect(screen.queryByTestId('push-allow')).toBeNull();
  });

  it('серверт бүртгэж чадаагүй — «Илгээж чадсангүй» ба «Дахин оролдох»', async () => {
    jest.spyOn(push, 'pushPermission').mockResolvedValue('default');
    jest.spyOn(push, 'enablePush').mockRejectedValue(new Error('network'));
    await renderWithClient(<PushPermissionSheet />);
    await fireEvent.press(await screen.findByTestId('push-allow'));
    expect(await screen.findByTestId('push-error')).toHaveTextContent(/Илгээж чадсангүй/);
    expect(screen.getByTestId('push-allow')).toHaveTextContent(/Дахин оролдох/);
  });

  it('«Дараа» — зүгээр хаана', async () => {
    jest.spyOn(push, 'pushPermission').mockResolvedValue('default');
    const enable = jest.spyOn(push, 'enablePush');
    await renderWithClient(<PushPermissionSheet />);
    await fireEvent.press(screen.getByTestId('push-later'));
    expect(router.back).toHaveBeenCalled();
    expect(enable).not.toHaveBeenCalled();
  });
});

describe('S-24 / S-83 зөвшөөрлийн төлөв → S-101', () => {
  it('зөвшөөрөөгүй үед «Мэдэгдэл асаах» → /push-permission', async () => {
    jest.spyOn(push, 'pushPermission').mockResolvedValue('denied');
    await renderWithClient(<PushPermissionNotice />);
    expect(await screen.findByTestId('push-permission-notice')).toHaveTextContent(/хаагдсан/);
    await fireEvent.press(screen.getByTestId('push-permission-notice-open'));
    expect(router.push).toHaveBeenCalledWith('/push-permission');
  });

  it('зөвшөөрсөн бол харагдахгүй', async () => {
    jest.spyOn(push, 'pushPermission').mockResolvedValue('granted');
    await renderWithClient(<PushPermissionNotice />);
    await waitFor(() => expect(push.pushPermission).toHaveBeenCalled());
    expect(screen.queryByTestId('push-permission-notice')).toBeNull();
  });
});

describe('Вэб push товшилт → дэлгэц (AC-50)', () => {
  it('/notification-open — notificationRoutes-ээр redirect (захидал → S-67)', async () => {
    await renderWithClient(<NotificationOpen />);
    expect(mockRedirect).toHaveBeenCalledWith('/together/letters/l1');
  });

  it('SW-ийн NOTIFICATION_CLICK мессежийг танина', () => {
    expect(isNotificationClick({ type: 'NOTIFICATION_CLICK', data: { type: 'MESSAGE_NEW' } })).toBe(true);
    expect(isNotificationClick({ type: 'SKIP_WAITING' })).toBe(false);
    expect(isNotificationClick(null)).toBe(false);
  });
});
