import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { api } from '@/api/client';
import ThinkingSheet from '@/app/(tabs)/home/thinking';
import { clampThinking, THINKING_MAX } from '@/signals/sendSignal';
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

let postSpy: jest.SpyInstance;

function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <ThinkingSheet />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: 'u', signedOut: false });
  postSpy = jest.spyOn(api, 'POST').mockImplementation((async () => ({
    data: { id: 's-1', kind: 'THINKING' },
    error: undefined,
    response: new Response('{}', { status: 201 }),
  })) as never);
});

afterEach(() => postSpy.mockRestore());

describe('AC-77 S-26 «Чамайг бодож байна» ≤ 80 тэмдэгт', () => {
  it('AC-77 81 дэх тэмдэгт оролтод орохгүй; тоолуур 80/80', async () => {
    await renderSheet();
    await fireEvent.changeText(screen.getByTestId('thinking-input'), 'а'.repeat(81));
    expect(screen.getByTestId('thinking-input')).toHaveProp('value', 'а'.repeat(80));
    expect(screen.getByTestId('thinking-counter')).toHaveTextContent('80/80');
    expect(screen.getByTestId('thinking-input')).toHaveProp('maxLength', THINKING_MAX);
  });

  it('AC-77 80 тэмдэгт илгээгдэж ANIM-03 тоглоно', async () => {
    await renderSheet();
    const text = 'Ү'.repeat(80);
    await fireEvent.changeText(screen.getByTestId('thinking-input'), text);
    await fireEvent.press(screen.getByTestId('thinking-send'));
    await waitFor(() => expect(screen.getByTestId('thinking-sent')).toBeTruthy());
    expect(postSpy).toHaveBeenCalledWith('/signals', { body: { kind: 'THINKING', clientId: expect.any(String), text } });
    expect(screen.getByTestId('anim-ANIM-03')).toBeTruthy();
  });

  it('AC-77 нэг мөр — шинэ мөрийг зай болгоно, хуулж буулгасан урт текстийг таслана', () => {
    expect(clampThinking('Санаж\nбайна')).toBe('Санаж байна');
    expect(clampThinking('x'.repeat(200))).toHaveLength(80);
  });
});
