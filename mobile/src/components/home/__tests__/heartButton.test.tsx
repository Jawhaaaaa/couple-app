import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { api } from '@/api/client';
import * as haptics from '@/motion/haptics';
import { outbox } from '@/offline/outboxRuntime';
import { type SignalTransport, sendSignal } from '@/signals/sendSignal';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { HeartButton } from '../HeartButton';

jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const created = () => ({
  data: { id: 's-1', kind: 'HEART' },
  error: undefined,
  response: new Response('{}', { status: 201 }),
});
const rateLimited = (retryAfterSeconds: number) => ({
  data: undefined,
  error: { code: 'RATE_LIMITED', message: 'x', traceId: 't', retryAfterSeconds },
  response: new Response('{}', { status: 429 }),
});

let postSpy: jest.SpyInstance;

function renderButton() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <HeartButton />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: 'u', signedOut: false });
  postSpy = jest.spyOn(api, 'POST').mockImplementation((async () => created()) as never);
});

afterEach(() => postSpy.mockRestore());

describe('HeartButton (FR-4)', () => {
  it('AC-17 товшилт → POST /signals {HEART, clientId}, ANIM-01, impactMedium ×2', async () => {
    const haptic = jest.spyOn(haptics, 'playHaptic');
    await renderButton();
    await fireEvent.press(screen.getByTestId('heart-button'));
    await waitFor(() => expect(screen.getByTestId('heart-sent')).toHaveTextContent('💗 Зүрх чинь очлоо'));
    const [path, init] = postSpy.mock.calls[0];
    expect(path).toBe('/signals');
    expect(init.body).toEqual({ kind: 'HEART', clientId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(haptic).toHaveBeenCalledWith('ANIM-01');
    expect(screen.getByTestId('anim-ANIM-01')).toBeTruthy();
  });

  it('AC-76 ≥ 0.6 с дарвал HUG — өөр haptic хээ ба анимаци', async () => {
    const hug = jest.spyOn(haptics, 'playHugHaptic');
    await renderButton();
    await fireEvent(screen.getByTestId('heart-button'), 'longPress');
    await waitFor(() => expect(screen.getByTestId('heart-sent')).toHaveTextContent('🤗 Тэврэлт чинь очлоо'));
    expect(postSpy.mock.calls[0][1].body).toMatchObject({ kind: 'HUG' });
    expect(hug).toHaveBeenCalled();
    expect(screen.getByTestId('anim-HUG')).toBeTruthy();
  });

  it('AC-19 429 RATE_LIMITED — алдааны мессеж биш, retryAfterSeconds хүртэл cooldown', async () => {
    jest.useFakeTimers();
    try {
      postSpy.mockImplementation((async () => rateLimited(3)) as never);
      await renderButton();
      await fireEvent.press(screen.getByTestId('heart-button'));
      await waitFor(() => expect(screen.getByTestId('heart-cooldown')).toHaveTextContent(/амарч байна… [1-3] секунд/));
      expect(screen.queryByTestId('heart-error')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByTestId('heart-button')).toBeDisabled();

      // Cooldown-ийн үед дахин дарахад илгээхгүй
      await fireEvent.press(screen.getByTestId('heart-button'));
      expect(postSpy).toHaveBeenCalledTimes(1);

      await act(async () => {
        jest.advanceTimersByTime(4000);
      });
      expect(screen.queryByTestId('heart-cooldown')).toBeNull();
      expect(screen.getByTestId('heart-button')).not.toBeDisabled();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('sendSignal — offline outbox (FR-6.4)', () => {
  const transport = (post: SignalTransport['post']) => {
    const enqueued: unknown[] = [];
    return { enqueued, t: { post, enqueue: async (b: unknown) => void enqueued.push(b) } as SignalTransport };
  };

  it('offline бол илгээхгүй, outbox-д хадгална', async () => {
    const post = jest.fn();
    const { enqueued, t } = transport(post);
    await expect(sendSignal({ kind: 'HEART' }, { offline: true }, t)).resolves.toEqual({ status: 'queued' });
    expect(post).not.toHaveBeenCalled();
    expect(enqueued).toEqual([{ kind: 'HEART', clientId: expect.any(String) }]);
  });

  it('сүлжээ тасарвал (fetch reject) outbox-д үлдээнэ', async () => {
    const { enqueued, t } = transport(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(sendSignal({ kind: 'THINKING', text: ' Санаж байна ' }, { offline: false }, t)).resolves.toEqual({ status: 'queued' });
    expect(enqueued).toEqual([{ kind: 'THINKING', clientId: expect.any(String), text: 'Санаж байна' }]);
  });

  it('Retry-After толгойг ч уншина', async () => {
    const { t } = transport(async () => ({ response: new Response('{}', { status: 429, headers: { 'Retry-After': '42' } }) }));
    await expect(sendSignal({ kind: 'HEART' }, { offline: false }, t)).resolves.toEqual({ status: 'cooldown', seconds: 42 });
  });

  it('анхдагч transport — outbox-д POST /signals clientId-тай', async () => {
    const spy = jest.spyOn(outbox, 'enqueue').mockResolvedValue({} as never);
    const flush = jest.spyOn(outbox, 'flush').mockResolvedValue(0);
    await sendSignal({ kind: 'HEART' }, { offline: true });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', path: '/signals', clientId: expect.any(String) }));
    expect(flush).toHaveBeenCalled();
    spy.mockRestore();
    flush.mockRestore();
  });
});
