import { render, screen } from '@testing-library/react-native';

import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { Mascot } from '../Mascot';

describe('Маскот (§3.5, ANIM-11)', () => {
  beforeEach(() => usePrefsStore.setState({ ...defaultPrefs }));

  it('хоёр маскот нэр, тайлбартай рендэрлэгдэнэ', async () => {
    await render(
      <ThemeProvider>
        <Mascot name="bombolog" />
        <Mascot name="bombii" beltColor="lavender" pose="wave" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('mascot-bombolog')).toBeTruthy();
    expect(screen.getByTestId('mascot-bombii')).toBeTruthy();
    expect(screen.getAllByLabelText('Маскот Бөмбөлөг ба Бөмбий')).toHaveLength(2);
  });

  it('«Унтраах»-д ч статикаар харагдана', async () => {
    usePrefsStore.getState().set({ animation: 'OFF' });
    await render(
      <ThemeProvider>
        <Mascot />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('mascot-bombolog')).toBeTruthy();
  });
});
