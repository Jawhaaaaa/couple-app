import { router } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { BookHeart, CalendarHeart, Camera, Film, Flag, Heart, Mail, MapPinned, Route, Sparkles, Target } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';

import { type Stats, useStats } from '@/api/queries/stats';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { useErrorText } from '@/hooks/useErrorText';
import { formatNumber, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing } from '@/theme/tokens';

const TILES: readonly { key: keyof Stats; icon: LucideIcon }[] = [
  { key: 'daysTogether', icon: CalendarHeart },
  { key: 'memories', icon: BookHeart },
  { key: 'photos', icon: Camera },
  { key: 'videos', icon: Film },
  { key: 'dates', icon: Sparkles },
  { key: 'goalsCompleted', icon: Target },
  { key: 'letters', icon: Mail },
  { key: 'heartsSent', icon: Heart },
];

/**
 * S-71 Статистик (FR-12.2, FR-12.3, AC-47, AC-117): тоо бүр серверийн бодит тоо (оноо, харьцуулалтгүй —
 * зарчим 6); «Бидний очсон газрууд» — хот, улс, км (дурсамжийн байршлуудыг огноогоор холбосон зай).
 */
export default function StatsScreen() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const stats = useStats();
  const year = new Date().getFullYear();
  let body;
  if (stats.isPending) body = <ScreenState kind="loading" rows={4} />;
  else if (!stats.data) body = <ScreenState kind="error" message={errorText(stats.error)} onRetry={() => void stats.refetch()} />;
  else {
    const s = stats.data;
    body = (
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.grid}>
          {TILES.map(({ key, icon: Icon }) => (
            <View key={key} style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`stat-${key}`}>
              <Icon size={20} color={colors.primary} strokeWidth={iconStroke} />
              <AppText variant="h2" testID={`stat-${key}-value`}>
                {formatNumber(s[key] as number, locale)}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {t(`stats.${key}`)}
              </AppText>
            </View>
          ))}
        </View>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="stat-footsteps">
          <AppText variant="h3" accessibilityRole="header">
            {t('stats.footsteps')}
          </AppText>
          <View style={styles.row}>
            <MapPinned size={18} color={colors.secondary} strokeWidth={iconStroke} />
            <AppText testID="stat-cities">{t('stats.cities', { count: s.cities })}</AppText>
          </View>
          <View style={styles.row}>
            <Flag size={18} color={colors.secondary} strokeWidth={iconStroke} />
            <AppText testID="stat-countries">{t('stats.countries', { count: s.countries })}</AppText>
          </View>
          <View style={styles.row}>
            <Route size={18} color={colors.secondary} strokeWidth={iconStroke} />
            <AppText testID="stat-distance">{t('stats.distance', { km: formatNumber(Math.round(s.distanceKm), locale) })}</AppText>
          </View>
          <AppButton variant="secondary" label={t('stats.openMap')} onPress={() => router.push('/together/map')} testID="stat-open-map" />
        </View>
        <AppButton label={t('stats.yearReview', { year })} onPress={() => router.push(`/year/${year}`)} testID="stat-year" />
        <AppText variant="caption" color="textMuted">
          {t('stats.note')}
        </AppText>
      </ScrollView>
    );
  }
  return (
    <StackScreen title={t('stats.title')} testID="screen-S-71">
      {body}
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.xxs },
  card: { borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
