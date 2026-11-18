/**
 * FR-19.5, AC-28, AC-156: вэбэд outbox нь `online` үйл явдал дээр илгээгдэнэ (NetInfo-гийн вэб
 * хувилбар `navigator.connection`-ий өөрчлөлтийг л сонсдог тул `online` дээр заавал дуудагддаггүй).
 */
import { api } from '@/api/client';
import { useSessionStore } from '@/stores/sessionStore';

import { outbox, startOutbox } from '../outboxRuntime';
import { queryClient } from '../persist';

jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(() => jest.fn()) }));

describe('startOutbox', () => {
  const target = new EventTarget();
  const original = (globalThis as { window?: unknown }).window;

  beforeAll(() => {
    (globalThis as { window?: unknown }).window = target;
  });
  afterAll(() => {
    (globalThis as { window?: unknown }).window = original;
  });

  it('`online` үйл явдал outbox-ыг илгээнэ; цэвэрлэсний дараа сонсохгүй', () => {
    useSessionStore.setState({ accessToken: 't0' });
    const flush = jest.spyOn(outbox, 'flush').mockResolvedValue(0);
    const stop = startOutbox();
    expect(flush).toHaveBeenCalledTimes(1); // нээгдэх үед
    target.dispatchEvent(new Event('online'));
    expect(flush).toHaveBeenCalledTimes(2);
    stop();
    target.dispatchEvent(new Event('online'));
    expect(flush).toHaveBeenCalledTimes(2);
    useSessionStore.setState({ accessToken: null });
  });

  it('AC-156 offline-д нээгдсэн апп (S-01 `unreachable`): `online` дээр сесс сэргээж (холболт бэлэн болтол давтан), илгээгээд кэшийг шинэчилнэ', async () => {
    const flush = jest.spyOn(outbox, 'flush').mockResolvedValue(0);
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const restore = jest.spyOn(api, 'restoreSession');
    const settle = () => new Promise((r) => setTimeout(r, 20));
    useSessionStore.setState({ accessToken: null });
    const stop = startOutbox({ retryMs: 1 });
    flush.mockClear();

    // Энгийн эхлэл (S-01 offline биш) — `online` дээр сесс сэргээх оролдлого хийхгүй
    queryClient.setQueryData(['session-restore'], 'none');
    target.dispatchEvent(new Event('online'));
    await settle();
    expect(restore).not.toHaveBeenCalled();

    // Offline-д нээгдсэн: эхний оролдлого холболт бэлэн биш (`unreachable`), дараагийнх нь амжилттай
    queryClient.setQueryData(['session-restore'], 'unreachable');
    restore.mockResolvedValueOnce('unreachable').mockResolvedValueOnce('restored');
    target.dispatchEvent(new Event('online'));
    target.dispatchEvent(new Event('online')); // давхар үйл явдал — нэг л сэргээлт
    await settle();
    expect(restore).toHaveBeenCalledTimes(2);
    expect(flush).toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(['session-restore'])).toBe('restored');

    // Token-той үед — шууд илгээнэ, сэргээхгүй
    useSessionStore.setState({ accessToken: 't1' });
    target.dispatchEvent(new Event('online'));
    expect(restore).toHaveBeenCalledTimes(2);
    stop();
    useSessionStore.setState({ accessToken: null });
    queryClient.removeQueries({ queryKey: ['session-restore'] });
    restore.mockRestore();
    invalidate.mockRestore();
  });

  it('access token ирэхэд (апп нээгдэх үеийн refresh) outbox-ыг илгээнэ', () => {
    const flush = jest.spyOn(outbox, 'flush').mockResolvedValue(0);
    flush.mockClear();
    useSessionStore.setState({ accessToken: null });
    const stop = startOutbox();
    flush.mockClear();
    useSessionStore.setState({ accessToken: 't1' });
    expect(flush).toHaveBeenCalledTimes(1);
    useSessionStore.setState({ accessToken: 't2' });
    expect(flush).toHaveBeenCalledTimes(1);
    stop();
  });
});
