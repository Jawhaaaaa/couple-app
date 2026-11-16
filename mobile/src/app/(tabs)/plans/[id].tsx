import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CalendarClock, MapPin, Repeat, Sparkles } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { cancelPlan, type DatePlan, invalidatePlans, type PlanScope, usePlan } from '@/api/queries/plans';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { FormMessage } from '@/components/FormMessage';
import { PlanConfirmedMoment } from '@/components/plans/PlanConfirmedMoment';
import { StatusPill } from '@/components/plans/PlanCard';
import { BudgetSection, ChecklistSection, RsvpSection, WeatherRow } from '@/components/plans/PlanSections';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { isPast, planDay, visibleForecast } from '@/domain/planTime';
import { useErrorText } from '@/hooks/useErrorText';
import { useNow } from '@/hooks/useNow';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';
import { addToCalendar } from '@/plans/addToCalendar';
import { useCouplePeople } from '@/plans/people';
import { placeLabel } from '@/plans/planForm';
import { usePlanFormat } from '@/plans/usePlanFormat';
import { useSessionStore } from '@/stores/sessionStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, spacing } from '@/theme/tokens';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/**
 * S-54 болзооны дэлгэрэнгүй (FR-7.2…7.13): огноо/цаг (хэрэглэгчийн бүсээр, AC-34), газар,
 * ≤ 14 хоногт цаг агаар (AC-100), RSVP (AC-33, ANIM-12), checklist «2 / 4» (AC-96), төсөв,
 * давталт, «Календарьт нэмэх» (AC-101, вэбэд .ics — AC-158), өнгөрсөнд «Дурсамж болгох» (AC-95).
 */
export default function PlanDetailScreen() {
  const t = useT();
  const errorText = useErrorText();
  const params = useLocalSearchParams<{ id?: string; occurrenceOn?: string }>();
  const id = first(params.id);
  const occurrenceOn = first(params.occurrenceOn) ?? null;
  const plan = usePlan(id, occurrenceOn);
  // Буцаж ирэхэд (S-32-оос «Дурсамж болгох»-ын дараа) холбоосыг шинэчилнэ (AC-95): дурсамж үүсэхэд
  // `plan.updated` ирдэггүй тул stack-д үлдсэн дэлгэц «Дурсамж болгох»-ыг харуулсаар байсан.
  const refetchPlan = plan.refetch;
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) void refetchPlan();
      focusedOnce.current = true;
    }, [refetchPlan]),
  );
  let body;
  if (plan.data) body = <PlanDetail plan={plan.data} />;
  else if (plan.isError) body = <ScreenState kind="error" message={errorText(plan.error)} onRetry={() => void plan.refetch()} />;
  else body = <ScreenState kind="loading" rows={4} />;
  return (
    <StackScreen title={plan.data?.title ?? t('plans.detailTitle')} testID="screen-S-54">
      {body}
    </StackScreen>
  );
}

