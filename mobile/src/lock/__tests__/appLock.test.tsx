import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { api } from '@/api/client';
import { LockScreen, submitPin } from '@/components/lock/LockScreen';
import { LockSettings } from '@/components/lock/LockSettings';
import { AppLockProvider } from '@/lock/AppLockProvider';
import { registerFailure, RESET_ATTEMPTS, shouldLock, validPin, waitRemainingMs } from '@/lock/lockPolicy';
import { readPinSecret, writePinSecret } from '@/lock/lockSecret';
import { useLockStore } from '@/lock/lockStore';
import { pbkdf2Sha256, sha256, toHex, utf8 } from '@/lock/pbkdf2';
import { createPinSecret, verifyPin } from '@/lock/pinHash';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';
import { ThemeProvider } from '@/theme/ThemeProvider';

const mockSecure = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockSecure.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockSecure.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockSecure.delete(k)),
}));
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));
jest.mock('expo-screen-capture', () => ({
  enableAppSwitcherProtectionAsync: jest.fn(async () => {}),
  disableAppSwitcherProtectionAsync: jest.fn(async () => {}),
}));
jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const wrap = (node: React.ReactElement) => <ThemeProvider>{node}</ThemeProvider>;

beforeEach(() => {
  mockSecure.clear();
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: 'u', signedOut: false });
  useLockStore.setState({ enabled: false, timeoutSec: 60, biometric: false, pinLength: 4, locked: false, ...RESET_ATTEMPTS });
});

