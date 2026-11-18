import { router } from 'expo-router';
import { Gift, Images, Plus, Repeat, Sparkles } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useOccasions } from '@/api/queries/anniversaries';
import { AppText } from '@/components/AppText';
import { MilestoneHorizon, occasionHref, useCountdownText } from '@/components/occasions/MilestoneHorizon';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { emptyStateText } from '@/content/emptyStates';
import { occasionCountdown } from '@/domain/occasionCountdown';
import { useErrorText } from '@/hooks/useErrorText';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { compareCalendarDates, formatDate, todayIn, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

/**
 * S-61 тэмдэглэлт өдрүүд (FR-8.1…8.3): автомат ой (100, 365… хоног, жилийн ой, төрсөн өдөр) ба
 * өөрсдийн нэмсэн өдөр, төрөлтэйгөө (AC-181); «N хоног үлдлээ / N хоногийн өмнө» хэрэглэгчийн
 * бүсээр (AC-103). Дээр нь Milestone Horizon.
 */
export default function OccasionsScreen() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  const tz = useUserTimezone();
  const countdownText = useCountdownText();
  const occasions = useOccasions(tz);
  const today = todayIn(tz);

  let body;
  if (occasions.isError && !occasions.data) body = <ScreenState kind="error" message={errorText(occasions.error)} onRetry={() => void occasions.refetch()} />;
  else if (occasions.isPending) body = <ScreenState kind="loading" rows={4} />;
  else if (occasions.data.length === 0) {
    const empty = emptyStateText('S-61', locale);
    body = <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => router.push('/together/occasions/edit')} />;
  } else {
    const sorted = [...occasions.data].sort((a, b) => compareCalendarDates(a.nextOn, b.nextOn));
    body = (
      <>
        <MilestoneHorizon />
        {sorted.map((o) => {
          const Icon = o.kind === 'BIRTHDAY' ? Gift : Sparkles;
          const left = countdownText(occasionCountdown(o, today));
          return (
            <Pressable
              key={o.occasionKey}
              onPress={() => router.push(occasionHref(o))}
              accessibilityRole="button"
              accessibilityLabel={`${o.title}. ${t(`occasions.kind.${o.kind}`)}. ${left}`}
              testID={`occasion-${o.occasionKey}`}
              style={({ pressed }) => [styles.item, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
            >
              <View style={[styles.icon, { backgroundColor: colors.surfaceRaised }]}>
                <Icon size={20} color={colors.primary} strokeWidth={iconStroke} />
              </View>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{o.title}</AppText>
                <AppText variant="caption" color="textMuted" testID={`occasion-kind-${o.occasionKey}`}>
                  {t(`occasions.kind.${o.kind}`)} · {formatDate(o.nextOn, dateFormat)}
                </AppText>
                <View style={styles.meta}>
                  {o.recurring ? <Repeat size={14} color={colors.textMuted} strokeWidth={iconStroke} /> : null}
                  {o.memoryCount > 0 ? (
                    <>
                      <Images size={14} color={colors.textMuted} strokeWidth={iconStroke} />
                      <AppText variant="caption" color="textMuted">
                        {t('occasions.memoryCount', { count: o.memoryCount })}
                      </AppText>
                    </>
                  ) : null}
                </View>
              </View>
              <AppText variant="label" testID={`occasion-left-${o.occasionKey}`}>
                {left}
              </AppText>
            </Pressable>
          );
        })}
      </>
    );
  }

  return (
    <StackScreen title={t('occasions.title')} testID="screen-S-61">
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.top}>
          <Pressable
            onPress={() => router.push('/together/occasions/edit')}
            accessibilityRole="button"
            accessibilityLabel={t('occasions.add')}
            testID="occasions-add"
            style={({ pressed }) => [styles.add, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Plus size={18} color={colors.onPrimary} strokeWidth={iconStroke} />
            <AppText variant="label" color="onPrimary">
              {t('occasions.add')}
            </AppText>
          </Pressable>
        </View>
        {body}
      </ScrollView>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.sm, paddingBottom: spacing.xxl },
  top: { flexDirection: 'row', justifyContent: 'flex-end' },
  add: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, paddingHorizontal: spacing.md, borderRadius: radius.pill },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.card, padding: spacing.md },
  icon: { width: touchTarget, height: touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
});
