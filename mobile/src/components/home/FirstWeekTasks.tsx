import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FIRST_WEEK_KEY, type FirstWeekState, hideFirstWeek, setFirstWeekTaskStatus, useFirstWeek } from '@/api/queries/firstWeek';
import { PREFERENCES_KEY } from '@/api/queries/settings';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/FormMessage';
import { FIRST_WEEK_DAYS, firstWeekAction, firstWeekContent } from '@/domain/firstWeek';
import { useErrorText } from '@/hooks/useErrorText';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useT } from '@/i18n';
import { playHaptic } from '@/motion/haptics';
import { sendSignal } from '@/signals/sendSignal';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, spacing } from '@/theme/tokens';

/**
 * S-20 «Эхний 7 хоног» карт (FR-16.4, AC-134): `GET /me/first-week-tasks`-ийн өнөөдрийн НЭГ даалгавар
 * (`first-week.json`), товч нь холбогдох үүсгэх дэлгэц рүү (fw-3 — нүүрнээс шууд зүрх). «Болсон» → ✨,
 * «Алгасах» → өнөөдрийнх алга (маргааш дараагийнх), «Нуух» → `firstWeekHidden` (бүр мөсөн). 8 дахь өдөр,
 * хосгүй эсвэл нуусан бол сервер `visible = false` буцааж карт гарахгүй. Хуурамч өгөгдөл үүсгэхгүй.
 */
export function FirstWeekTasks({ partnerName }: { partnerName: string }) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const { offline } = useNetworkStatus();
  const queryClient = useQueryClient();
  const query = useFirstWeek();
  const [justDone, setJustDone] = useState(false);

  const status = useMutation({
    mutationFn: ({ key, value }: { key: string; value: 'DONE' | 'SKIPPED' }) => setFirstWeekTaskStatus(key, value),
    onSuccess: (state, { value }) => {
      queryClient.setQueryData<FirstWeekState>(FIRST_WEEK_KEY, state);
      if (value === 'DONE') {
        setJustDone(true);
        playHaptic('ANIM-20');
      }
    },
  });
  const hide = useMutation({
    mutationFn: hideFirstWeek,
    onSuccess: (prefs) => {
      queryClient.setQueryData(PREFERENCES_KEY, prefs);
      queryClient.setQueryData<FirstWeekState>(FIRST_WEEK_KEY, (s) => (s ? { ...s, visible: false, today: null } : s));
    },
  });
  const heart = useMutation({
    mutationFn: async (key: string) => {
      playHaptic('ANIM-01');
      const outcome = await sendSignal({ kind: 'HEART' }, { offline });
      if (outcome.status === 'failed') throw outcome.error;
      return key;
    },
    // Зүрх явсан (эсвэл outbox-д) бол даалгавар биелсэн
    onSuccess: (key) => status.mutate({ key, value: 'DONE' }),
  });

  const state = query.data;
  const task = state?.visible ? state.today : null;
  if (!task || task.status === 'SKIPPED') return null;
  const content = firstWeekContent(task.taskKey, locale, partnerName);
  if (!content) return null;
  const action = firstWeekAction(task.taskKey);
  const done = task.status === 'DONE';
  const busy = status.isPending || hide.isPending || heart.isPending;
  const error = status.error ?? hide.error ?? heart.error;

  return (
    <Card testID="first-week">
      <View style={styles.header}>
        <Sparkles size={20} color={colors.primary} strokeWidth={iconStroke} />
        <AppText variant="label" color="textMuted" style={styles.flex} testID="first-week-day">
          {t('firstWeek.day', { day: task.day, total: FIRST_WEEK_DAYS })}
        </AppText>
      </View>
      <AppText variant="h3" accessibilityRole="header" testID="first-week-title">
        {content.title}
      </AppText>
      {done ? (
        <AppText testID="first-week-done" accessibilityLiveRegion="polite">
          {justDone ? t('firstWeek.doneNow') : t('firstWeek.doneToday')}
        </AppText>
      ) : (
        <>
          <AppText color="textMuted" testID="first-week-body">
            {content.body}
          </AppText>
          {action?.kind === 'route' ? (
            <AppButton label={t('firstWeek.start')} onPress={() => router.push(action.href)} disabled={busy} testID="first-week-start" />
          ) : null}
          {action?.kind === 'heart' ? (
            <AppButton label={t('firstWeek.sendHeart')} onPress={() => heart.mutate(task.taskKey)} loading={heart.isPending} disabled={busy} testID="first-week-heart" />
          ) : null}
          <View style={styles.row}>
            <AppButton
              variant="secondary"
              label={t('firstWeek.markDone')}
              onPress={() => status.mutate({ key: task.taskKey, value: 'DONE' })}
              disabled={busy}
              testID="first-week-done-button"
              style={styles.flex}
            />
            <AppButton
              variant="ghost"
              label={t('firstWeek.skip')}
              onPress={() => status.mutate({ key: task.taskKey, value: 'SKIPPED' })}
              disabled={busy}
              testID="first-week-skip"
              style={styles.flex}
            />
          </View>
        </>
      )}
      {error ? <FormMessage text={errorText(error)} testID="first-week-error" /> : null}
      <AppButton variant="ghost" label={t('firstWeek.hide')} onPress={() => hide.mutate()} disabled={busy} testID="first-week-hide" />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.xs },
  flex: { flex: 1 },
});
