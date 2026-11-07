import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, type LucideProps, Snowflake, Sun } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { WeatherForecast, WeatherNow } from '@/api/queries/dashboard';
import { AppText } from '@/components/AppText';
import { formatNumber, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, spacing } from '@/theme/tokens';

/**
 * Backend `WeatherService.icon` (WMO код → Lucide нэр). Мэдэгдээгүй нэр → үүл. Статик
 * компонент — render бүрд шинэ компонент үүсгэхгүй.
 */
export function WeatherIcon({ name, ...props }: LucideProps & { name: string }) {
  switch (name) {
    case 'sun':
      return <Sun {...props} />;
    case 'cloud-sun':
      return <CloudSun {...props} />;
    case 'cloud-fog':
      return <CloudFog {...props} />;
    case 'snowflake':
      return <Snowflake {...props} />;
    case 'cloud-lightning':
      return <CloudLightning {...props} />;
    case 'cloud-rain':
      return <CloudRain {...props} />;
    default:
      return <Cloud {...props} />;
  }
}

function degrees(value: number, locale: 'mn' | 'en'): string {
  return `${formatNumber(Math.round(value), locale)}°`;
}

/**
 * Одоогийн цаг агаар (FR-3.2, AC-71): температур + дүрс. Open-Meteo хүрэхгүй эсвэл хот
 * тохируулаагүй үед сервер `weather`-ийг өгөхгүй — энэ үед хэсэг огт рендэрлэгдэхгүй,
 * картын бусад хэсэг хэвээр ажиллана.
 */
export function WeatherCard({ weather, testID = 'weather' }: { weather: WeatherNow | null | undefined; testID?: string }) {
  const t = useT();
  const colors = useColors();
  const locale = usePrefsStore((s) => s.locale);
  if (!weather) return null;
  const temp = degrees(weather.tempC, locale);
  return (
    <View style={styles.row} accessible accessibilityRole="text" accessibilityLabel={t('home.weather.a11y', { temp })} testID={testID}>
      <WeatherIcon name={weather.icon} size={20} color={colors.secondary} strokeWidth={iconStroke} testID={`${testID}-icon-${weather.icon}`} />
      <AppText variant="bodyStrong" testID={`${testID}-temp`}>
        {temp}
      </AppText>
      <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.flex}>
        {weather.attribution}
      </AppText>
    </View>
  );
}

/**
 * Болзооны өдрийн таамаг (FR-7.12, AC-100): сервер ≤ 14 хоногийн дотор л өгнө; байхгүй
 * бол хэсэг нуугдана.
 */
export function ForecastWeather({ forecast, testID = 'forecast' }: { forecast: WeatherForecast | null | undefined; testID?: string }) {
  const t = useT();
  const colors = useColors();
  const locale = usePrefsStore((s) => s.locale);
  if (!forecast) return null;
  const min = degrees(forecast.tempMinC, locale);
  const max = degrees(forecast.tempMaxC, locale);
  return (
    <View style={styles.row} accessible accessibilityRole="text" accessibilityLabel={t('home.weather.forecastA11y', { min, max })} testID={testID}>
      <WeatherIcon name={forecast.icon} size={20} color={colors.secondary} strokeWidth={iconStroke} testID={`${testID}-icon-${forecast.icon}`} />
      <AppText variant="bodyStrong" testID={`${testID}-range`}>
        {t('home.weather.range', { min, max })}
      </AppText>
      <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.flex}>
        {forecast.attribution}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flexShrink: 1 },
});
