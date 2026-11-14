import { CalendarClock, MapPin, Repeat } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { DatePlanSummary, PlanStatus } from '@/api/queries/plans';
import { AppText } from '@/components/AppText';
import { useT } from '@/i18n';
import { usePlanFormat } from '@/plans/usePlanFormat';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing } from '@/theme/tokens';

/** Болзооны төлөвийн тэмдэг (Баталгаажсан / Хариу хүлээж буй …). */
export function StatusPill({ status, testID }: { status: PlanStatus; testID?: string }) {
  const t = useT();
  const colors = useColors();
  const confirmed = status === 'CONFIRMED';
  return (
    <View
      style={[styles.pill, { backgroundColor: confirmed ? colors.primary : colors.surfaceRaised, borderColor: confirmed ? colors.primary : colors.border }]}
      testID={testID}
    >
      <AppText variant="caption" color={confirmed ? 'onPrimary' : 'text'}>
        {t(`plans.status.${status}`)}
      </AppText>
    </View>
  );
}

function occurrenceKey(plan: DatePlanSummary): string {
  return plan.occurrenceOn ? `${plan.id}:${plan.occurrenceOn}` : plan.id;
}

/** Болзооны дэлгэрэнгүй рүү (давталттай бол тухайн тохиолдол). */
export function planHref(plan: Pick<DatePlanSummary, 'id' | 'occurrenceOn'>) {
  return plan.occurrenceOn
    ? ({ pathname: '/plans/[id]', params: { id: plan.id, occurrenceOn: plan.occurrenceOn } } as const)
    : ({ pathname: '/plans/[id]', params: { id: plan.id } } as const);
}

interface Props {
  plan: DatePlanSummary;
  onPress: () => void;
  /** Картын доод хэсэг (RSVP товч г.м.). */
  footer?: ReactNode;
  testID?: string;
}

/** S-50/S-52-ийн болзооны карт: төлөв, гарчиг, цаг (хэрэглэгчийн бүсээр), газар, давталт. */
export function PlanCard({ plan, onPress, footer, testID }: Props) {
  const t = useT();
  const colors = useColors();
  const { when } = usePlanFormat();
  const id = testID ?? `plan-card-${occurrenceKey(plan)}`;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={id}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${plan.title}. ${when(plan.startsAt)}`}
        style={({ pressed }) => [styles.main, { opacity: pressed ? 0.85 : 1 }]}
        testID={`${id}-open`}
      >
        <View style={styles.row}>
          <StatusPill status={plan.status} testID={`${id}-status`} />
          {plan.category ? (
            <AppText variant="caption" color="textMuted">
              {t(`plans.category.${plan.category}`)}
            </AppText>
          ) : null}
        </View>
        <AppText variant="h2">{plan.title}</AppText>
        <View style={styles.row}>
          <CalendarClock size={16} color={colors.textMuted} strokeWidth={iconStroke} />
          <AppText color="textMuted" testID={`${id}-when`}>
            {when(plan.startsAt)}
          </AppText>
        </View>
        {plan.place ? (
          <View style={styles.row}>
            <MapPin size={16} color={colors.textMuted} strokeWidth={iconStroke} />
            <AppText color="textMuted" numberOfLines={1} style={styles.flex}>
              {plan.place.name}
            </AppText>
          </View>
        ) : null}
        {plan.recurrence !== 'NONE' ? (
          <View style={styles.row}>
            <Repeat size={16} color={colors.textMuted} strokeWidth={iconStroke} />
            <AppText variant="caption" color="textMuted">
              {t(`plans.recurrence.${plan.recurrence}`)}
            </AppText>
          </View>
        ) : null}
      </Pressable>
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  main: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  flex: { flex: 1 },
  pill: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
});