function PlanDetail({ plan }: { plan: DatePlan }) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const myId = useSessionStore((s) => s.userId);
  const { me, partner, byId } = useCouplePeople();
  const { tz, when } = usePlanFormat();
  const now = useNow();
  const { disabled: offline } = useOnlineOnly();
  const [celebrate, setCelebrate] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const endCelebrate = useCallback(() => setCelebrate(false), []);

  // Хамтрагч батлахад (realtime `plan.updated`) ч хоёуланд ANIM-12 (AC-33)
  const prevStatus = useRef(plan.status);
  useEffect(() => {
    if (prevStatus.current !== 'CONFIRMED' && plan.status === 'CONFIRMED') setCelebrate(true);
    prevStatus.current = plan.status;
  }, [plan.status]);

  const calendar = useMutation({ mutationFn: () => addToCalendar(plan) });
  const cancel = useMutation({
    mutationFn: (scope: PlanScope) => cancelPlan(plan.id, scope, plan.occurrenceOn),
    onSuccess: async () => {
      setConfirmCancel(false);
      await invalidatePlans(queryClient);
      if (router.canGoBack()) router.back();
      else router.replace('/plans');
    },
  });

  const weather = visibleForecast(plan, now, tz);
  const past = isPast(plan.startsAt, now);
  const active = plan.status !== 'CANCELLED' && plan.status !== 'DECLINED';
  const recurring = plan.recurrence !== 'NONE';
  const toMemory = () =>
    router.push({
      pathname: '/memory-editor',
      params: {
        draft: JSON.stringify({
          title: plan.title,
          occurredOn: planDay(plan.startsAt, tz),
          ...(plan.place ? { place: plan.place } : {}),
          ...(plan.description ? { description: plan.description } : {}),
          datePlanId: plan.id,
        }),
      },
    });

  return (
    <ScrollView contentContainerStyle={styles.body} testID="plan-detail">
      {celebrate ? <PlanConfirmedMoment me={me} partner={partner} onDone={endCelebrate} /> : null}
      <Card testID="plan-summary">
        <View style={styles.row}>
          <StatusPill status={plan.status} testID="plan-status" />
          {plan.category ? (
            <AppText variant="caption" color="textMuted">
              {t(`plans.category.${plan.category}`)}
            </AppText>
          ) : null}
        </View>
        {plan.proposer ? (
          <AppText variant="caption" color="textMuted">
            {t('plans.proposedBy', { name: byId(plan.proposer.id)?.name || plan.proposer.displayName })}
          </AppText>
        ) : null}
        <View style={styles.row}>
          <CalendarClock size={18} color={colors.textMuted} strokeWidth={iconStroke} />
          <AppText testID="plan-when">{when(plan.startsAt)}</AppText>
        </View>
        {plan.place ? (
          <View style={styles.row}>
            <MapPin size={18} color={colors.textMuted} strokeWidth={iconStroke} />
            <AppText style={styles.flex} testID="plan-place">
              {placeLabel(plan.place)}
            </AppText>
          </View>
        ) : null}
        {recurring ? (
          <View style={styles.row}>
            <Repeat size={18} color={colors.textMuted} strokeWidth={iconStroke} />
            <AppText testID="plan-recurrence">{t(`plans.recurrence.${plan.recurrence}`)}</AppText>
          </View>
        ) : null}
        {weather ? <WeatherRow weather={weather} /> : null}
        {plan.description ? <AppText color="textMuted">{plan.description}</AppText> : null}
        {plan.status === 'CONFIRMED' ? (
          <AppText variant="label" color="primary" testID="plan-confirmed">
            {t('plans.rsvp.confirmed')}
          </AppText>
        ) : null}
      </Card>

      {active && !past ? <RsvpSection plan={plan} myId={myId} onConfirmed={() => setCelebrate(true)} /> : null}

      {past && plan.status === 'CONFIRMED' ? (
        plan.memoryId ? (
          <AppButton variant="secondary" label={t('plans.openMemory')} onPress={() => router.push(`/memories/${plan.memoryId}`)} testID="plan-open-memory" />
        ) : (
          <Card testID="plan-to-memory-card">
            <View style={styles.row}>
              <Sparkles size={20} color={colors.primary} strokeWidth={iconStroke} />
              <AppText variant="h3" style={styles.flex}>
                {t('plans.toMemory')}
              </AppText>
            </View>
            <AppButton label={t('plans.toMemory')} onPress={toMemory} testID="plan-to-memory" />
          </Card>
        )
      ) : null}

      <ChecklistSection plan={plan} byId={byId} />
      <BudgetSection plan={plan} me={me} partner={partner} byId={byId} />

      {active ? (
        <View style={styles.actions}>
          <AppButton
            variant="secondary"
            label={t('plans.calendarAdd')}
            onPress={() => calendar.mutate()}
            loading={calendar.isPending}
            disabled={offline}
            testID="plan-add-calendar"
          />
          {calendar.data ? (
            <FormMessage kind="success" text={calendar.data === 'added' ? t('plans.calendarAdded') : t('plans.icsShared')} testID="plan-calendar-done" />
          ) : null}
          {calendar.error ? <FormMessage text={errorText(calendar.error)} testID="plan-calendar-error" /> : null}
          <AppButton
            variant="ghost"
            label={t('plans.edit')}
            onPress={() =>
              router.push({ pathname: '/plans/new', params: { id: plan.id, ...(plan.occurrenceOn ? { occurrenceOn: plan.occurrenceOn } : {}) } })
            }
            testID="plan-edit"
          />
          <AppButton variant="ghost" label={t('plans.cancelPlan')} onPress={() => setConfirmCancel(true)} disabled={offline} testID="plan-cancel" />
        </View>
      ) : null}
      {cancel.error ? <FormMessage text={errorText(cancel.error)} testID="plan-cancel-error" /> : null}

      <ConfirmSheet
        visible={confirmCancel}
        title={t('plans.cancelConfirm.title')}
        body={t('plans.cancelConfirm.body')}
        confirmLabel={recurring && plan.occurrenceOn ? t('plans.cancelConfirm.one') : t('plans.cancelPlan')}
        onConfirm={() => cancel.mutate(recurring && plan.occurrenceOn ? 'OCCURRENCE' : 'SERIES')}
        onCancel={() => setConfirmCancel(false)}
        loading={cancel.isPending}
        testID="plan-cancel-confirm"
      >
        {recurring && plan.occurrenceOn ? (
          <AppButton variant="secondary" label={t('plans.cancelConfirm.series')} onPress={() => cancel.mutate('SERIES')} testID="plan-cancel-series" />
        ) : null}
      </ConfirmSheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.md, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  flex: { flex: 1 },
  actions: { gap: spacing.xs },
});
