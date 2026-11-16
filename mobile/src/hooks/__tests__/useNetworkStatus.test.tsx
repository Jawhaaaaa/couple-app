/** S-95, AC-156: вэбэд хөтчийн `offline`/`online` үйл явдлаар offline төлөв шинэчлэгдэнэ. */
import { act, renderHook } from '@testing-library/react-native';

import NetInfo from '@react-native-community/netinfo';

import { useNetworkStatus } from '../useNetworkStatus';

jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(() => jest.fn()), refresh: jest.fn(async () => ({})) }));

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

  it('AC-156 offline-д нээгдсэн апп: NetInfo offline хэвээр байсан ч `online` дээр NetInfo-г дахин уншуулна', async () => {
    let emit: (s: { isConnected: boolean | null; isInternetReachable?: boolean | null }) => void = () => undefined;
    (NetInfo.addEventListener as jest.Mock).mockImplementationOnce((fn) => {
      emit = fn;
      return jest.fn();
    });
    (NetInfo.refresh as jest.Mock).mockImplementationOnce(async () => {
      emit({ isConnected: true, isInternetReachable: null });
      return {};
    });
    online = false;
    const { result } = await renderHook(() => useNetworkStatus());
    await act(async () => emit({ isConnected: false, isInternetReachable: false }));
    expect(result.current.offline).toBe(true);
    online = true;
    await act(async () => void target.dispatchEvent(new Event('online')));
    expect(NetInfo.refresh).toHaveBeenCalled();
    expect(result.current.offline).toBe(false);
  });
});
