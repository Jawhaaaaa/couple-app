import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Animated, Text } from 'react-native';

import { usePrefsStore } from '@/stores/prefsStore';

import { resolveMode, ThemeProvider, useColors } from '../ThemeProvider';
import { palettes } from '../tokens';

function Probe() {
  const c = useColors();
  return <Text testID="probe">{c.bg}</Text>;
}

describe('AC-DS-03 theme солих', () => {
  beforeEach(() => usePrefsStore.setState({ theme: 'dark', palette: 'CORAL' }));

  it('системийн сонголтыг уншина', () => {
    expect(resolveMode('system', 'light')).toBe('light');
    expect(resolveMode('system', 'dark')).toBe('dark');
    expect(resolveMode('system', null)).toBe('dark');
    expect(resolveMode('light', 'dark')).toBe('light');
  });

  it('дахин ачаалалгүй солигдож cross-fade давхарга гарна', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    const probe = screen.getByTestId('probe');
    expect(probe).toHaveTextContent(palettes.CORAL.dark.bg);
    await act(async () => usePrefsStore.getState().set({ theme: 'light' }));
    // Ижил компонент (unmount хийгдээгүй) шинэ өнгийг харуулна
    expect(screen.getByTestId('probe')).toBe(probe);
    expect(probe).toHaveTextContent(palettes.CORAL.light.bg);
    // Хуучин дэвсгэрээс 300 ms-ийн cross-fade эхэлсэн
    expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 0, duration: 300 }));
    await waitFor(() => expect(screen.queryByTestId('theme-crossfade')).toBeNull(), { timeout: 1500 });
  });

  it('хосын сэдэв солигдоход палитр шинэчлэгдэнэ', async () => {
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await act(async () => usePrefsStore.getState().set({ palette: 'LAVENDER', theme: 'light' }));
    expect(screen.getByTestId('probe')).toHaveTextContent(palettes.LAVENDER.light.bg);
  });
});
