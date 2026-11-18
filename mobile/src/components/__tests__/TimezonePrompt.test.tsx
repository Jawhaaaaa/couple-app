import { fireEvent, render, screen } from '@testing-library/react-native';

import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { TimezonePromptView } from '../TimezonePrompt';

beforeEach(() => usePrefsStore.setState({ ...defaultPrefs }));

describe('AC-64 TimezonePrompt', () => {
  it('AC-64 «Цагийн бүсээ Asia/Tokyo болгох уу?» гэж асууж, хариуг дамжуулна', async () => {
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    await render(
      <ThemeProvider>
        <TimezonePromptView zone="Asia/Tokyo" current="Asia/Ulaanbaatar" pending={false} error={null} onAccept={onAccept} onDecline={onDecline} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Цагийн бүсээ Asia/Tokyo болгох уу?')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('timezone-accept'));
    expect(onAccept).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('timezone-decline'));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('AC-64 хадгалж чадаагүй бол (PATCH /me алдаа) алдааг харуулна, унахгүй', async () => {
    await render(
      <ThemeProvider>
        <TimezonePromptView
          zone="Asia/Tokyo"
          current="Asia/Ulaanbaatar"
          pending={false}
          error={new Error('HTTP 404')}
          onAccept={() => {}}
          onDecline={() => {}}
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('timezone-error')).toBeTruthy();
    expect(screen.getByTestId('timezone-decline')).toBeEnabled();
  });
});
