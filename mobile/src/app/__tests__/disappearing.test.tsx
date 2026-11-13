import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { api } from '@/api/client';
import DisappearingSheet from '@/app/(tabs)/chat/disappearing';
import { disappearOptionKey, remainingSeconds, useChatPrefsStore } from '@/chat/disappearing';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';
import { ThemeProvider } from '@/theme/ThemeProvider';

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

let putSpy: jest.SpyInstance;

function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <DisappearingSheet />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: 'u', signedOut: false });
  useChatPrefsStore.setState({ disappearSeconds: 0 });
  putSpy = jest.spyOn(api, 'PUT').mockImplementation((async (_path: string, init: { body: { disappearSeconds: number } }) => ({
    data: { disappearSeconds: init.body.disappearSeconds },
    error: undefined,
    response: new Response('{}', { status: 200 }),
  })) as never);
});

afterEach(() => putSpy.mockRestore());

describe('AC-92 S-46 алга болдог мессеж', () => {
  it('AC-92 Унтраах / 1 мин / 1 цаг / 1 өдөр; «1 цаг» сонгоход PUT /chat/settings 3600, сонголт хадгалагдана', async () => {
    await renderSheet();
    for (const v of [0, 60, 3600, 86400]) expect(screen.getByTestId(`disappear-${v}`)).toBeTruthy();
    expect(screen.getByTestId('disappear-0')).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));

    await fireEvent.press(screen.getByTestId('disappear-3600'));
    await waitFor(() => expect(screen.getByTestId('disappear-saved')).toBeTruthy());
    expect(putSpy).toHaveBeenCalledWith('/chat/settings', { body: { disappearSeconds: 3600 } });
    expect(useChatPrefsStore.getState().disappearSeconds).toBe(3600);
    expect(screen.getByTestId('disappear-3600')).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
  });

  it('AC-92 сервер татгалзвал алдаа харуулж, хуучин сонголт хэвээр', async () => {
    putSpy.mockImplementation((async () => ({
      data: undefined,
      error: { code: 'VALIDATION_FAILED', message: 'x' },
      response: new Response('{}', { status: 400 }),
    })) as never);
    await renderSheet();
    await fireEvent.press(screen.getByTestId('disappear-60'));
    await waitFor(() => expect(screen.getByTestId('disappear-error')).toBeTruthy());
    expect(useChatPrefsStore.getState().disappearSeconds).toBe(0);
  });

  it('GAP-12 native дээр хамгаалалтын тайлбар (Android хориг, iPhone мэдэгдэл)', async () => {
    await renderSheet();
    expect(screen.getByTestId('disappear-protection')).toHaveTextContent(/Android/);
  });
});

describe('AC-92 үлдсэн хугацаа', () => {
  it('уншаагүй бол тоолуургүй, уншсаны дараа секундээр', () => {
    expect(remainingSeconds(null, 0)).toBeNull();
    const now = Date.parse('2026-11-07T04:00:00Z');
    expect(remainingSeconds('2026-11-07T04:01:00Z', now)).toBe(60);
    expect(remainingSeconds('2026-11-07T03:59:00Z', now)).toBe(0);
    expect(disappearOptionKey(86400)).toBe('day');
    expect(disappearOptionKey(0)).toBe('off');
  });
});
