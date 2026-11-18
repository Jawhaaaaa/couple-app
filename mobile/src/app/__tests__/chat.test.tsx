import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import { api } from '@/api/client';
import type { Message } from '@/api/queries/chat';
import ChatScreen from '@/app/(tabs)/chat';
import { outbox } from '@/offline/outboxRuntime';
import { uploadQueue } from '@/upload/uploadRuntime';
import { routeEvent } from '@/realtime/eventRouter';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { ME, ok, PARTNER, renderWithClient } from '../../../test/memoryFixtures';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (fn: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(() => fn(), [fn]);
  },
}));

jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn(async () => {}),
  allowScreenCaptureAsync: jest.fn(async () => {}),
  addScreenshotListener: jest.fn(() => ({ remove: jest.fn() })),
}));

const mockRecorder = {
  isRecording: false,
  uri: 'file:///voice.m4a' as string | null,
  prepareToRecordAsync: jest.fn(async () => {}),
  record: jest.fn(() => {
    mockRecorder.isRecording = true;
  }),
  stop: jest.fn(async () => {
    mockRecorder.isRecording = false;
  }),
  getStatus: jest.fn(() => ({ durationMillis: 4200 })),
};
jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  setAudioModeAsync: jest.fn(async () => {}),
  useAudioRecorder: () => mockRecorder,
  useAudioRecorderState: () => ({ durationMillis: 4200, metering: -20, isRecording: mockRecorder.isRecording }),
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0, didJustFinish: false }),
}));

jest.mock('@/upload/simpleUpload', () => ({
  ...jest.requireActual('@/upload/simpleUpload'),
  blobFromUri: jest.fn(async () => ({ size: 2048 })),
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

let messages: Message[];
const spies: jest.SpyInstance[] = [];
let enqueue: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: ME.id, signedOut: false });
  messages = [
    msg('m1', { text: 'Сайн уу, хайраа', status: 'READ' }),
    msg('p1', { sender: PARTNER, text: 'Тэрэлж явах уу?', status: 'DELIVERED' }),
    msg('m2', { text: 'Тэгье!', editedAt: '2026-11-07T04:05:00Z', replyTo: { id: 'p1', senderId: PARTNER.id, kind: 'TEXT', text: 'Тэрэлж явах уу?', deleted: false } }),
    msg('p2', { sender: PARTNER, text: null, deleted: true }),
  ];
  spies.push(
    jest.spyOn(api, 'GET').mockImplementation((async (path: string) => {
      if (path === '/messages') return ok({ items: messages, hasMoreBefore: false, hasMoreAfter: false });
      if (path === '/couple') return ok({ partner: { displayName: 'Ану', callName: null }, myView: { partnerNickname: null } });
      if (path === '/promises/current') return ok(undefined, 204);
      return ok({});
    }) as never),
    jest.spyOn(api, 'POST').mockImplementation((async () => ok(undefined, 204)) as never),
    jest.spyOn(api, 'PATCH').mockImplementation((async (_p: string, init: { body: { text: string } }) => ok(msg('m2', { text: init.body.text }))) as never),
    jest.spyOn(api, 'DELETE').mockImplementation((async () => ok(undefined, 204)) as never),
    jest.spyOn(outbox, 'flush').mockResolvedValue(0),
  );
  enqueue = jest.spyOn(outbox, 'enqueue').mockResolvedValue({} as never);
  spies.push(enqueue);
});

afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

