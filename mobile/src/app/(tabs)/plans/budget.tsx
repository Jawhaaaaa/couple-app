import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useBudgetSummary } from '@/api/queries/ideas';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { emptyStateText } from '@/content/emptyStates';
import { budgetTotals, formatShares, isMonthKey, lineOverBy, monthKey, sharePercents, shiftMonthKey } from '@/domain/budget';
import { useErrorText } from '@/hooks/useErrorText';
import { formatMoney, todayIn, useT } from '@/i18n';
import { useCouplePeople } from '@/plans/people';
import { usePlanFormat } from '@/plans/usePlanFormat';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, spacing, touchTarget } from '@/theme/tokens';

/**
 * S-59 төсвийн тойм (`?month=YYYY-MM`, FR-7.7, AC-97): төлөвлөсөн ба бодит, «30 000₮ хэтэрсэн»,
 * «Бат 65% · Ану 35%»; сарын нийт = тухайн сарын болзоонуудын бодит зардлын нийлбэр.
 */
export default function BudgetScreen() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const { tz, when } = usePlanFormat();
  const { me, byId } = useCouplePeople();
  const params = useLocalSearchParams<{ month?: string }>();
  const [month, setMonth] = useState(() => (isMonthKey(params.month) ? params.month : monthKey(todayIn(tz))));
  const summary = useBudgetSummary(month);

  const nameOf = (userId: string) => (userId === me?.id ? t('plans.budget.me') : byId(userId)?.name || '—');
  let body;
  if (summary.isError && !summary.data) body = <ScreenState kind="error" message={errorText(summary.error)} onRetry={() => void summary.refetch()} />;
  else if (summary.isPending) body = <ScreenState kind="loading" rows={3} />;
  else if (summary.data.plans.length === 0) {
    const empty = emptyStateText('S-59', locale);
    body = <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => router.push('/plans')} />;
  } else {
    const totals = budgetTotals(summary.data.plans);
    const shares = sharePercents(summary.data.shares.map((s) => ({ userId: s.userId, amount: s.amount })));
    body = (
      <>
        <Card testID="budget-totals">
          <AppText testID="budget-planned">{t('plans.budgetSummary.planned', { amount: formatMoney(totals.plannedTotal, locale) })}</AppText>
          <AppText variant="h2" testID="budget-actual">
            {t('plans.budgetSummary.actual', { amount: formatMoney(totals.actualTotal, locale) })}
          </AppText>
          {totals.overBy > 0 ? (
            <AppText color="danger" testID="budget-over">
              {t('plans.budgetSummary.over', { amount: formatMoney(totals.overBy, locale) })}
            </AppText>
          ) : (
            <AppText color="textMuted">{t('plans.budgetSummary.within')}</AppText>
          )}
          {shares.length > 0 ? (
            <>
              <AppText variant="label" color="textMuted">
                {t('plans.budgetSummary.shares')}
              </AppText>
              <AppText variant="bodyStrong" testID="budget-shares">
                {formatShares(shares, nameOf)}
              </AppText>
            </>
          ) : null}
        </Card>
        <AppText variant="label" color="textMuted">
          {t('plans.budgetSummary.plans')}
        </AppText>
        {summary.data.plans.map((line) => (
          <Pressable
            key={line.planId}
            onPress={() => router.push({ pathname: '/plans/[id]', params: { id: line.planId } })}
            accessibilityRole="button"
            accessibilityLabel={line.title}
            testID={`budget-line-${line.planId}`}
          >
            <Card>
              <AppText variant="h3">{line.title}</AppText>
              {line.startsAt ? <AppText color="textMuted">{when(line.startsAt)}</AppText> : null}
              <AppText>
                {line.plannedMnt != null ? `${t('plans.budget.planned', { amount: formatMoney(line.plannedMnt, locale) })} · ` : ''}
                {t('plans.budget.actual', { amount: formatMoney(line.actualMnt, locale) })}
              </AppText>
              {lineOverBy(line) > 0 ? <AppText color="danger">{t('plans.budget.over', { amount: formatMoney(lineOverBy(line), locale) })}</AppText> : null}
            </Card>
          </Pressable>
        ))}
      </>
    );
  }

  const [year, mm] = month.split('-').map(Number);
  return (
    <StackScreen title={t('plans.budgetSummary.title')} testID="screen-S-59">
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.header}>
          <Pressable onPress={() => setMonth((m) => shiftMonthKey(m, -1))} accessibilityRole="button" accessibilityLabel={t('plans.calendar.prev')} style={styles.nav} testID="budget-prev">
            <ChevronLeft size={22} color={colors.text} strokeWidth={iconStroke} />
          </Pressable>
          <AppText variant="h3" style={styles.title} testID="budget-month">
            {t('plans.calendar.monthTitle', { year, month: t(`plans.calendar.months.${mm}`) })}
          </AppText>
          <Pressable onPress={() => setMonth((m) => shiftMonthKey(m, 1))} accessibilityRole="button" accessibilityLabel={t('plans.calendar.next')} style={styles.nav} testID="budget-next">
            <ChevronRight size={22} color={colors.text} strokeWidth={iconStroke} />
          </Pressable>
        </View>
        {body}
      </ScrollView>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.sm, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, textAlign: 'center' },
  nav: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
});
