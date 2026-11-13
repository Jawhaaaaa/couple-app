import { renderHook } from '@testing-library/react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { Platform } from 'react-native';

import { screenProtectionSupported, useScreenProtection } from '@/platform/screenProtection';

jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn(async () => {}),
  allowScreenCaptureAsync: jest.fn(async () => {}),
  addScreenshotListener: jest.fn(),
}));

const mocked = ScreenCapture as jest.Mocked<typeof ScreenCapture>;

function load(os: 'ios' | 'android' | 'web') {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  return { useScreenProtection, screenProtectionSupported };
}

const originalOS = Platform.OS;
afterEach(() => {
  Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  jest.clearAllMocks();
});

describe('FR-6.9 ScreenProtection', () => {
  it('Android: идэвхтэй үед FLAG_SECURE (preventScreenCapture), гарахад буцаана', async () => {
    const { useScreenProtection } = load('android');
    const { rerender, unmount } = await renderHook(({ active }: { active: boolean }) => useScreenProtection(active, jest.fn()), {
      initialProps: { active: false },
    });
    expect(mocked.preventScreenCaptureAsync).not.toHaveBeenCalled();
    await rerender({ active: true });
    expect(mocked.preventScreenCaptureAsync).toHaveBeenCalledWith('aura-disappearing-chat');
    await unmount();
    expect(mocked.allowScreenCaptureAsync).toHaveBeenCalledWith('aura-disappearing-chat');
  });

  it('iOS: дэлгэцийн зураг илэрвэл callback (илгээгчид мэдэгдэх)', async () => {
    const remove = jest.fn();
    let fire: () => void = () => {};
    mocked.addScreenshotListener.mockImplementation(((cb: () => void) => {
      fire = cb;
      return { remove };
    }) as never);
    const { useScreenProtection } = load('ios');
    const onShot = jest.fn();
    const { unmount } = await renderHook(() => useScreenProtection(true, onShot));
    fire();
    expect(onShot).toHaveBeenCalledTimes(1);
    expect(mocked.preventScreenCaptureAsync).not.toHaveBeenCalled();
    await unmount();
    expect(remove).toHaveBeenCalled();
  });

  it('GAP-12 вэб: хамгаалалт дэмжигдэхгүй, юу ч дуудахгүй', async () => {
    const { useScreenProtection, screenProtectionSupported } = load('web');
    expect(screenProtectionSupported()).toBe(false);
    await renderHook(() => useScreenProtection(true, jest.fn()));
    expect(mocked.preventScreenCaptureAsync).not.toHaveBeenCalled();
    expect(mocked.addScreenshotListener).not.toHaveBeenCalled();
  });
});