describe('DD-AURA-033 PBKDF2-SHA256', () => {
  it('SHA-256 ба PBKDF2 стандарт векторууд (RFC 7914 §11)', () => {
    expect(toHex(sha256(utf8('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(toHex(pbkdf2Sha256(utf8('passwd'), utf8('salt'), 1))).toBe('55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc');
  });

  it('PIN-ийг давстай hash хийж хадгалдаг, PIN өөрөө хадгалагдахгүй', () => {
    const secret = createPinSecret('2580', 50);
    expect(JSON.stringify(secret)).not.toContain('2580');
    expect(verifyPin('2580', secret)).toBe(true);
    expect(verifyPin('2581', secret)).toBe(false);
    expect(createPinSecret('2580', 50).hash).not.toBe(secret.hash);
  });
});

describe('AC-52 буруу оролдлого', () => {
  it('PIN 4–6 орон', () => {
    expect(validPin('123')).toBe(false);
    expect(validPin('1234')).toBe(true);
    expect(validPin('123456')).toBe(true);
    expect(validPin('12a4')).toBe(false);
  });

  it('5 буруу → 1 мин хүлээх; нийт 10 буруу → нууц үгээр нэвтрэх', () => {
    let state = RESET_ATTEMPTS;
    const now = 1_000_000;
    for (let i = 1; i <= 4; i += 1) {
      const r = registerFailure(state, now);
      state = r.state;
      expect(r.verdict.kind).toBe('retry');
    }
    const fifth = registerFailure(state, now);
    expect(fifth.verdict).toEqual({ kind: 'wait', until: now + 60_000 });
    expect(waitRemainingMs(fifth.state, now + 59_000)).toBe(1_000);
    expect(waitRemainingMs(fifth.state, now + 60_000)).toBe(0);
    state = fifth.state;
    for (let i = 6; i <= 9; i += 1) state = registerFailure(state, now + 61_000).state;
    expect(registerFailure(state, now + 61_000).verdict).toEqual({ kind: 'signOut' });
  });

  it('10 дахь буруу PIN — түгжээ арилж, сесс хаагдана (S-03)', async () => {
    await writePinSecret(createPinSecret('2580', 10));
    useLockStore.setState({ enabled: true, locked: true, failures: 9, lockedUntil: null });
    const signOut = jest.spyOn(api, 'signOut').mockResolvedValue(undefined as never);
    expect(await submitPin('0000', 5_000_000)).toBe('signedOut');
    expect(signOut).toHaveBeenCalled();
    expect(useLockStore.getState()).toMatchObject({ enabled: false, locked: false, failures: 0 });
    expect(await readPinSecret()).toBeNull();
    signOut.mockRestore();
  });

  it('1 минутын хүлээлтэд зөв PIN ч хүлээн авахгүй', async () => {
    await writePinSecret(createPinSecret('2580', 10));
    useLockStore.setState({ enabled: true, locked: true, failures: 5, lockedUntil: 2_000_000 });
    expect(await submitPin('2580', 1_990_000)).toBe('wait');
    expect(await submitPin('2580', 2_000_001)).toBe('ok');
    expect(useLockStore.getState()).toMatchObject({ locked: false, failures: 0 });
  });
});

describe('AC-124 хугацаа ба S-14', () => {
  it('түгжих эсэх: хүйтэн эхлэлд үргэлж; арын төлөвт хугацаанаас удаан бол', () => {
    expect(shouldLock({ enabled: false, timeoutSec: 0, backgroundAt: null, now: 0 })).toBe(false);
    expect(shouldLock({ enabled: true, timeoutSec: 60, backgroundAt: null, now: 0 })).toBe(true);
    expect(shouldLock({ enabled: true, timeoutSec: 60, backgroundAt: 0, now: 59_000 })).toBe(false);
    expect(shouldLock({ enabled: true, timeoutSec: 60, backgroundAt: 0, now: 61_000 })).toBe(true);
    expect(shouldLock({ enabled: true, timeoutSec: 0, backgroundAt: 0, now: 1 })).toBe(true);
  });

  it('арын төлөвт 61 с байгаад урд гарахад S-14; идэвхгүй үед агуулгыг бүрхэвч хаана', async () => {
    let listener: (s: string) => void = () => {};
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_t: string, fn: (s: string) => void) => {
      listener = fn;
      return { remove: jest.fn() };
    }) as never);
    useLockStore.setState({ enabled: true, timeoutSec: 60, locked: false });
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await render(wrap(<AppLockProvider>{null}</AppLockProvider>));
    await act(async () => listener('background'));
    expect(screen.getByTestId('lock-privacy-cover')).toBeTruthy();
    now.mockReturnValue(1_061_000);
    await act(async () => listener('active'));
    expect(screen.getByTestId('screen-S-14')).toBeTruthy();
    now.mockRestore();
    spy.mockRestore();
  });

  it('S-14 PIN гараар зөв PIN → тайлагдана', async () => {
    await writePinSecret(createPinSecret('2580', 10));
    useLockStore.setState({ enabled: true, locked: true });
    await render(wrap(<LockScreen />));
    for (const d of ['2', '5', '8', '0']) await fireEvent.press(screen.getByTestId(`lock-key-${d}`));
    await waitFor(() => expect(useLockStore.getState().locked).toBe(false));
  });
});

describe('S-84 түгжээ тохируулах', () => {
  it('PIN-ийг хоёр удаа оруулж тохируулна; таарахгүй бол дахин', async () => {
    await render(wrap(<LockSettings />));
    await fireEvent.press(screen.getByTestId('lock-enable'));
    await fireEvent.changeText(screen.getByTestId('lock-pin-input'), '2580');
    await fireEvent.press(screen.getByTestId('lock-pin-next'));
    await fireEvent.changeText(screen.getByTestId('lock-pin-input'), '2581');
    await fireEvent.press(screen.getByTestId('lock-pin-next'));
    await waitFor(() => expect(screen.getByText(/таарсангүй/)).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('lock-pin-input'), '2580');
    await fireEvent.press(screen.getByTestId('lock-pin-next'));
    await fireEvent.changeText(screen.getByTestId('lock-pin-input'), '2580');
    await fireEvent.press(screen.getByTestId('lock-pin-next'));
    await waitFor(() => expect(useLockStore.getState()).toMatchObject({ enabled: true, pinLength: 4 }));
    expect(verifyPin('2580', (await readPinSecret())!)).toBe(true);
    await fireEvent.press(await screen.findByTestId('lock-timeout-300'));
    expect(useLockStore.getState().timeoutSec).toBe(300);
  });
});
