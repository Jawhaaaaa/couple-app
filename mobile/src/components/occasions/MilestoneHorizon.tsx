import { router } from 'expo-router';
import { ChevronRight, Gift, Sparkles } from 'lucide-react-native';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { type Occasion, useOccasions } from '@/api/queries/anniversaries';
import { AppText } from '@/components/AppText';
import { type Countdown, occasionCountdown, upcomingOccasions } from '@/domain/occasionCountdown';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { formatDate, todayIn, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

/** «18 хоног үлдлээ» · «3 хоногийн өмнө» · «Өнөөдөр» (AC-103). */
export function useCountdownText(): (c: Countdown) => string {
  const t = useT();
  return useCallback(
    (c: Countdown) => (c.kind === 'today' ? t('occasions.today') : c.kind === 'until' ? t('occasions.daysLeft', { count: c.days }) : t('occasions.daysAgo', { count: c.days })),
    [t],
  );
}

export function occasionHref(o: Pick<Occasion, 'occasionKey'>) {
  return { pathname: '/together/occasions/[key]', params: { key: o.occasionKey } } as const;
}

/**
 * «Milestone Horizon» (FR-8.3, T-57): ойртож буй 2 өдөр ба үлдсэн хоног — S-50-ийн дээд хэсэг,
 * S-60 хаб. Тэмдэглэлт өдөр алга бол харагдахгүй (S-61-ийн хоосон төлөв өөрийн дэлгэцэд).
 */
export function MilestoneHorizon({ limit = 2 }: { limit?: number }) {
  const t = useT();
  const colors = useColors();
  const tz = useUserTimezone();
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  const countdownText = useCountdownText();
  const occasions = useOccasions(tz);
  const today = todayIn(tz);
  const items = upcomingOccasions(occasions.data ?? [], today, limit);
  if (items.length === 0) return null;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="milestone-horizon">
      <Pressable
        onPress={() => router.push('/together/occasions')}
        accessibilityRole="link"
        accessibilityLabel={`${t('occasions.horizon')}. ${t('occasions.horizonAll')}`}
        style={styles.header}
        testID="milestone-horizon-all"
      >
        <AppText variant="label" color="textMuted" style={styles.flex}>
          {t('occasions.horizon')}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {t('occasions.horizonAll')}
        </AppText>
        <ChevronRight size={16} color={colors.textMuted} strokeWidth={iconStroke} />
      </Pressable>
      <View style={styles.row}>
        {items.map((o) => {
          const Icon = o.kind === 'BIRTHDAY' ? Gift : Sparkles;
          const left = countdownText(occasionCountdown(o, today));
          return (
            <Pressable
              key={o.occasionKey}
              onPress={() => router.push(occasionHref(o))}
              accessibilityRole="button"
              accessibilityLabel={`${o.title}. ${left}`}
              testID={`horizon-${o.occasionKey}`}
              style={({ pressed }) => [styles.tile, { backgroundColor: colors.surfaceRaised, opacity: pressed ? 0.85 : 1 }]}
            >
              <View style={styles.tileHead}>
                <Icon size={16} color={colors.primary} strokeWidth={iconStroke} />
                <AppText variant="caption" color="textMuted">
                  {formatDate(o.nextOn, dateFormat)}
                </AppText>
              </View>
              <AppText variant="bodyStrong" numberOfLines={2}>
                {o.title}
              </AppText>
              <AppText variant="h3" testID={`horizon-left-${o.occasionKey}`}>
                {left}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, minHeight: touchTarget },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.sm },
  tile: { flex: 1, borderRadius: radius.input, padding: spacing.sm, gap: spacing.xxs },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
});
