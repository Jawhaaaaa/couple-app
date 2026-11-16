import { backoffDelay, RealtimeClient, type SocketLike } from '../stompClient';
import { encodeFrame, parseFrames } from '../stompFrame';

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {}
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.({});
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(frame: string) {
    this.onmessage?.({ data: frame });
  }
  frames() {
    return this.sent.flatMap((s) => parseFrames(s).frames);
  }
}

const flush = () => new Promise((r) => setImmediate(r));

describe('stompFrame', () => {
  it('толгойн escape ба олон фрейм, heartbeat-ийг задална', () => {
    const raw = `\n${encodeFrame('MESSAGE', { destination: '/user/queue/events', 'x:y': 'a\nb' }, '{"a":1}')}\n`;
    const { frames, rest } = parseFrames(raw + encodeFrame('RECEIPT', { 'receipt-id': '1' }).slice(0, 5));
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({ command: 'MESSAGE', headers: { destination: '/user/queue/events', 'x:y': 'a\nb' }, body: '{"a":1}' });
    expect(rest).toBe('RECEI');
  });
});

describe('RealtimeClient', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate'] }));
  afterEach(() => jest.useRealTimers());

  function setup(token: string | null = 'tok') {
    const sockets: FakeSocket[] = [];
    const events: unknown[] = [];
    const reconnects = jest.fn();
    const client = new RealtimeClient({
      url: 'ws://h/ws',
      getToken: () => token,
      onEvent: (e) => events.push(e),
      onReconnect: reconnects,
      socketFactory: (url, protocols) => {
        const s = new FakeSocket(url, protocols);
        sockets.push(s);
        return s;
      },
    });
    return { client, sockets, events, reconnects };
  }

  it('AC-31 CONNECT-д Bearer токен, зөвхөн /user/queue/events-д subscribe', async () => {
    const { client, sockets } = setup();
    client.start();
    await flush();
    sockets[0].open();
    const connect = sockets[0].frames()[0];
    expect(connect.command).toBe('CONNECT');
    expect(connect.headers.Authorization).toBe('Bearer tok');
    sockets[0].receive(encodeFrame('CONNECTED', { version: '1.2' }));
    const subs = sockets[0].frames().filter((f) => f.command === 'SUBSCRIBE');
    expect(subs.map((f) => f.headers.destination)).toEqual(['/user/queue/events']);
    expect(client.isConnected).toBe(true);
    client.stop();
  });

  it('envelope-ыг дамжуулж, гэрээнд үгүй төрлийг алгасна', async () => {
    const { client, sockets, events } = setup();
    client.start();
    await flush();
    sockets[0].open();
    sockets[0].receive(encodeFrame('CONNECTED'));
    const env = { id: '1', type: 'couple.linked', occurredAt: '2026-11-07T00:00:00Z', payload: { coupleId: 'c' } };
    sockets[0].receive(encodeFrame('MESSAGE', { destination: '/user/queue/events' }, JSON.stringify(env)));
    sockets[0].receive(encodeFrame('MESSAGE', {}, JSON.stringify({ ...env, type: 'unknown.type' })));
    sockets[0].receive(encodeFrame('MESSAGE', {}, 'not json'));
    expect(events).toEqual([env]);
    client.stop();
  });

  it('тасрахад 1 → 2 с backoff-оор дахин холбогдож, query шинэчлэх дохио өгнө', async () => {
    const { client, sockets, reconnects } = setup();
    client.start();
    await flush();
    sockets[0].open();
    sockets[0].receive(encodeFrame('CONNECTED'));
    sockets[0].close();
    expect(client.isConnected).toBe(false);
    jest.advanceTimersByTime(999);
    await flush();
    expect(sockets).toHaveLength(1);
    jest.advanceTimersByTime(1);
    await flush();
    expect(sockets).toHaveLength(2);
    sockets[1].open();
    sockets[1].receive(encodeFrame('CONNECTED'));
    expect(reconnects).toHaveBeenCalledTimes(1);
    client.stop();
  });

  it('токенгүй үед холбогдохгүй, дараа дахин оролдоно', async () => {
    const { client, sockets } = setup(null);
    client.start();
    await flush();
    expect(sockets).toHaveLength(0);
    client.stop();
  });

  it('backoff 30 с-ээс хэтрэхгүй', () => {
    expect([0, 1, 2, 3, 4, 5, 10].map(backoffDelay)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });
});
