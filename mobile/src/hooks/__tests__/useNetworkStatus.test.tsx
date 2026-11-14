/** S-95, AC-156: вэбэд хөтчийн `offline`/`online` үйл явдлаар offline төлөв шинэчлэгдэнэ. */
import { act, renderHook } from '@testing-library/react-native';

import { useNetworkStatus } from '../useNetworkStatus';

jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(() => jest.fn()) }));

describe('useNetworkStatus', () => {
  const target = new EventTarget();
  let online = true;
  const original = { window: (globalThis as { window?: unknown }).window };

  beforeAll(() => {
    (globalThis as { window?: unknown }).window = target;
    Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, get: () => online });
  });
  afterAll(() => {
    (globalThis as { window?: unknown }).window = original.window;
  });

  it('offline → true, online → false', async () => {
    const { result } = await renderHook(() => useNetworkStatus());
    expect(result.current.offline).toBe(false);
    online = false;
    await act(async () => void target.dispatchEvent(new Event('offline')));
    expect(result.current.offline).toBe(true);
    online = true;
    await act(async () => void target.dispatchEvent(new Event('online')));
    expect(result.current.offline).toBe(false);
  });
});
