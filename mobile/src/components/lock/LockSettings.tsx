import * as LocalAuthentication from 'expo-local-authentication';
import { type ReactNode, useEffect, useState } from 'react';
import { Platform, StyleSheet, Switch, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { FormMessage } from '@/components/FormMessage';
import { TextField } from '@/components/TextField';
import { useT } from '@/i18n';
import { LOCK_TIMEOUTS, RESET_ATTEMPTS, validPin } from '@/lock/lockPolicy';
import { readPinSecret, writePinSecret } from '@/lock/lockSecret';
import { useLockStore } from '@/lock/lockStore';
import { createPinSecret, verifyPin } from '@/lock/pinHash';
import { useColors } from '@/theme/ThemeProvider';
import { spacing, touchTarget } from '@/theme/tokens';

type Step = { kind: 'idle' } | { kind: 'enter'; replacing: boolean } | { kind: 'confirm'; first: string; replacing: boolean } | { kind: 'disable' };

/**
 * S-84-ийн түгжээний хэсэг (FR-14.1): PIN (4–6) тохируулах/солих (хоёр удаа оруулна), хугацаа
 * (шууд/1/5/15 мин), биометр (native — төхөөрөмжид бүртгэлтэй бол), унтраах (одоогийн PIN-ээр),
 * «Одоо түгжих».
 */
export function LockSettings({ passkeySlot }: { passkeySlot?: ReactNode }) {
  const t = useT();
  const colors = useColors();
  const lock = useLockStore();
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bioAvailable, setBioAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let alive = true;
    void Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()])
      .then(([h, e]) => alive && setBioAvailable(h && e))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const reset = (note: string | null = null) => {
    setStep({ kind: 'idle' });
    setValue('');
    setError(null);
    setNotice(note);
  };

  const next = async () => {
    setError(null);
    if (step.kind === 'enter') {
      if (!validPin(value)) return setError(t('lock.settings.pinRule'));
      setStep({ kind: 'confirm', first: value, replacing: step.replacing });
      setValue('');
    } else if (step.kind === 'confirm') {
      if (value !== step.first) {
        setStep({ kind: 'enter', replacing: step.replacing });
        setValue('');
        return setError(t('lock.settings.mismatch'));
      }
      await writePinSecret(createPinSecret(value));
      lock.set({ enabled: true, pinLength: value.length, locked: false, ...RESET_ATTEMPTS });
      reset(t('lock.settings.saved'));
    } else if (step.kind === 'disable') {
      const secret = await readPinSecret();
      if (!secret || !verifyPin(value, secret)) {
        setValue('');
        return setError(t('lock.wrong'));
      }
      await writePinSecret(null);
      lock.set({ enabled: false, biometric: false, locked: false, ...RESET_ATTEMPTS });
      reset(t('lock.settings.disabled'));
    }
  };

  const pinField = (label: string) => (
    <>
      <TextField
        label={label}
        value={value}
        onChangeText={(v) => setValue(v.replace(/\D/g, '').slice(0, 6))}
        secure
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
        onSubmitEditing={() => void next()}
        error={error}
        testID="lock-pin-input"
      />
      <View style={styles.row}>
        <AppButton label={t('common.next')} onPress={() => void next()} disabled={value.length < 4} testID="lock-pin-next" />
        <AppButton variant="ghost" label={t('common.cancel')} onPress={() => reset()} testID="lock-pin-cancel" />
      </View>
    </>
  );

  return (
    <Card testID="lock-settings">
      <AppText variant="h3" accessibilityRole="header">
        {t('lock.settings.title')}
      </AppText>
      <AppText variant="caption" color="textMuted">
        {t('lock.settings.note')}
      </AppText>
      {step.kind === 'enter' ? pinField(step.replacing ? t('lock.settings.newPin') : t('lock.settings.pin')) : null}
      {step.kind === 'confirm' ? pinField(t('lock.settings.confirmPin')) : null}
      {step.kind === 'disable' ? pinField(t('lock.settings.currentPin')) : null}
      {step.kind === 'idle' && !lock.enabled ? (
        <AppButton label={t('lock.settings.enable')} onPress={() => setStep({ kind: 'enter', replacing: false })} testID="lock-enable" />
      ) : null}
      {step.kind === 'idle' && lock.enabled ? (
        <>
          <AppText variant="label">{t('lock.settings.timeout')}</AppText>
          <View style={styles.chips}>
            {LOCK_TIMEOUTS.map((sec) => (
              <Chip key={sec} label={t(`lock.settings.after.${sec}`)} selected={lock.timeoutSec === sec} onPress={() => lock.set({ timeoutSec: sec })} testID={`lock-timeout-${sec}`} />
            ))}
          </View>
          {bioAvailable ? (
            <View style={styles.toggle}>
              <AppText style={styles.flex}>{t('lock.settings.biometric')}</AppText>
              <Switch
                value={lock.biometric}
                onValueChange={(v) => lock.set({ biometric: v })}
                accessibilityLabel={t('lock.settings.biometric')}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor={colors.surface}
                testID="lock-biometric-toggle"
              />
            </View>
          ) : null}
          {passkeySlot}
          <View style={styles.row}>
            <AppButton variant="secondary" label={t('lock.settings.change')} onPress={() => setStep({ kind: 'enter', replacing: true })} testID="lock-change" />
            <AppButton variant="secondary" label={t('lock.settings.lockNow')} onPress={() => lock.set({ locked: true })} testID="lock-now" />
          </View>
          <AppButton variant="ghost" label={t('lock.settings.disable')} onPress={() => setStep({ kind: 'disable' })} testID="lock-disable" />
        </>
      ) : null}
      {notice ? <FormMessage kind="success" text={notice} testID="lock-notice" /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  toggle: { flexDirection: 'row', alignItems: 'center', minHeight: touchTarget },
  flex: { flex: 1 },
});
