import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';

import { api } from '@/api/client';
import * as haptics from '@/motion/haptics';
import { routeEvent } from '@/realtime/eventRouter';
import { useSignalFx } from '@/signals/sendSignal';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { RECEIVE_MS, SignalReceiver } from '../SignalReceiver';

jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

let postSpy: jest.SpyInstance;
let client: QueryClient;

function signal(kind: 'HEART' | 'HUG' | 'THINKING', text: string | null = null) {
  return {
    id: `e-${kind}`,
    type: 'signal.received' as const,
    occurredAt: '2026-11-07T12:00:00Z',
    actorId: 'u-anu',
    payload: { signalId: `s-${kind}`, kind, text },
  };
}

async function renderReceiver() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(['dashboard'], { partner: { name: 'Ану' } });
  await render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <SignalReceiver />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  usePrefsStore.setState({ ...defaultPrefs, animation: 'REDUCED' });
  useSessionStore.setState({ accessToken: 'at', userId: 'u', signedOut: false });
  useSignalFx.setState({ liveAt: null });
  postSpy = jest.spyOn(api, 'POST').mockImplementation((async () => ({
    data: undefined,
    error: undefined,
    response: new Response(null, { status: 204 }),
  })) as never);
});

afterEach(() => postSpy.mockRestore());

describe('signal.received overlay', () => {
  it('AC-17 зүрх ирэхэд ANIM-02 (notificationSuccess), дараа нь POST /signals/seen', async () => {
    const haptic = jest.spyOn(haptics, 'playHaptic');
    await renderReceiver();
    await act(async () => routeEvent(signal('HEART'), client));
    expect(screen.getByTestId('signal-overlay-HEART')).toBeTruthy();
    expect(screen.getByTestId('anim-ANIM-02')).toBeTruthy();
    expect(screen.getByTestId('signal-overlay-text')).toHaveTextContent('Ану чамд зүрх илгээлээ');
    expect(haptic).toHaveBeenCalledWith('ANIM-02');
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/signals/seen'));
    expect(useSignalFx.getState().liveAt).not.toBeNull();
  });

  it('AC-76 тэврэлт — ANIM-02-оос өөр анимаци ба haptic хээ', async () => {
    const hug = jest.spyOn(haptics, 'playHugHaptic');
    await renderReceiver();
    await act(async () => routeEvent(signal('HUG'), client));
    expect(screen.getByTestId('signal-overlay-HUG')).toBeTruthy();
    expect(screen.getByTestId('anim-HUG-received')).toBeTruthy();
    expect(screen.queryByTestId('anim-ANIM-02')).toBeNull();
    expect(hug).toHaveBeenCalled();
  });

  it('AC-77 «Чамайг бодож байна» бичвэртэйгээ, ANIM-03', async () => {
    await renderReceiver();
    await act(async () => routeEvent(signal('THINKING', 'Өглөөний кофе чамгүй амтгүй'), client));
    expect(screen.getByTestId('anim-ANIM-03')).toBeTruthy();
    expect(screen.getByTestId('signal-overlay-quote')).toHaveTextContent('«Өглөөний кофе чамгүй амтгүй»');
  });

  it('ANIM-02 ≈ 1.6 с-ийн дараа өөрөө алга болно', async () => {
    jest.useFakeTimers();
    try {
      await renderReceiver();
      await act(async () => routeEvent(signal('HEART'), client));
      expect(screen.getByTestId('signal-overlay-HEART')).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(RECEIVE_MS.HEART + 50);
      });
      expect(screen.queryByTestId('signal-overlay-HEART')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
