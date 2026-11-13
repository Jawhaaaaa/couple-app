import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import { api } from '@/api/client';
import type { Message } from '@/api/queries/chat';
import ChatScreen from '@/app/(tabs)/chat';
import ChatMediaScreen from '@/app/(tabs)/chat/media';
import PinsScreen from '@/app/(tabs)/chat/pins';
import ChatSearchScreen from '@/app/(tabs)/chat/search';
import { outbox } from '@/offline/outboxRuntime';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { ME, ok, PARTNER, renderWithClient } from '../../../test/memoryFixtures';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (fn: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(() => fn(), [fn]);
  },
}));

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn(async () => {}),
  allowScreenCaptureAsync: jest.fn(async () => {}),
  addScreenshotListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  setAudioModeAsync: jest.fn(async () => {}),
  useAudioRecorder: () => ({ isRecording: false, uri: null, getStatus: () => ({ durationMillis: 0 }) }),
  useAudioRecorderState: () => ({ durationMillis: 0 }),
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0, didJustFinish: false }),
}));
jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

function msg(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    clientMessageId: `c-${id}`,
    sender: ME,
    kind: 'TEXT',
    text: `текст ${id}`,
    status: 'SENT',
    deleted: false,
    reactions: [],
    createdAt: '2026-11-07T04:00:00Z',
    ...overrides,
  } as Message;
}

const spies: jest.SpyInstance[] = [];
let pinned: Message[];

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: ME.id, signedOut: false });
  pinned = [msg('p1', { sender: PARTNER, text: 'Шүдний эмчид 15:00', pinnedAt: '2026-11-07T05:00:00Z' })];
  spies.push(
    jest.spyOn(api, 'GET').mockImplementation((async (path: string, init?: { params?: { query?: Record<string, unknown> } }) => {
      const query = init?.params?.query ?? {};
      if (path === '/messages/pinned') return ok(pinned);
      if (path === '/messages/search')
        return ok({ items: [{ message: msg('s1', { sender: PARTNER, text: 'Тэрэлж явах уу?' }), highlights: [[0, 6]] }], nextCursor: null });
      if (path === '/messages/media')
        return ok({
          items:
            query.kind === 'FILE'
              ? [msg('f1', { kind: 'FILE', text: null, media: { id: 'mf', kind: 'FILE', status: 'READY', mime: 'application/pdf', sizeBytes: 204800, fileName: 'тасалбар.pdf', urls: { original: 'https://f' }, urlsExpireAt: 'x' } as never })]
              : [],
          hasMoreBefore: false,
          hasMoreAfter: false,
          nextCursor: null,
        });
      if (path === '/messages' && query.around)
        return ok({ items: [msg('h0', { text: 'өмнөх' }), msg('s1', { sender: PARTNER, text: 'Тэрэлж явах уу?' }), msg('h2', { text: 'дараах' })], hasMoreBefore: true, hasMoreAfter: true });
      if (path === '/messages')
        return ok({ items: [msg('m1', { text: 'Сайн уу', status: 'READ' }), msg('loc', { sender: PARTNER, kind: 'LOCATION', text: null, location: { name: 'Тэрэлж', lat: 47.98, lon: 107.45 } })], hasMoreBefore: false, hasMoreAfter: false });
      if (path === '/couple') return ok({ partner: { displayName: 'Ану', callName: null }, myView: { partnerNickname: null } });
      if (path === '/promises/current') return ok(undefined, 204);
      return ok({});
    }) as never),
    jest.spyOn(api, 'PUT').mockImplementation((async () => ok(undefined, 204)) as never),
    jest.spyOn(api, 'DELETE').mockImplementation((async () => ok(undefined, 204)) as never),
    jest.spyOn(api, 'POST').mockImplementation((async () => ok(undefined, 204)) as never),
    jest.spyOn(outbox, 'flush').mockResolvedValue(0),
    jest.spyOn(outbox, 'enqueue').mockResolvedValue({} as never),
  );
});

afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

describe('S-41 мессежийн цэс', () => {
  it('AC-90 pin хийх → PUT /messages/{id}/pin; толгойд pin-ийн мөр → S-42', async () => {
    await renderWithClient(<ChatScreen />);
    await screen.findByText('Сайн уу');
    expect(await screen.findByTestId('chat-pinned-banner')).toHaveTextContent(/Шүдний эмчид/);
    await fireEvent(screen.getByTestId('message-c-m1'), 'longPress');
    await fireEvent.press(screen.getByTestId('message-action-pin'));
    await waitFor(() => expect(api.PUT).toHaveBeenCalledWith('/messages/{messageId}/pin', { params: { path: { messageId: 'm1' } } }));
    await fireEvent.press(screen.getByTestId('chat-pinned-banner'));
    expect(router.push).toHaveBeenCalledWith('/chat/pins');
  });

  it('AC-91 «Дурсамж болгох» → S-32 мессежийн байршил, огноотой ноорог; AC-87 байршлыг газрын зурагт нээх үйлдэл', async () => {
    await renderWithClient(<ChatScreen />);
    await screen.findByTestId('message-c-loc');
    await fireEvent(screen.getByTestId('message-c-loc'), 'longPress');
    expect(screen.getByTestId('message-action-map')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('message-action-memory'));
    const call = (router.push as jest.Mock).mock.calls.find((c) => c[0]?.pathname === '/memory-editor');
    expect(JSON.parse(call[0].params.draft)).toMatchObject({ occurredOn: '2026-11-07', place: { name: 'Тэрэлж', lat: 47.98 } });
  });

  it('AC-89 хайлтаас ирсэн `around` — контекст хуудас, тухайн мессеж тодорч, «Сүүлийн мессеж рүү буцах»', async () => {
    mockParams = { around: 's1' };
    await renderWithClient(<ChatScreen />);
    expect(await screen.findByText('дараах')).toBeTruthy();
    expect(api.GET).toHaveBeenCalledWith('/messages', { params: { query: { limit: 40, around: 's1' } } });
    await fireEvent.press(screen.getByTestId('chat-back-to-latest'));
    expect(router.replace).toHaveBeenCalledWith('/chat');
  });
});

describe('S-42, S-43, S-44', () => {
  it('AC-90 S-42 бүх pin; хамтрагчийн pin-ийг ч хасна (DELETE)', async () => {
    await renderWithClient(<PinsScreen />);
    expect(await screen.findByText('Шүдний эмчид 15:00')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('unpin-p1'));
    await waitFor(() => expect(api.DELETE).toHaveBeenCalledWith('/messages/{messageId}/pin', { params: { path: { messageId: 'p1' } } }));
  });

  it('AC-89 S-43 тодруулгатай үр дүн, товшвол контекст рүү; огноо руу үсрэх', async () => {
    await renderWithClient(<ChatSearchScreen />);
    await fireEvent.changeText(screen.getByTestId('chat-search-input'), 'Тэрэлж');
    const result = await screen.findByTestId('search-result-s1', {}, { timeout: 3000 });
    expect(within(result).getByTestId('search-highlight')).toHaveTextContent('Тэрэлж');
    await fireEvent.press(result);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/chat', params: { around: 's1' } });
    await fireEvent.changeText(screen.getByTestId('chat-jump-input'), '2026-11-07');
    await fireEvent.press(screen.getByTestId('chat-jump'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/chat', params: { date: '2026-11-07' } });
  });

  it('S-44 табаар: зураг хоосон бол хоосон төлөв, «Файл» табд нэр ба хэмжээ', async () => {
    await renderWithClient(<ChatMediaScreen />);
    expect(await screen.findByTestId('screen-S-44')).toBeTruthy();
    await fireEvent.press(screen.getByText('Файл'));
    expect(await screen.findByText('тасалбар.pdf')).toBeTruthy();
    expect(screen.getByText(/200 KB/)).toBeTruthy();
  });
});
