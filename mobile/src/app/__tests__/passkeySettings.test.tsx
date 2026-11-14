import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { PasskeySettings } from '@/app/settings/passkey';
import { LockScreen } from '@/components/lock/LockScreen';
import { useLockStore } from '@/lock/lockStore';
import * as passkey from '@/lock/passkey';

import { renderWithClient } from '../../../test/memoryFixtures';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) } }));
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => false),
  isEnrolledAsync: jest.fn(async () => false),
  authenticateAsync: jest.fn(async () => ({ success: false })),
}));
jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const spies: jest.SpyInstance[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  useLockStore.setState({ enabled: true, locked: false, passkeyId: null, failures: 0, lockedUntil: null, pinLength: 4 });
});
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

const supported = (value: boolean) => spies.push(jest.spyOn(passkey, 'passkeySupported').mockResolvedValue(value));

describe('S-102 passkey түгжээ (AC-157)', () => {
  it('PIN нөөцтэй, дэмждэг хөтөч — «Passkey тохируулах» → registerPasskey', async () => {
    supported(true);
    const register = jest.spyOn(passkey, 'registerPasskey').mockImplementation(async () => {
      useLockStore.getState().set({ passkeyId: 'cred-1' });
      return 'cred-1';
    });
    spies.push(register);
    await renderWithClient(<PasskeySettings web />);
    expect(screen.getByTestId('screen-S-102')).toBeTruthy();
    expect(screen.getByTestId('passkey-pin-row')).toHaveTextContent(/Тохируулсан/);
    await fireEvent.press(await screen.findByTestId('passkey-setup'));
    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(await screen.findByTestId('passkey-enabled')).toBeTruthy();
    expect(screen.getByTestId('passkey-notice')).toHaveTextContent(/тохируулагдлаа/);
  });

  it('authenticator-гүй орчин — passkey товчгүй, «PIN-ээр нээнэ»', async () => {
    supported(false);
    await renderWithClient(<PasskeySettings web />);
    expect(await screen.findByTestId('passkey-unsupported')).toHaveTextContent(/PIN/);
    expect(screen.queryByTestId('passkey-setup')).toBeNull();
  });

  it('PIN тохируулаагүй — эхлээд S-84-д PIN', async () => {
    supported(true);
    useLockStore.setState({ enabled: false });
    await renderWithClient(<PasskeySettings web />);
    await fireEvent.press(await screen.findByTestId('passkey-set-pin'));
    expect(router.push).toHaveBeenCalledWith('/settings/security');
    expect(screen.queryByTestId('passkey-setup')).toBeNull();
  });

  it('бүртгэл амжилтгүй — «Passkey бүртгэгдсэнгүй» ба «Дахин оролдох»', async () => {
    supported(true);
    spies.push(jest.spyOn(passkey, 'registerPasskey').mockRejectedValue(new DOMException('denied', 'NotAllowedError')));
    await renderWithClient(<PasskeySettings web />);
    await fireEvent.press(await screen.findByTestId('passkey-setup'));
    expect(await screen.findByTestId('passkey-error')).toHaveTextContent(/бүртгэгдсэнгүй/);
    expect(screen.getByTestId('passkey-retry')).toBeTruthy();
  });

  it('устгах — баталгаажуулаад removePasskey', async () => {
    supported(true);
    useLockStore.setState({ passkeyId: 'cred-1' });
    const remove = jest.spyOn(passkey, 'removePasskey').mockImplementation(async () => useLockStore.getState().set({ passkeyId: null }));
    spies.push(remove);
    await renderWithClient(<PasskeySettings web />);
    await fireEvent.press(await screen.findByTestId('passkey-remove'));
    await fireEvent.press(await screen.findByTestId('passkey-remove-confirm-confirm'));
    await waitFor(() => expect(remove).toHaveBeenCalled());
    expect(await screen.findByTestId('passkey-setup')).toBeTruthy();
  });

  it('native — Face ID / хурууны хээ S-84-д', async () => {
    await renderWithClient(<PasskeySettings web={false} />);
    expect(screen.getByTestId('passkey-native')).toBeTruthy();
  });
});

describe('S-14 passkey-ээр нээх (AC-157)', () => {
  it('дэлгэц гармагц passkey-г нэг удаа асууна; товчоор дахин; PIN гар үргэлж бий', async () => {
    useLockStore.setState({ locked: true });
    const onPasskey = jest.fn(async () => false);
    await renderWithClient(<LockScreen onPasskey={onPasskey} autoPrompt />);
    await waitFor(() => expect(onPasskey).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('lock-key-1')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('lock-biometric'));
    await waitFor(() => expect(onPasskey).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('lock-message')).toBeTruthy();
  });
});
