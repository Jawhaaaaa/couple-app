import { router } from 'expo-router';
import { CircleCheck, KeyRound, ScanFace } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { FormMessage } from '@/components/FormMessage';
import { Mascot } from '@/components/Mascot';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';
import { useLockStore } from '@/lock/lockStore';
import { passkeySupported, registerPasskey, removePasskey, verifyPasskey } from '@/lock/passkey';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing } from '@/theme/tokens';

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; error: unknown } | { kind: 'notice'; text: string };

/**
 * S-102 Passkey түгжээ (FR-19.6, AC-157): вэбэд platform authenticator (Face ID / Touch ID / Windows
 * Hello)-оор апп-ын түгжээ тайлах. PIN нь нөөц тул эхлээд S-84-д PIN тохируулсан байх ёстой; дэмжихгүй
 * хөтөчид PIN л. Тохируулах (`registration-options` → `credentials.create` → `/passkeys`), шалгах,
 * устгах. Native-д Face ID / хурууны хээ S-84-д (`expo-local-authentication`).
 */
export default function PasskeyScreen() {
  return <PasskeySettings web={Platform.OS === 'web'} />;
}

export function PasskeySettings({ web }: { web: boolean }) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const { disabled: offline } = useOnlineOnly();
  const lockEnabled = useLockStore((s) => s.enabled);
  const passkeyId = useLockStore((s) => s.passkeyId);
  const [supported, setSupported] = useState<boolean | null>(web ? null : false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (!web) return;
    let alive = true;
    void passkeySupported('web').then((s) => alive && setSupported(s));
    return () => {
      alive = false;
    };
  }, [web]);

  const run = async (action: () => Promise<string | null>) => {
    setStatus({ kind: 'busy' });
    try {
      const text = await action();
      setStatus(text ? { kind: 'notice', text } : { kind: 'idle' });
    } catch (error) {
      setStatus({ kind: 'error', error });
    }
  };

  const register = () =>
    run(async () => {
      await registerPasskey();
      return t('passkey.saved');
    });
  const check = () => run(async () => ((await verifyPasskey()) ? t('passkey.verified') : t('passkey.notVerified')));
  const remove = () =>
    run(async () => {
      await removePasskey();
      setConfirmRemove(false);
      return t('passkey.removed');
    });

  const busy = status.kind === 'busy';
  let body;
  if (!web) {
    body = (
      <Card testID="passkey-native">
        <AppText>{t('passkey.native')}</AppText>
        <AppButton variant="secondary" label={t('passkey.toSecurity')} onPress={() => router.replace('/settings/security')} testID="passkey-to-security" />
      </Card>
    );
  } else if (supported === null) {
    body = <ScreenState kind="loading" rows={2} />;
  } else if (status.kind === 'error' && !passkeyId) {
    // lld S-102 «Алдаа»: «Passkey бүртгэгдсэнгүй» + дахин оролдох
    body = (
      <View style={styles.center} testID="passkey-error">
        <Mascot size={110} pose="tilt" />
        <AppText variant="h3" style={styles.text}>
          {t('passkey.failedTitle')}
        </AppText>
        <AppText color="textMuted" style={styles.text}>
          {t('passkey.failedBody')} {errorText(status.error)}
        </AppText>
        <AppButton label={t('common.retry')} onPress={() => void register()} disabled={offline} testID="passkey-retry" />
      </View>
    );
  } else {
    body = (
      <>
        <View style={styles.center}>
          <View style={[styles.bigIcon, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <ScanFace size={40} color={colors.primary} strokeWidth={iconStroke} />
          </View>
          <AppText variant="h3" style={styles.text}>
            {t('passkey.heading')}
          </AppText>
          <AppText color="textMuted" style={styles.text}>
            {t('passkey.intro')}
          </AppText>
        </View>

        <Card testID="passkey-pin-row">
          <View style={styles.row}>
            <KeyRound size={20} color={colors.primary} strokeWidth={iconStroke} />
            <AppText variant="label" style={styles.flex}>
              {t('passkey.pinBackup')}
            </AppText>
            <AppText color={lockEnabled ? 'text' : 'textMuted'}>{lockEnabled ? t('passkey.pinSet') : t('passkey.pinNotSet')}</AppText>
          </View>
          {!lockEnabled ? (
            <AppButton variant="secondary" label={t('passkey.setPinFirst')} onPress={() => router.push('/settings/security')} testID="passkey-set-pin" />
          ) : null}
        </Card>

        {!supported ? <FormMessage kind="info" text={t('passkey.unsupported')} testID="passkey-unsupported" /> : null}

        {supported && lockEnabled && !passkeyId ? (
          <AppButton label={t('passkey.setup')} onPress={() => void register()} loading={busy} disabled={offline} testID="passkey-setup" />
        ) : null}

        {supported && passkeyId ? (
          <Card testID="passkey-enabled">
            <View style={styles.row}>
              <CircleCheck size={20} color={colors.success} strokeWidth={iconStroke} />
              <AppText variant="label" style={styles.flex}>
                {t('passkey.enabled')}
              </AppText>
            </View>
            <AppButton variant="secondary" label={t('passkey.test')} onPress={() => void check()} loading={busy} disabled={offline} testID="passkey-test" />
            <AppButton variant="ghost" label={t('passkey.remove')} onPress={() => setConfirmRemove(true)} disabled={offline || busy} testID="passkey-remove" />
          </Card>
        ) : null}

        {offline ? <FormMessage kind="info" text={t('passkey.offline')} testID="passkey-offline" /> : null}
        {status.kind === 'notice' ? <FormMessage kind="success" text={status.text} testID="passkey-notice" /> : null}
        {status.kind === 'error' ? <FormMessage text={errorText(status.error)} testID="passkey-action-error" /> : null}
      </>
    );
  }

  return (
    <StackScreen title={t('passkey.title')} testID="screen-S-102">
      <ScrollView contentContainerStyle={styles.body}>{body}</ScrollView>
      <ConfirmSheet
        visible={confirmRemove}
        title={t('passkey.removeTitle')}
        body={t('passkey.removeBody')}
        confirmLabel={t('passkey.remove')}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
        loading={busy}
        testID="passkey-remove-confirm"
      />
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.md, width: '100%', maxWidth: 560, alignSelf: 'center' },
  center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  text: { textAlign: 'center' },
  bigIcon: { width: 88, height: 88, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
