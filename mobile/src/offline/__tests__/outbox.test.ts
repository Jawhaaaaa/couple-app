import { httpSender, Outbox, type OutboxItem, type SendResult } from '../outbox';
import type { KeyValueStore } from '../storage';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    remove: async (k) => void data.delete(k),
  };
}

const textOf = (i: OutboxItem) => (i.body as { text: string }).text;

describe('AC-28 offline outbox — дарааллаар, давхардалгүй', () => {
  it('илгээх хооронд нэмсэн мессеж алдагдахгүй (offline retry ба online sent үед) — NFR-04', async () => {
    const delivered: string[] = [];
    let online = false;
    let box: Outbox;
    let injected = false;
    const send = async (item: OutboxItem): Promise<SendResult> => {
      // Эхний илгээлтийн дунд хэрэглэгч дахин мессеж бичнэ (enqueue + flush)
      if (!injected) {
        injected = true;
        await box.enqueue({ method: 'POST', path: '/messages', body: { text: 'хоёр' } });
        void box.flush();
      }
      if (!online) return 'retry';
      delivered.push(textOf(item));
      return 'sent';
    };
    box = new Outbox(memoryStore(), send);
    await box.enqueue({ method: 'POST', path: '/messages', body: { text: 'нэг' } });
    await box.flush();
    expect((await box.items()).map(textOf)).toEqual(['нэг', 'хоёр']);

    online = true;
    injected = false;
    await box.flush();
    // Илгээх үед нэмэгдсэн «хоёр» (давхар clientId-гүй шинэ) ба дараа нь нэмсэн нь бүгд хүрнэ
    expect(delivered).toEqual(['нэг', 'хоёр', 'хоёр']);
    expect(await box.items()).toEqual([]);
  });

  it('offline-д бичсэн 3 мессеж онлайн болоход яг 3, дарааллаар', async () => {
    const delivered: string[] = [];
    let online = false;
    const send = async (item: OutboxItem): Promise<SendResult> => {
      if (!online) return 'retry';
      delivered.push(textOf(item));
      return 'sent';
    };
    const box = new Outbox(memoryStore(), send);
    for (const text of ['нэг', 'хоёр', 'гурав']) {
      await box.enqueue({ method: 'POST', path: '/chat/messages', body: { kind: 'TEXT', text } });
    }
    expect(await box.flush()).toBe(0);
    expect(await box.items()).toHaveLength(3);
    online = true;
    // Зэрэг дуудсан flush-ууд нэг л удаа илгээнэ
    await Promise.all([box.flush(), box.flush(), box.flush()]);
    expect(delivered).toEqual(['нэг', 'хоёр', 'гурав']);
    expect(await box.items()).toEqual([]);
  });

  it('дунд нь сүлжээ тасарвал зогсож, үлдсэнийг дараалал алдагдуулахгүй хадгална', async () => {
    const delivered: string[] = [];
    let failOn = 'хоёр';
    const box = new Outbox(memoryStore(), async (item) => {
      if (textOf(item) === failOn) return 'retry';
      delivered.push(textOf(item));
      return 'sent';
    });
    for (const text of ['нэг', 'хоёр', 'гурав']) await box.enqueue({ method: 'POST', path: '/m', body: { text } });
    await box.flush();
    expect(delivered).toEqual(['нэг']);
    const pending = await box.items();
    expect(pending.map(textOf)).toEqual(['хоёр', 'гурав']);
    expect(pending[0].attempts).toBe(1);
    failOn = '';
    await box.flush();
    expect(delivered).toEqual(['нэг', 'хоёр', 'гурав']);
  });

  it('clientId (UUIDv7) биед орж, ижил clientId дахин нэмэгдэхгүй', async () => {
    const box = new Outbox(memoryStore(), async () => 'retry');
    const a = await box.enqueue({ method: 'POST', path: '/m', body: { text: 'x' } });
    expect(a.clientId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a.body).toMatchObject({ clientId: a.clientId, text: 'x' });
    await box.enqueue({ method: 'POST', path: '/m', body: { text: 'x' }, clientId: a.clientId });
    expect(await box.items()).toHaveLength(1);
  });

  it('сервер татгалзсан (4xx) зүйлийг тусад нь хадгалж дарааллыг гацаахгүй', async () => {
    const box = new Outbox(memoryStore(), async (item) => (textOf(item) === 'муу' ? 'rejected' : 'sent'));
    await box.enqueue({ method: 'POST', path: '/m', body: { text: 'муу' } });
    await box.enqueue({ method: 'POST', path: '/m', body: { text: 'сайн' } });
    expect(await box.flush()).toBe(1);
    expect(await box.items()).toEqual([]);
    expect((await box.rejected()).map(textOf)).toEqual(['муу']);
  });

  it('httpSender: 2xx/409 → sent, сүлжээ/5xx/401 → retry, 400 → rejected', async () => {
    const item: OutboxItem = { clientId: 'c', method: 'POST', path: '/m', body: {}, createdAt: '', attempts: 0 };
    const sender = (status: number | 'network') =>
      httpSender(
        'http://x',
        (async () => {
          if (status === 'network') throw new TypeError('Network request failed');
          return new Response('{}', { status });
        }) as unknown as typeof fetch,
        () => ({}),
      );
    expect(await sender(201)(item)).toBe('sent');
    expect(await sender(409)(item)).toBe('sent');
    expect(await sender('network')(item)).toBe('retry');
    expect(await sender(503)(item)).toBe('retry');
    expect(await sender(401)(item)).toBe('retry');
    expect(await sender(400)(item)).toBe('rejected');
  });
});
