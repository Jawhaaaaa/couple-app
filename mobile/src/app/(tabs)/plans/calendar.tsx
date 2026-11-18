import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { CalendarView } from '@/components/plans/CalendarView';
import { StackScreen } from '@/components/StackScreen';
import { isCalendarDate, useT } from '@/i18n';
import { spacing } from '@/theme/tokens';

/** S-52 календарь (`?mode=month|week&date`, AC-94) — S-50-ийн «Календарь» табтай ижил. */
export default function PlansCalendarScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ mode?: string; date?: string }>();
  const mode = params.mode === 'week' ? 'week' : 'month';
  const date = isCalendarDate(params.date) ? params.date : undefined;
  return (
    <StackScreen title={t('plans.calendar.title')} testID="screen-S-52">
      <ScrollView contentContainerStyle={styles.body}>
        <CalendarView initialMode={mode} initialDate={date} />
      </ScrollView>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.md, paddingBottom: spacing.xxl },
});
