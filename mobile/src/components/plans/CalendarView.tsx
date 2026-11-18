import { router } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { usePlansRange } from '@/api/queries/plans';
import { AppText } from '@/components/AppText';
import { ScreenState } from '@/components/ScreenState';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { emptyStateText } from '@/content/emptyStates';
import {
  addDays,
  type CalendarDate,
  formatDate,
  parseCalendarDate,
  todayIn,
  useT,
} from '@/i18n';
import { type CalendarMode, groupByDay, monthGrid, rangeFor, sameMonth, shiftMonth, weekOf } from '@/domain/calendarGrid';
import { useErrorText } from '@/hooks/useErrorText';
import { usePlanFormat } from '@/plans/usePlanFormat';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

import { PlanCard, planHref } from './PlanCard';

interface Props {
  initialMode?: CalendarMode;
  /** Анхны өдөр (тест, deep link) — үгүй бол өнөөдөр (хэрэглэгчийн бүсээр). */
  initialDate?: CalendarDate;
}

/**
 * S-52 календарь (FR-7.3, AC-94): сар/долоо хоногоор, болзоотой өдөр цэгтэй; өдөр товшиход
 * тухайн өдрийн болзоонууд. Өдөр нь хэрэглэгчийн бүсийн огноо (INV-08).
 */
export function CalendarView({ initialMode = 'month', initialDate }: Props) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  const { tz } = usePlanFormat();
  const today = todayIn(tz);
  const [mode, setMode] = useState<CalendarMode>(initialMode);
  const [selected, setSelected] = useState<CalendarDate>(initialDate ?? today);
  const range = useMemo(() => rangeFor(mode, selected, tz), [mode, selected, tz]);
  const plans = usePlansRange(range.from, range.to);
  const byDay = useMemo(() => groupByDay(plans.data ?? [], tz), [plans.data, tz]);
  const weeks = mode === 'week' ? [weekOf(selected)] : monthGrid(selected);
  const { year, month } = parseCalendarDate(selected);
  const dayPlans = byDay[selected] ?? [];

  const shift = (delta: number) => setSelected((d) => (mode === 'week' ? addDays(d, delta * 7) : shiftMonth(d, delta)));

  return (
    <View style={styles.root} testID="plans-calendar">
      <SegmentedTabs
        options={[
          { key: 'month', label: t('plans.calendar.month') },
          { key: 'week', label: t('plans.calendar.week') },
        ]}
        value={mode}
        onChange={setMode}
        testID="calendar-mode"
      />
      <View style={styles.header}>
        <NavButton label={t('plans.calendar.prev')} onPress={() => shift(-1)} testID="calendar-prev" icon="prev" />
        <AppText variant="h3" accessibilityRole="header" style={styles.title} testID="calendar-title">
          {t('plans.calendar.monthTitle', { year, month: t(`plans.calendar.months.${month}`) })}
        </AppText>
        <NavButton label={t('plans.calendar.next')} onPress={() => shift(1)} testID="calendar-next" icon="next" />
      </View>
      <View style={styles.week}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <AppText key={i} variant="caption" color="textMuted" style={styles.weekday}>
            {t(`plans.calendar.weekdays.${i}`)}
          </AppText>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]} style={styles.week}>
          {week.map((day) => {
            const has = (byDay[day]?.length ?? 0) > 0;
            const isSelected = day === selected;
            const outside = mode === 'month' && !sameMonth(day, selected);
            const label = formatDate(day, dateFormat);
            return (
              <Pressable
                key={day}
                onPress={() => setSelected(day)}
                accessibilityRole="button"
                accessibilityLabel={has ? t('plans.calendar.hasPlans', { date: label }) : label}
                accessibilityState={{ selected: isSelected }}
                testID={`calendar-day-${day}`}
                style={[
                  styles.day,
                  isSelected && { backgroundColor: colors.primary },
                  !isSelected && day === today && { borderColor: colors.primary, borderWidth: 1 },
                ]}
              >
                <AppText variant="label" color={isSelected ? 'onPrimary' : outside ? 'textMuted' : 'text'}>
                  {parseCalendarDate(day).day}
                </AppText>
                <View
                  style={[styles.dot, { backgroundColor: has ? (isSelected ? colors.onPrimary : colors.primary) : 'transparent' }]}
                  testID={has ? `calendar-dot-${day}` : undefined}
                />
              </Pressable>
            );
          })}
        </View>
      ))}
      <AppText variant="h3" testID="calendar-selected">
        {formatDate(selected, dateFormat)}
      </AppText>
      {plans.isError && !plans.data ? (
        <ScreenState kind="error" message={errorText(plans.error)} onRetry={() => void plans.refetch()} />
      ) : plans.isPending ? (
        <ScreenState kind="loading" rows={2} />
      ) : (plans.data?.length ?? 0) === 0 ? (
        <EmptyRange locale={locale} />
      ) : dayPlans.length === 0 ? (
        <AppText color="textMuted" testID="calendar-day-empty">
          {t('plans.calendar.none')}
        </AppText>
      ) : (
        <View style={styles.list} testID="calendar-day-plans">
          {dayPlans.map((p) => (
            <PlanCard key={`${p.id}:${p.occurrenceOn ?? ''}`} plan={p} onPress={() => router.push(planHref(p))} />
          ))}
        </View>
      )}
    </View>
  );
}

function EmptyRange({ locale }: { locale: 'mn' | 'en' }) {
  const empty = emptyStateText('S-52', locale);
  return <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => router.push('/plans/new')} />;
}

function NavButton({ label, onPress, testID, icon }: { label: string; onPress: () => void; testID: string; icon: 'prev' | 'next' }) {
  const colors = useColors();
  const Icon = icon === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID} style={styles.nav}>
      <Icon size={22} color={colors.text} strokeWidth={iconStroke} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, textAlign: 'center' },
  nav: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center' },
  day: { flex: 1, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.input, gap: 2 },
  dot: { width: 6, height: 6, borderRadius: radius.pill },
  list: { gap: spacing.sm },
});
