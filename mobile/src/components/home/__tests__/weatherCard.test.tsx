import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import type { PersonCard, WeatherForecast, WeatherNow } from '@/api/queries/dashboard';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { PersonCardView } from '../PersonCardView';
import { ForecastWeather, WeatherCard } from '../WeatherCard';

const snow: WeatherNow = { tempC: -18.4, code: 71, icon: 'snowflake', attribution: 'Open-Meteo (CC BY 4.0)' };
const forecast: WeatherForecast = {
  date: '2026-11-17',
  tempMinC: -26,
  tempMaxC: -12,
  code: 3,
  icon: 'cloud',
  attribution: 'Open-Meteo (CC BY 4.0)',
};

const tokyo = (weather: WeatherNow | null): PersonCard => ({
  name: 'Ану',
  localTime: '2026-11-07T21:30:00+09:00',
  utcOffsetMinutes: 540,
  offsetFromMeMinutes: 60,
  weather,
});

const wrap = (ui: ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

beforeEach(() => usePrefsStore.setState({ ...defaultPrefs }));

describe('AC-71 цаг агаарын хэсэг', () => {
  it('AC-71 температур ба дүрс (WMO 71 → snowflake)', async () => {
    await wrap(<WeatherCard weather={snow} />);
    expect(screen.getByTestId('weather-temp')).toHaveTextContent('−18°');
    expect(screen.getByTestId('weather-icon-snowflake', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByLabelText('Цаг агаар −18°')).toBeTruthy();
  });

  it('AC-71 weather байхгүй (Open-Meteo алдаа) бол хэсэг огт рендэрлэгдэхгүй', async () => {
    await wrap(<WeatherCard weather={null} />);
    expect(screen.queryByTestId('weather')).toBeNull();
    await wrap(<WeatherCard weather={undefined} />);
    expect(screen.queryByTestId('weather')).toBeNull();
  });

  it('AC-71 хамтрагчийн картын бусад хэсэг цаг агааргүй ч ажиллана', async () => {
    const now = Date.parse('2026-11-07T12:30:00Z');
    await wrap(<PersonCardView card={tokyo(null)} role="partner" now={now} />);
    expect(screen.getByTestId('person-partner-name')).toHaveTextContent('Ану');
    expect(screen.getByTestId('person-partner-time')).toHaveTextContent('21:30');
    expect(screen.getByTestId('person-partner-offset')).toHaveTextContent('+1 цаг');
    expect(screen.queryByTestId('weather-partner')).toBeNull();
  });

  it('AC-71 цаг агаартай бол картанд харагдана', async () => {
    await wrap(<PersonCardView card={tokyo(snow)} role="partner" now={Date.parse('2026-11-07T12:30:00Z')} />);
    expect(screen.getByTestId('weather-partner-temp')).toHaveTextContent('−18°');
  });

  it('мэдэгдээгүй дүрсний нэр → үүл', async () => {
    await wrap(<WeatherCard weather={{ ...snow, icon: 'tornado' }} />);
    expect(screen.getByTestId('weather-icon-tornado', { includeHiddenElements: true })).toBeTruthy();
  });
});

describe('AC-100 болзооны өдрийн таамаг', () => {
  it('AC-100 таамагтай бол доод/дээд температур ба дүрс', async () => {
    await wrap(<ForecastWeather forecast={forecast} />);
    expect(screen.getByTestId('forecast-range')).toHaveTextContent('−26° / −12°');
    expect(screen.getByTestId('forecast-icon-cloud', { includeHiddenElements: true })).toBeTruthy();
  });

  it('AC-100 14 хоногоос хол (сервер таамаг өгөхгүй) бол хэсэг нуугдана', async () => {
    await wrap(<ForecastWeather forecast={null} />);
    expect(screen.queryByTestId('forecast')).toBeNull();
  });
});
