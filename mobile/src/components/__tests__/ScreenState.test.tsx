import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { emptyStateText } from '@/content/emptyStates';
import { layoutFor } from '@/hooks/useWideLayout';
import { isOfflineState } from '@/hooks/useNetworkStatus';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { OfflineBanner } from '../OfflineBanner';
import { ScreenState } from '../ScreenState';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

beforeEach(() => usePrefsStore.setState({ ...defaultPrefs }));

describe('AC-213 ScreenState-ийн төлөвүүд', () => {
  it('ачаалж буй: skeleton, 1 с-ээс урт бол маскот (ANIM-16)', async () => {
    await wrap(<ScreenState kind="loading" slowAfterMs={50} />);
    expect(screen.getByTestId('skeleton')).toBeTruthy();
    expect(screen.getByTestId('anim-ANIM-16')).toBeTruthy();
    expect(screen.queryByTestId('state-loading-slow')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('state-loading-slow')).toBeTruthy());
    expect(screen.getByText('Бөмбөлөг ба Бөмбий хүлээж байна…')).toBeTruthy();
  });

  it('хоосон: маскот + 1 өгүүлбэр + нэг товч (ANIM-11)', async () => {
    const onAction = jest.fn();
    const empty = emptyStateText('S-30', 'mn');
    await wrap(<ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={onAction} />);
    expect(screen.getByTestId('anim-ANIM-11')).toBeTruthy();
    expect(screen.getByTestId('mascot-bombolog')).toBeTruthy();
    expect(screen.getByText(empty.text)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('state-empty-action')));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('алдаа: юу болсон + «Дахин оролдох»', async () => {
    const onRetry = jest.fn();
    await wrap(<ScreenState kind="error" onRetry={onRetry} />);
    expect(screen.getByText('Ачаалж чадсангүй')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Дахин оролдох')));
    expect(onRetry).toHaveBeenCalled();
  });

  it('сервертэй холбогдож чадсангүй (S-96)', async () => {
    await wrap(<ScreenState kind="error" unreachable onRetry={() => {}} />);
    expect(screen.getByTestId('server-unreachable')).toBeTruthy();
    expect(screen.getByText('Сервертэй холбогдож чадсангүй')).toBeTruthy();
  });

  it('зөвшөөрөл татгалзсан: шалтгаан + «Тохиргоо нээх»', async () => {
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await wrap(<ScreenState kind="permission" permission="camera" />);
    expect(screen.getByText('Зураг авахын тулд камерын зөвшөөрөл хэрэгтэй.')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Тохиргоо нээх')));
    expect(open).toHaveBeenCalled();
  });

  it('offline: «Интернэт алга» зурвас (S-95)', async () => {
    await wrap(<OfflineBanner offline />);
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
    expect(isOfflineState({ isConnected: false })).toBe(true);
    expect(isOfflineState({ isConnected: null })).toBe(false);
    expect(isOfflineState({ isConnected: true, isInternetReachable: false })).toBe(true);
  });

  it('Англи хэлэнд бичвэр солигдоно', async () => {
    usePrefsStore.getState().set({ locale: 'en' });
    await wrap(<ScreenState kind="error" onRetry={() => {}} />);
    expect(screen.getByText('Try again')).toBeTruthy();
    usePrefsStore.getState().set({ locale: 'mn' });
  });
});

describe('AC-192 өргөнөөр layout', () => {
  it('утас · таблет · вэб', () => {
    expect(layoutFor(390, 'ios')).toMatchObject({ isTablet: false, isDesktopWeb: false });
    expect(layoutFor(820, 'ios')).toMatchObject({ isTablet: true, isDesktopWeb: false });
    expect(layoutFor(1280, 'web')).toMatchObject({ isTablet: true, isDesktopWeb: true });
    expect(layoutFor(1280, 'android')).toMatchObject({ isDesktopWeb: false });
  });
});
