/**
 * FR-19.5, AC-28, AC-156: вэбэд outbox нь `online` үйл явдал дээр илгээгдэнэ (NetInfo-гийн вэб
 * хувилбар `navigator.connection`-ий өөрчлөлтийг л сонсдог тул `online` дээр заавал дуудагддаггүй).
 */
import { useSessionStore } from '@/stores/sessionStore';

import { outbox, startOutbox } from '../outboxRuntime';

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
    const flush = jest.spyOn(outbox, 'flush').mockResolvedValue(0);
    const stop = startOutbox();
    expect(flush).toHaveBeenCalledTimes(1); // нээгдэх үед
    target.dispatchEvent(new Event('online'));
    expect(flush).toHaveBeenCalledTimes(2);
    stop();
    target.dispatchEvent(new Event('online'));
    expect(flush).toHaveBeenCalledTimes(2);
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