describe('S-40 чат', () => {
  it('AC-176 AC-88 мессеж, төлөв, «засварласан», ишлэл, «Мессеж устгагдсан»; хамтрагчийн мессежийг уншсан болгоно (AC-29)', async () => {
    await renderWithClient(<ChatScreen />);
    expect(await screen.findByText('Сайн уу, хайраа')).toBeTruthy();
    const m1 = screen.getByTestId('message-c-m1');
    expect(within(m1).getByTestId('message-status')).toHaveProp('accessibilityValue', { text: 'READ' });
    const m2 = screen.getByTestId('message-c-m2');
    expect(within(m2).getByTestId('message-edited')).toBeTruthy();
    expect(within(m2).getByTestId('message-quote')).toHaveTextContent(/Тэрэлж явах уу/);
    expect(within(screen.getByTestId('message-c-p2')).getByTestId('message-deleted')).toBeTruthy();
    await waitFor(() => expect(api.POST).toHaveBeenCalledWith('/messages/read', { body: { upToMessageId: 'p2' } }));
  });

  it('AC-28 текст outbox-оор clientMessageId-тай явж, илгээгдэх хүртэл «илгээгдэж байна»', async () => {
    let pendingItems: unknown[] = [];
    spies.push(jest.spyOn(outbox, 'items').mockImplementation(async () => pendingItems as never));
    let notify: (items: never[]) => void = () => {};
    spies.push(jest.spyOn(outbox, 'subscribe').mockImplementation(((fn: (items: never[]) => void) => {
      notify = fn;
      return () => {};
    }) as never));
    await renderWithClient(<ChatScreen />);
    await screen.findByText('Сайн уу, хайраа');
    await fireEvent.changeText(screen.getByTestId('composer-input'), '  Би ирлээ  ');
    await fireEvent.press(screen.getByTestId('composer-send'));
    await waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
    const call = enqueue.mock.calls[0][0];
    expect(call).toMatchObject({ method: 'POST', path: '/messages', body: { kind: 'TEXT', text: 'Би ирлээ' } });
    expect(call.body.clientMessageId).toBe(call.clientId);
    pendingItems = [{ clientId: call.clientId, method: 'POST', path: '/messages', body: call.body, createdAt: '2026-11-07T04:10:00Z', attempts: 0 }];
    await act(async () => notify(pendingItems as never[]));
    const bubble = await screen.findByTestId(`message-${call.clientId}`);
    expect(within(bubble).getByTestId('message-status')).toHaveProp('accessibilityValue', { text: 'SENDING' });
  });

  it('AC-88 reply: удаан дарж «Хариулах» → replyToId-тай илгээнэ; засвар PATCH', async () => {
    await renderWithClient(<ChatScreen />);
    await screen.findByTestId('message-c-p1');
    await fireEvent(screen.getByTestId('message-c-p1'), 'longPress');
    await fireEvent.press(screen.getByTestId('message-action-reply'));
    expect(screen.getByTestId('composer-reply')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('composer-input'), 'Тийм ээ');
    await fireEvent.press(screen.getByTestId('composer-send'));
    await waitFor(() => expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ replyToId: 'p1', text: 'Тийм ээ' }) })));

    await fireEvent(screen.getByTestId('message-c-m1'), 'longPress');
    expect(screen.queryByTestId('message-action-delete')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('message-action-edit'));
    expect(screen.getByTestId('composer-input')).toHaveProp('value', 'Сайн уу, хайраа');
    await fireEvent.changeText(screen.getByTestId('composer-input'), 'Сайн уу, хайр минь');
    await fireEvent.press(screen.getByTestId('composer-send'));
    await waitFor(() =>
      expect(api.PATCH).toHaveBeenCalledWith('/messages/{messageId}', { params: { path: { messageId: 'm1' } }, body: { text: 'Сайн уу, хайр минь' } }),
    );
  });

  it('INV-03 хамтрагчийн мессежид засах/устгах үйлдэл байхгүй; ANIM-07 реакц PUT', async () => {
    spies.push(jest.spyOn(api, 'PUT').mockImplementation((async () => ok([])) as never));
    await renderWithClient(<ChatScreen />);
    await screen.findByTestId('message-c-p1');
    await fireEvent(screen.getByTestId('message-c-p1'), 'longPress');
    expect(screen.queryByTestId('message-action-edit')).toBeNull();
    expect(screen.queryByTestId('message-action-delete')).toBeNull();
    await fireEvent.press(screen.getByTestId('message-react-HUG'));
    await waitFor(() =>
      expect(api.PUT).toHaveBeenCalledWith('/messages/{messageId}/reaction', { params: { path: { messageId: 'p1' } }, body: { emoji: 'HUG' } }),
    );
  });

  it('AC-177 ANIM-08 хамтрагч бичиж байхад зүрхэн долгион; мессеж ирэхэд алга', async () => {
    const { client } = await renderWithClient(<ChatScreen />);
    await screen.findByText('Сайн уу, хайраа');
    await act(async () => routeEvent({ id: 'e1', type: 'chat.typing', occurredAt: 'x', payload: { typing: true } } as never, client));
    expect(await screen.findByTestId('chat-typing')).toBeTruthy();
    const created = msg('p3', { sender: PARTNER, text: 'Шинэ мессеж' });
    messages = [...messages, created];
    await act(async () => routeEvent({ id: 'e2', type: 'chat.message.created', occurredAt: 'x', payload: created } as never, client));
    expect(await screen.findByText('Шинэ мессеж')).toBeTruthy();
    expect(screen.queryByTestId('chat-typing')).toBeNull();
  });

  it('AC-178 «Хайртай» товч POST /signals HEART (FR-4.1-тэй ижил)', async () => {
    await renderWithClient(<ChatScreen />);
    await screen.findByText('Сайн уу, хайраа');
    await fireEvent.press(screen.getByTestId('composer-heart'));
    await waitFor(() => expect(api.POST).toHaveBeenCalledWith('/signals', { body: expect.objectContaining({ kind: 'HEART' }) }));
  });

  it('AC-32 S-45 дуу бичиж (түгжсэн горим) илгээхэд VOICE upload → VOICE мессеж', async () => {
    const upload = jest.spyOn(uploadQueue, 'upload').mockResolvedValue({ id: 'media-v1' } as never);
    spies.push(upload);
    await renderWithClient(<ChatScreen />);
    await screen.findByText('Сайн уу, хайраа');
    await fireEvent(screen.getByTestId('composer-voice'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(await screen.findByTestId('screen-S-45')).toBeTruthy();
    expect(mockRecorder.record).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('voice-send'));
    await waitFor(() =>
      expect(upload).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'VOICE', mime: 'audio/mp4', durationMs: 4200, uri: 'file:///voice.m4a' })),
    );
    await waitFor(() => expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ kind: 'VOICE', mediaId: 'media-v1' }) })));
    expect(screen.queryByTestId('screen-S-45')).toBeNull();
  });

  it('S-45 цуцалбал upload хийхгүй', async () => {
    const upload = jest.spyOn(uploadQueue, 'upload').mockResolvedValue({ id: 'x' } as never);
    spies.push(upload);
    await renderWithClient(<ChatScreen />);
    await screen.findByText('Сайн уу, хайраа');
    await fireEvent(screen.getByTestId('composer-voice'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    await fireEvent.press(await screen.findByTestId('voice-cancel'));
    expect(upload).not.toHaveBeenCalled();
    expect(screen.queryByTestId('screen-S-45')).toBeNull();
  });
});
