import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useSyncExternalStore } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { profileVersion, updateMe } from '@/api/queries/auth';
import { useMeQuery } from '@/api/queries/bootstrap';
import { deviceTimezone } from '@/auth/device';
import { timezoneToAsk } from '@/auth/timezonePrompt';
import { useT } from '@/i18n';
import { useSessionStore } from '@/stores/sessionStore';
import { useTimezonePromptStore } from '@/stores/timezonePromptStore';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { FormMessage } from './FormMessage';

const persistApi = useTimezonePromptStore.persist;
const subscribeHydration = (cb: () => void) => persistApi.onFinishHydration(cb);
const isHydrated = () => persistApi.hasHydrated();

/**
 * AC-64: төхөөрөмжийн бүс профайлынхаас өөр бол «Цагийн бүсээ Asia/Tokyo болгох
 * уу?» нэг удаа. Зөвшөөрвөл `PATCH /me {timezone, version}`; хариулсан бүсийг
 * `timezonePromptStore` санана. Хадгалж чадаагүй бол алдааг харуулж, хаахыг зөвшөөрнө.
 */
export function TimezonePrompt() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const me = useMeQuery().data;
  const hydrated = useSyncExternalStore(subscribeHydration, isHydrated, isHydrated);
  const answeredZones = useTimezonePromptStore((s) => s.answeredZones);
  const markAnswered = useTimezonePromptStore((s) => s.markAnswered);
  const [deviceZone] = useState(deviceTimezone);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (zone: string) => updateMe({ timezone: zone, version: me ? profileVersion(me) : 0 }),
    onSuccess: (updated, zone) => {
      queryClient.setQueryData(['me'], updated);
      markAnswered(zone);
    },
  });

  const ready = hydrated && !!accessToken && !!me && me.emailVerified && !me.policyUpdateRequired;
  const zone = ready ? timezoneToAsk({ deviceZone, profileZone: me.timezone, answeredZones }) : null;
  if (!zone || !me) return null;
  return (
    <TimezonePromptView
      zone={zone}
      current={me.timezone}
      pending={mutation.isPending}
      error={mutation.error}
      onAccept={() => mutation.mutate(zone)}
      onDecline={() => markAnswered(zone)}
    />
  );
}

interface ViewProps {
  zone: string;
  current: string;
  pending: boolean;
  error: unknown;
  onAccept: () => void;
  onDecline: () => void;
}

export function TimezonePromptView({ zone, current, pending, error, onAccept, onDecline }: ViewProps) {
  const colors = useColors();
  const t = useT();
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onDecline}>
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <View
          style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
          accessibilityViewIsModal
          testID="timezone-prompt"
        >
          <AppText variant="h3" accessibilityRole="header">
            {t('timezone.prompt', { zone })}
          </AppText>
          <AppText color="textMuted">{t('timezone.body', { current })}</AppText>
          {error ? <FormMessage text={t('timezone.failed')} testID="timezone-error" /> : null}
          <AppButton label={t('timezone.accept')} onPress={onAccept} loading={pending} testID="timezone-accept" />
          <AppButton variant="ghost" label={t('timezone.decline')} onPress={onDecline} disabled={pending} testID="timezone-decline" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  card: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.card,
  },
});
