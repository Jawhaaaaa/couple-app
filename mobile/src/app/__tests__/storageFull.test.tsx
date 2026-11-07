import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { api } from '@/api/client';
import { formatGigabytes } from '@/api/queries/storage';
import StorageFullSheet from '@/app/storage-full';
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

const GIB = 1024 ** 3;
let getSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: 'u', signedOut: false });
  getSpy = jest.spyOn(api, 'GET').mockImplementation((async () => {
    const data = { usedBytes: 10 * GIB, quotaBytes: 10 * GIB, ratio: 1, warning: true };
    return { data, error: undefined, response: new Response(JSON.stringify(data), { status: 200 }) };
  }) as never);
});

afterEach(() => getSpy.mockRestore());

describe('AC-200 S-98 хадгалах сан дүүрсэн', () => {
  it('GB-аар: «3,2» (mn) / «3.2» (en), бүхэл бол бутархайгүй', () => {
    expect(formatGigabytes(3.2 * GIB, 'mn')).toBe('3,2');
    expect(formatGigabytes(3.2 * GIB, 'en')).toBe('3.2');
    expect(formatGigabytes(10 * GIB, 'mn')).toBe('10');
  });

  it('AC-200 «10 / 10 GB» хэрэглээний мөр, хогийн сав руу ба хаах', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await render(
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <StorageFullSheet />
        </ThemeProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('storage-usage-text')).toHaveTextContent('10 / 10 GB'));
    expect(screen.getByTestId('storage-usage-bar')).toHaveProp('accessibilityValue', { min: 0, max: 100, now: 100 });
    expect(getSpy).toHaveBeenCalledWith('/storage/usage');
    await fireEvent.press(screen.getByTestId('storage-trash'));
    expect(router.push).toHaveBeenCalledWith('/memories/trash');
    await fireEvent.press(screen.getByTestId('storage-close'));
    expect(router.back).toHaveBeenCalled();
  });
});
