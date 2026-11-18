import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { DASHBOARD_KEY } from '@/api/queries/dashboard';
import {
  disableQuietMode,
  enableQuietMode,
  fetchNotificationSettings,
  groupEnabled,
  LOCAL_TIME_RE,
  NOTIFICATION_GROUPS,
  NOTIFICATION_SETTINGS_KEY,
  type NotificationSettings,
  saveNotificationSettings,
  toggleGroup,
} from '@/api/queries/notifications';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { FormMessage } from '@/components/FormMessage';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { TextField } from '@/components/TextField';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { spacing, touchTarget } from '@/theme/tokens';

/** «Түр тайван байх»-ын сонголт (минут): 1 цаг, 1 өдөр, 7 хоног (FR-13.7). */
export const QUIET_OPTIONS = [60, 24 * 60, 7 * 24 * 60] as const;

function Toggle({ label, hint, value, onChange, disabled, testID }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; testID: string }) {
  const colors = useColors();
  return (
    <View style={styles.toggle}>
      <View style={styles.flex}>
        <AppText>{label}</AppText>
        {hint ? (
          <AppText variant="caption" color="textMuted">
            {hint}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ true: colors.primary, false: colors.border }}
        thumbColor={colors.surface}
        testID={testID}
      />
    </View>
  );
}

/**
 * S-83 Мэдэгдэл (FR-13.2, 13.3, 13.5, 13.7): төрөл бүрийг (бүлгээр) асаах/унтраах (AC-119), «Бүү саад
 * бол» хуваарь (анхдагч 23:00–07:00, өөрийн бүсээр, AC-48), түгжээтэй дэлгэцэд агуулга нуух (AC-49),
 * өглөө/оройн мэндчилгээ (AC-121), «Түр тайван байх» (AC-123). Апп доторх жагсаалт үргэлж бичигдэнэ.
 */
export default function NotificationSettingsScreen() {
  const t = useT();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const settings = useQuery({ queryKey: NOTIFICATION_SETTINGS_KEY, queryFn: fetchNotificationSettings });
  const [times, setTimes] = useState<Partial<Record<'dndStart' | 'dndEnd' | 'greetingMorningAt' | 'greetingEveningAt', string>>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: saveNotificationSettings,
    onMutate: (next) => {
      const previous = queryClient.getQueryData<NotificationSettings>(NOTIFICATION_SETTINGS_KEY);
      queryClient.setQueryData(NOTIFICATION_SETTINGS_KEY, next);
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous && queryClient.setQueryData(NOTIFICATION_SETTINGS_KEY, ctx.previous),
    onSuccess: (data) => queryClient.setQueryData(NOTIFICATION_SETTINGS_KEY, data),
  });
  const quiet = useMutation({
    mutationFn: (minutes: number | null) => (minutes ? enableQuietMode(minutes).then(() => undefined) : disableQuietMode()),
    onSuccess: (_d, minutes) => {
      setNotice(minutes ? t('notificationSettings.quiet.on') : t('notificationSettings.quiet.off'));
      void queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
  });

  if (settings.isPending) return wrap(<ScreenState kind="loading" rows={4} />);
  if (!settings.data) return wrap(<ScreenState kind="error" message={errorText(settings.error)} onRetry={() => void settings.refetch()} />);
  const s = settings.data;
  const update = (patch: Partial<NotificationSettings>) => save.mutate({ ...s, ...patch });

  const timeField = (key: 'dndStart' | 'dndEnd' | 'greetingMorningAt' | 'greetingEveningAt', label: string) => {
    const draft = times[key] ?? s[key];
    const invalid = !LOCAL_TIME_RE.test(draft);
    return (
      <View style={styles.flex}>
        <TextField
          label={label}
          value={draft}
          onChangeText={(v) => setTimes((prev) => ({ ...prev, [key]: v }))}
          onBlur={() => {
            if (!invalid && draft !== s[key]) update({ [key]: draft });
          }}
          placeholder="23:00"
          maxLength={5}
          keyboardType="numbers-and-punctuation"
          error={invalid ? t('notificationSettings.timeInvalid') : null}
          editable={!offline}
          testID={`notif-${key}`}
        />
      </View>
    );
  };

  function wrap(node: ReactNode) {
    return (
      <StackScreen title={t('notificationSettings.title')} testID="screen-S-83">
        {node}
      </StackScreen>
    );
  }

  return wrap(
    <ScrollView contentContainerStyle={styles.body}>
      <Card testID="notif-types">
        <AppText variant="h3" accessibilityRole="header">
          {t('notificationSettings.types.title')}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {t('notificationSettings.types.note')}
        </AppText>
        {NOTIFICATION_GROUPS.map((g) => (
          <Toggle
            key={g.key}
            label={t(`notificationSettings.types.${g.key}`)}
            value={groupEnabled(s, g.types)}
            onChange={(v) => save.mutate(toggleGroup(s, g.types, v))}
            disabled={offline}
            testID={`notif-type-${g.key}`}
          />
        ))}
      </Card>

      <Card testID="notif-dnd">
        <AppText variant="h3" accessibilityRole="header">
          {t('notificationSettings.dnd.title')}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {t('notificationSettings.dnd.note')}
        </AppText>
        <View style={styles.row}>
          {timeField('dndStart', t('notificationSettings.dnd.start'))}
          {timeField('dndEnd', t('notificationSettings.dnd.end'))}
        </View>
      </Card>

      <Card testID="notif-privacy">
        <Toggle
          label={t('notificationSettings.hideContent.label')}
          hint={t('notificationSettings.hideContent.hint')}
          value={s.hideContent}
          onChange={(v) => update({ hideContent: v })}
          disabled={offline}
          testID="notif-hide-content"
        />
      </Card>

      <Card testID="notif-greetings">
        <AppText variant="h3" accessibilityRole="header">
          {t('notificationSettings.greetings.title')}
        </AppText>
        <Toggle label={t('notificationSettings.greetings.morning')} value={s.greetingMorning} onChange={(v) => update({ greetingMorning: v })} disabled={offline} testID="notif-greeting-morning" />
        {s.greetingMorning ? timeField('greetingMorningAt', t('notificationSettings.greetings.morningAt')) : null}
        <Toggle label={t('notificationSettings.greetings.evening')} value={s.greetingEvening} onChange={(v) => update({ greetingEvening: v })} disabled={offline} testID="notif-greeting-evening" />
        {s.greetingEvening ? timeField('greetingEveningAt', t('notificationSettings.greetings.eveningAt')) : null}
      </Card>

      <Card testID="notif-quiet">
        <AppText variant="h3" accessibilityRole="header">
          {t('notificationSettings.quiet.title')}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {t('notificationSettings.quiet.note')}
        </AppText>
        <View style={styles.chips}>
          {QUIET_OPTIONS.map((m) => (
            <Chip key={m} label={t(`notificationSettings.quiet.option.${m}`)} onPress={() => quiet.mutate(m)} disabled={offline || quiet.isPending} testID={`notif-quiet-${m}`} />
          ))}
        </View>
        <AppButton variant="ghost" label={t('notificationSettings.quiet.stop')} onPress={() => quiet.mutate(null)} disabled={offline || quiet.isPending} testID="notif-quiet-stop" />
      </Card>

      <AppButton variant="secondary" label={t('notificationSettings.push')} onPress={() => router.push('/push-permission')} testID="notif-push" />
      {notice ? <FormMessage kind="success" text={notice} testID="notif-notice" /> : null}
      {save.error || quiet.error ? <FormMessage text={errorText(save.error ?? quiet.error)} testID="notif-error" /> : null}
    </ScrollView>,
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.md },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touchTarget },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
