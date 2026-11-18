import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { type ReactNode, useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { type DatePlanSummary, invalidatePlans, type PlanAction, respondToPlan, usePlans } from '@/api/queries/plans';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { FormMessage } from '@/components/FormMessage';
import { MilestoneHorizon } from '@/components/occasions/MilestoneHorizon';
import { ScreenState } from '@/components/ScreenState';
import { emptyStateText } from '@/content/emptyStates';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';
import { useCouplePeople } from '@/plans/people';
import { usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';
import { spacing } from '@/theme/tokens';

import { PlanCard, planHref } from './PlanCard';
import { PlanConfirmedMoment } from './PlanConfirmedMoment';

function Section({ title, children, testID }: { title: string; children: ReactNode; testID: string }) {
  return (
    <View style={styles.section} testID={testID}>
      <AppText variant="label" color="textMuted" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </View>
  );
}

/**
 * Хариу хүлээж буй болзооны товч (AC-33): миний ээлж бол Зөвшөөрөх / Өөр цаг / Татгалзах.
 * «Өөр цаг»-ийг зөвхөн санал болгогч биш нь өгдөг тул (`DatePlanService.respond`) сонгох ээлж
 * санал болгогчийнх; цаг санал болгосон хамтрагчид «Хариу хүлээгдэж байна».
 */
function RsvpFooter({ plan, onRespond, busy }: { plan: DatePlanSummary; onRespond: (a: PlanAction) => void; busy: boolean }) {
  const t = useT();
  const myId = useSessionStore((s) => s.userId);
  const { disabled: offline } = useOnlineOnly();
  const mine = plan.proposer?.id === myId;
  if (plan.status === 'PENDING' && !mine) {
    return (
      <View style={styles.actions}>
        <AppButton label={t('plans.rsvp.accept')} onPress={() => onRespond('ACCEPT')} disabled={offline || busy} testID={`rsvp-accept-${plan.id}`} />
        <AppButton
          variant="secondary"
          label={t('plans.rsvp.counter')}
          onPress={() => router.push({ pathname: '/plans/[id]/counter', params: { id: plan.id } })}
          disabled={offline}
          testID={`rsvp-counter-${plan.id}`}
        />
        <AppButton variant="ghost" label={t('plans.rsvp.decline')} onPress={() => onRespond('DECLINE')} disabled={offline || busy} testID={`rsvp-decline-${plan.id}`} />
      </View>
    );
  }
  if (plan.status === 'COUNTER_PROPOSED' && mine) {
    return <AppButton variant="secondary" label={t('plans.rsvp.choose')} onPress={() => router.push(planHref(plan))} testID={`rsvp-choose-${plan.id}`} />;
  }
  return (
    <AppText variant="caption" color="textMuted" testID={`rsvp-waiting-${plan.id}`}>
      {t('plans.rsvp.waiting')}
    </AppText>
  );
}

/**
 * S-50 «Удахгүй» (FR-7.2, FR-7.3): дараагийн батлагдсан болзоо, хариу хүлээж буй (RSVP),
 * удахгүй болох, өнгөрсөн («Дурсамж болгох» — AC-95 дэлгэрэнгүйд).
 */
export function UpcomingPane() {
  const t = useT();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const queryClient = useQueryClient();
  const { me, partner } = useCouplePeople();
  const upcoming = usePlans('upcoming');
  const past = usePlans('past');
  const [celebrate, setCelebrate] = useState(false);
  const endCelebrate = useCallback(() => setCelebrate(false), []);
  const respond = useMutation({
    mutationFn: ({ id, action }: { id: string; action: PlanAction }) => respondToPlan(id, action),
    onSuccess: (plan) => {
      if (plan.status === 'CONFIRMED') setCelebrate(true);
      return invalidatePlans(queryClient);
    },
  });

  if (upcoming.isError && !upcoming.data) {
    return <ScreenState kind="error" message={errorText(upcoming.error)} onRetry={() => void upcoming.refetch()} />;
  }
  if (upcoming.isPending) return <ScreenState kind="loading" rows={3} />;

  const list = upcoming.data;
  const awaiting = list.filter((p) => p.status !== 'CONFIRMED');
  const confirmed = list.filter((p) => p.status === 'CONFIRMED');
  const [next, ...later] = confirmed;
  const pastList = (past.data ?? []).slice(0, 3);

  if (list.length === 0 && pastList.length === 0) {
    const empty = emptyStateText('S-50', locale);
    return <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => router.push('/plans/new')} />;
  }

  return (
    <View style={styles.root} testID="plans-upcoming">
      <MilestoneHorizon />
      {celebrate ? <PlanConfirmedMoment me={me} partner={partner} onDone={endCelebrate} /> : null}
      {respond.error ? <FormMessage text={errorText(respond.error)} testID="plans-respond-error" /> : null}
      {next ? (
        <Section title={t('plans.sections.next')} testID="plans-next">
          <PlanCard plan={next} onPress={() => router.push(planHref(next))} />
        </Section>
      ) : null}
      {awaiting.length > 0 ? (
        <Section title={t('plans.sections.awaiting')} testID="plans-awaiting">
          {awaiting.map((p) => (
            <PlanCard
              key={`${p.id}:${p.occurrenceOn ?? ''}`}
              plan={p}
              onPress={() => router.push(planHref(p))}
              footer={<RsvpFooter plan={p} busy={respond.isPending} onRespond={(action) => respond.mutate({ id: p.id, action })} />}
            />
          ))}
        </Section>
      ) : null}
      {later.length > 0 ? (
        <Section title={t('plans.sections.later')} testID="plans-later">
          {later.map((p) => (
            <PlanCard key={`${p.id}:${p.occurrenceOn ?? ''}`} plan={p} onPress={() => router.push(planHref(p))} />
          ))}
        </Section>
      ) : null}
      {pastList.length > 0 ? (
        <Section title={t('plans.sections.past')} testID="plans-past">
          {pastList.map((p) => (
            <PlanCard key={`${p.id}:${p.occurrenceOn ?? ''}`} plan={p} onPress={() => router.push(planHref(p))} />
          ))}
        </Section>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  section: { gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
