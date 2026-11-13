import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Smartphone } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { api, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { FormMessage } from '@/components/FormMessage';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { formatDateLong, formatTime, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, spacing, touchTarget } from '@/theme/tokens';

export type DeviceSession = components['schemas']['DeviceSession'];
export const SESSIONS_KEY = ['sessions'] as const;

export function listSessions(): Promise<DeviceSession[]> {
  return unwrap(api.GET('/me/sessions'));
}

export async function revokeSession(sessionId: string): Promise<void> {
  await unwrap(api.DELETE('/me/sessions/{sessionId}', { params: { path: { sessionId } } }));
}

/** «Бүх төхөөрөмжөөс гарах» — `requirePassword` бол алсаас түгжих (GAP-24): дараагийн нэвтрэлтэд нууц үг. */
export async function revokeAllSessions(requirePassword: boolean): Promise<void> {
  await unwrap(api.POST('/me/sessions/revoke-all', { body: { requirePassword } }));
}

/**
 * S-84-ийн «Идэвхтэй төхөөрөмжүүд» (FR-14.3, FR-14.4, AC-56, AC-125): төхөөрөмж, сүүлд ашигласан
 * цаг; бусдыг алсаас гаргах; бүгдээс гарах (утас алдагдсан үед вэбээс — апп-ыг алсаас түгжих).
 * `session.revoked` realtime үйл явдал жагсаалтыг шинэчилнэ.
 */
export function DeviceSessions() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const sessions = useQuery({ queryKey: SESSIONS_KEY, queryFn: listSessions });
  const [confirmAll, setConfirmAll] = useState(false);
  const [requirePassword, setRequirePassword] = useState(true);

  const revoke = useMutation({
    mutationFn: revokeSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
  const revokeAll = useMutation({
    mutationFn: () => revokeAllSessions(requirePassword),
    onSuccess: async () => {
      setConfirmAll(false);
      // Энэ төхөөрөмж ч гарна — дараагийн хүсэлт 401 → S-03
      await api.signOut();
    },
  });

  return (
    <Card testID="device-sessions">
      <AppText variant="h3" accessibilityRole="header">
        {t('devices.title')}
      </AppText>
      {sessions.isPending ? <AppText color="textMuted">{t('common.loading')}</AppText> : null}
      {sessions.isError ? <FormMessage text={errorText(sessions.error)} testID="devices-error" /> : null}
      {sessions.data?.map((s) => {
        const Icon = s.platform === 'WEB' ? Globe : Smartphone;
        const last = new Date(s.lastUsedAt);
        return (
          <View key={s.id} style={styles.row} testID={`device-${s.id}`}>
            <Icon size={22} color={colors.primary} strokeWidth={iconStroke} />
            <View style={styles.flex}>
              <AppText>
                {s.deviceName}
                {s.current ? ` · ${t('devices.thisDevice')}` : ''}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {t('devices.lastUsed', { date: formatDateLong(last, locale), time: formatTime(last, locale) })}
              </AppText>
            </View>
            {!s.current ? (
              <Pressable
                onPress={() => revoke.mutate(s.id)}
                disabled={offline || revoke.isPending}
                accessibilityRole="button"
                accessibilityLabel={t('devices.signOutDevice', { name: s.deviceName })}
                style={styles.action}
                testID={`device-revoke-${s.id}`}
              >
                <AppText variant="label" color="danger">
                  {t('devices.signOut')}
                </AppText>
              </Pressable>
            ) : null}
          </View>
        );
      })}
      <AppButton variant="secondary" label={t('devices.signOutAll')} onPress={() => setConfirmAll(true)} disabled={offline} testID="devices-revoke-all" />
      {revoke.error || revokeAll.error ? <FormMessage text={errorText(revoke.error ?? revokeAll.error)} testID="devices-action-error" /> : null}
      <ConfirmSheet
        visible={confirmAll}
        title={t('devices.confirmTitle')}
        body={t('devices.confirmBody')}
        confirmLabel={t('devices.signOutAll')}
        onConfirm={() => revokeAll.mutate()}
        onCancel={() => setConfirmAll(false)}
        loading={revokeAll.isPending}
        testID="devices-confirm"
      >
        <View style={styles.row}>
          <AppText style={styles.flex}>{t('devices.requirePassword')}</AppText>
          <Switch
            value={requirePassword}
            onValueChange={setRequirePassword}
            accessibilityLabel={t('devices.requirePassword')}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={colors.surface}
            testID="devices-require-password"
          />
        </View>
      </ConfirmSheet>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touchTarget },
  flex: { flex: 1 },
  action: { minHeight: touchTarget, justifyContent: 'center', paddingHorizontal: spacing.xs },
});
