import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import { api } from '@/api/client';
import NotificationsScreen from '@/app/notifications';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';
import { ThemeProvider } from '@/theme/ThemeProvider';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const item = (n: number, readAt: string | null = null) => ({
  id: `0192f3a4-0000-7000-8000-00000000010${n}`,
  type: 'MEMORY_CREATED',
  title: `Гарчиг ${n}`,
  body: `Ану шинэ дурсамж нэмлээ ${n}`,
  deepLink: `/memories/m${n}`,
  createdAt: '2026-11-07T12:00:00Z',
  readAt,
});

const ok = (data: unknown) => ({ data, error: undefined, response: new Response(JSON.stringify(data), { status: 200 }) });
const noContent = () => ({ data: undefined, error: undefined, response: new Response(null, { status: 204 }) });

let getSpy: jest.SpyInstance;
let postSpy: jest.SpyInstance;

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <NotificationsScreen />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: 'u', signedOut: false });
  getSpy = jest.spyOn(api, 'GET').mockImplementation((async () =>
    ok({ items: [item(1), item(2), item(3), item(4, '2026-11-06T10:00:00Z')], nextCursor: null, unreadCount: 3 })) as never);
  postSpy = jest.spyOn(api, 'POST').mockImplementation((async () => noContent()) as never);
});

afterEach(() => {
  getSpy.mockRestore();
  postSpy.mockRestore();
});

describe('AC-120 S-24 мэдэгдлийн жагсаалт', () => {
  it('AC-120 уншаагүй «3»; нэгийг товшвол уншсан болгож холбогдох дэлгэц рүү, «2»; бүгдийг → «0»', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('notifications-unread-count')).toHaveTextContent('3 уншаагүй'));
    expect(screen.getAllByTestId('notification-item-unread')).toHaveLength(3);
    expect(screen.getAllByTestId('notification-item')).toHaveLength(1);
    expect(within(screen.getByTestId('topbar-unread')).getByText('3')).toBeTruthy();

    await fireEvent.press(screen.getAllByTestId('notification-item-unread')[0]);
    expect(postSpy).toHaveBeenCalledWith('/notifications/{notificationId}/read', { params: { path: { notificationId: item(1).id } } });
    expect(router.push).toHaveBeenCalledWith('/memories/m1');
    await waitFor(() => expect(screen.getByTestId('notifications-unread-count')).toHaveTextContent('2 уншаагүй'));
    expect(screen.getAllByTestId('notification-item-unread')).toHaveLength(2);

    await fireEvent.press(screen.getByTestId('notifications-read-all'));
    expect(postSpy).toHaveBeenCalledWith('/notifications/read-all');
    await waitFor(() => expect(screen.getByTestId('notifications-unread-count')).toHaveTextContent('0 уншаагүй'));
    expect(screen.queryAllByTestId('notification-item-unread')).toHaveLength(0);
    expect(screen.queryByTestId('topbar-unread')).toBeNull();
    expect(screen.getByTestId('notifications-read-all')).toBeDisabled();
  });

  it('уншсан мэдэгдлийг товшиход дахин POST хийхгүй; гадны холбоосыг нээхгүй', async () => {
    getSpy.mockImplementation((async () =>
      ok({ items: [item(4, '2026-11-06T10:00:00Z'), { ...item(5), deepLink: 'https://evil.example/x' }], nextCursor: null, unreadCount: 1 })) as never);
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('notification-item')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('notification-item'));
    expect(postSpy).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/memories/m4');

    await fireEvent.press(screen.getByTestId('notification-item-unread'));
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('хоосон бол S-24-ийн хоосон төлөв', async () => {
    getSpy.mockImplementation((async () => ok({ items: [], nextCursor: null, unreadCount: 0 })) as never);
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('state-empty-action')).toBeTruthy());
    expect(screen.getByText('Одоохондоо шинэ мэдэгдэл алга, бүх зүйл тайван байна.')).toBeTruthy();
  });

  it('алдаа бол «Дахин оролдох»', async () => {
    getSpy.mockImplementation((async () => ({
      data: undefined,
      error: { code: 'INTERNAL', message: 'x', traceId: 't' },
      response: new Response(null, { status: 500 }),
    })) as never);
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('state-error')).toBeTruthy());
    getSpy.mockImplementation((async () => ok({ items: [item(1)], nextCursor: null, unreadCount: 1 })) as never);
    await fireEvent.press(screen.getByTestId('state-retry'));
    await waitFor(() => expect(screen.getByTestId('notifications-unread-count')).toHaveTextContent('1 уншаагүй'));
  });
});
