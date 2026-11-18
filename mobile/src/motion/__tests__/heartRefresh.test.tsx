import { act, render, renderHook, screen } from '@testing-library/react-native';

import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { HeartRefresh, HIDDEN_REFRESH_SPINNER, usePullRefresh } from '../HeartRefresh';

/** ANIM-09 (§3.4, AC-214): pull-to-refresh үед зүрх дүүрч цохилно; reduce/off үед хөдөлгөөнгүй зүрх. */
function wrap(refreshing: boolean) {
  return render(
    <ThemeProvider>
      <HeartRefresh refreshing={refreshing} />
    </ThemeProvider>,
  );
}

beforeEach(() => usePrefsStore.setState({ ...defaultPrefs }));

describe('ANIM-09 HeartRefresh', () => {
  it('шинэчилж байх үед зүрх ба «playing» тэмдэглэгээ, уншигчид «Шинэчилж байна…»', async () => {
    await wrap(true);
    expect(screen.getByTestId('refresh-heart')).toBeTruthy();
    expect(screen.getByLabelText('Шинэчилж байна…')).toBeTruthy();
    expect(screen.getByTestId('anim-ANIM-09').props.dataSet).toEqual({ animState: 'playing', anim: 'ANIM-09' });
  });

  it('шинэчлэл дуусахад зүрх алга, төлөв «done»', async () => {
    await wrap(false);
    expect(screen.queryByTestId('refresh-heart')).toBeNull();
    expect(screen.getByTestId('anim-ANIM-09').props.dataSet.animState).toBe('done');
  });

  it('«Анимаци: Унтраах»-д ч зүрх харагдана (утга хэвээр), төлөв «off»', async () => {
    usePrefsStore.getState().set({ animation: 'OFF' });
    await wrap(true);
    expect(screen.getByTestId('refresh-heart')).toBeTruthy();
    expect(screen.getByTestId('anim-ANIM-09').props.dataSet.animState).toBe('off');
  });

  it('системийн spinner-ийг нуух тохиргоо (hex өнгөгүй)', () => {
    expect(HIDDEN_REFRESH_SPINNER.tintColor).toBe('transparent');
    expect(HIDDEN_REFRESH_SPINNER.colors).toEqual(['transparent']);
  });
});

describe('ANIM-09 usePullRefresh', () => {
  it('зөвхөн хэрэглэгч татсан үед refreshing, refetch дуусахад буцна', async () => {
    let resolve!: () => void;
    const refresh = jest.fn(() => new Promise<void>((r) => (resolve = r)));
    const { result } = await renderHook(() => usePullRefresh(refresh));
    expect(result.current.refreshing).toBe(false);
    await act(async () => result.current.onRefresh());
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.refreshing).toBe(true);
    await act(async () => resolve());
    expect(result.current.refreshing).toBe(false);
  });
});
