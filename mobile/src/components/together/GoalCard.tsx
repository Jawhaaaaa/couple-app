import { router } from 'expo-router';
import { Trophy } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import type { GoalSummary } from '@/api/queries/goals';
import { AppText } from '@/components/AppText';
import { GoalProgressBar } from '@/components/together/GoalProgressBar';
import { stepsFraction } from '@/domain/goalProgress';
import { formatDate, formatMoney, formatNumber, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing } from '@/theme/tokens';

export const goalHref = (id: string) => ({ pathname: '/together/goals/[id]' as const, params: { id } });

/** Зорилгын карт (S-64, S-60): гарчиг, ANIM-20 явц, «2/4 алхам» эсвэл мөнгөн зорилт (AC-108). */
export function GoalCard({ goal }: { goal: GoalSummary }) {
  const t = useT();
  const colors = useColors();
  const locale = usePrefsStore((s) => s.locale);
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  const pct = formatNumber(goal.progressPercent, locale, goal.progressPercent % 1 ? 1 : 0);
  const sub =
    goal.targetAmountMnt != null
      ? t('goals.moneyTarget', { amount: formatMoney(goal.targetAmountMnt, locale) })
      : t('goals.stepsProgress', { fraction: stepsFraction(goal.stepsDone, goal.stepsTotal) });
  return (
    <Pressable
      onPress={() => router.push(goalHref(goal.id))}
      accessibilityRole="button"
      accessibilityLabel={`${goal.title}. ${pct}%. ${sub}`}
      testID={`goal-${goal.id}`}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={styles.cardHead}>
        {goal.completedAt ? <Trophy size={18} color={colors.warning} strokeWidth={iconStroke} /> : null}
        <AppText variant="bodyStrong" style={styles.flex}>
          {goal.title}
        </AppText>
        <AppText variant="label" testID={`goal-percent-${goal.id}`}>
          {pct}%
        </AppText>
      </View>
      <GoalProgressBar percent={goal.progressPercent} label={`${pct}%`} height={10} testID={`goal-bar-${goal.id}`} />
      <AppText variant="caption" color="textMuted" testID={`goal-sub-${goal.id}`}>
        {sub}
        {goal.targetDate ? ` · ${t('goals.until', { date: formatDate(goal.targetDate, dateFormat) })}` : ''}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
});
