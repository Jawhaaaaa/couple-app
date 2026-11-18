import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useDashboard } from '@/api/queries/dashboard';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { ScreenState } from '@/components/ScreenState';
import { SheetScreen } from '@/components/SheetScreen';
import { nextMilestones } from '@/domain/dates';
import { useErrorText } from '@/hooks/useErrorText';
import { addDays, formatDate, formatNumber, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { spacing } from '@/theme/tokens';

/**
 * S-21 Тоолуурын дэлгэрэнгүй (`formSheet`, AC-69): «2 жил 0 сар 14 өдөр», эхэлсэн өдөр,
 * дараагийн ой (хоногийн ба жилийн). «Өнөөдөр»-ийг серверийн тоолуураас гаргана
 * (эхэлсэн + тоолуур − 1) — S-20-тэй яг ижил өдөр.
 */
export default function CounterSheet() {
  const t = useT();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  const dashboard = useDashboard();
  const counter = dashboard.data?.counter;

  let body;
  if (dashboard.isPending) body = <ScreenState kind="loading" rows={2} />;
  else if (!counter) {
    body = <ScreenState kind="error" message={errorText(dashboard.error)} onRetry={() => void dashboard.refetch()} />;
  } else if (!counter.confirmed || !counter.startDate || counter.days < 1) {
    body = (
      <Card testID="counter-unconfirmed">
        <AppText>{t('home.counter.confirmBody')}</AppText>
        <AppButton label={t('home.counter.confirm')} onPress={() => router.push('/start-date')} testID="counter-confirm" />
      </Card>
    );
  } else {
    const today = addDays(counter.startDate, counter.days - 1);
    const next = nextMilestones(counter.startDate, today);
    const { years, months, days } = counter.breakdown;
    body = (
      <>
        <Card>
          <AppText variant="display" testID="counter-sheet-days">
            {formatNumber(counter.days, locale)}
          </AppText>
          <AppText variant="h3" testID="counter-breakdown">
            {t('home.counter.breakdown', { years, months, days })}
          </AppText>
          <AppText color="textMuted" testID="counter-start">
            {t('home.counter.startedOn', { date: formatDate(counter.startDate, dateFormat) })}
          </AppText>
        </Card>
        <Card testID="counter-next">
          <AppText variant="h3" accessibilityRole="header">
            {t('home.counter.nextTitle')}
          </AppText>
          <Row
            label={t('home.counter.nextDays', { count: next.days.n })}
            value={next.days.date === today ? t('home.upcoming.today') : formatDate(next.days.date, dateFormat)}
            testID="counter-next-days"
          />
          <Row
            label={t('home.counter.nextYears', { count: next.anniversary.years })}
            value={next.anniversary.date === today ? t('home.upcoming.today') : formatDate(next.anniversary.date, dateFormat)}
            testID="counter-next-years"
          />
        </Card>
      </>
    );
  }

  return (
    <SheetScreen title={t('home.counter.sheetTitle')} testID="screen-S-21">
      {body}
    </SheetScreen>
  );
}

function Row({ label, value, testID }: { label: string; value: string; testID: string }) {
  return (
    <View style={styles.row} testID={testID}>
      <AppText style={styles.flex}>{label}</AppText>
      <AppText variant="bodyStrong">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
