import { router } from 'expo-router';
import { HeartCrack, RotateCcw } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ApiRequestError } from '@/api/client';
import { daysLeft, readOnlyDeadline, useBreakupMutations } from '@/api/queries/couple';
import { type Couple, partnerName, useCoupleQuery } from '@/api/queries/pairing';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/FormMessage';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { TextField } from '@/components/TextField';
import { useErrorText } from '@/hooks/useErrorText';
import { useNow } from '@/hooks/useNow';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, spacing } from '@/theme/tokens';

type Step = 'warn' | 'confirm' | 'export';

/** 400 `VALIDATION_FAILED` + `fieldErrors[password]` — нууц үг буруу (`CoupleBreakupService`). */
function isWrongPassword(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 400 && (error.body?.fieldErrors ?? []).some((f) => f.field === 'password');
}

/**
 * S-86 Хосоо салгах (FR-14.6, AC-185, AC-127): 1 анхааруулга (1 дэх баталгаажуулалт) → 2 нууц үгтэй
 * сүүлийн баталгаажуулалт → 3 экспортын санал (S-85). Тасарсан (`BREAKING`) үед 14 хоногийн төлөв:
 * үлдсэн хоног, зөвхөн харах/экспорт, «Сэргээх» — хоёулаа батлах ёстой, нэг нь баталсан төлөвтэй.
 * Сервер шууд хариу шаарддаг тул offline-д товчнууд идэвхгүй.
 */
export default function BreakupScreen() {
  const t = useT();
  const couple = useCoupleQuery();

  let body;
  if (couple.isPending) body = <ScreenState kind="loading" rows={3} />;
  else if (couple.isError || !couple.data) body = <ScreenState kind="error" onRetry={() => void couple.refetch()} />;
  else body = <BreakupBody couple={couple.data} />;

  return (
    <StackScreen title={t('breakup.title')} testID="screen-S-86">
      {body}
    </StackScreen>
  );
}

function BreakupBody({ couple }: { couple: Couple }) {
  const t = useT();
  const { disabled: offline } = useOnlineOnly();
  const [step, setStep] = useState<Step>('warn');
  const { restore } = useBreakupMutations();
  const partner = partnerName(couple) ?? t('breakup.partnerFallback');
  const restored = restore.data?.status === 'ACTIVE' && couple.status === 'ACTIVE';

  let content;
  if (step === 'export') content = <ExportOffer onLater={() => setStep('warn')} />;
  else if (restored) content = <FormMessage kind="success" text={t('breakup.restored')} testID="breakup-restored" />;
  else if (couple.status === 'BREAKING') content = <BreakingState couple={couple} partner={partner} offline={offline} restore={restore} />;
  else if (couple.status === 'ORPHANED') content = <FormMessage kind="info" text={t('breakup.orphaned')} testID="breakup-orphaned" />;
  else if (couple.kind !== 'COUPLE' || couple.status !== 'ACTIVE') content = <FormMessage kind="info" text={t('breakup.notPaired')} testID="breakup-not-paired" />;
  else if (step === 'confirm') content = <ConfirmStep offline={offline} onDone={() => setStep('export')} />;
  else content = <WarnStep partner={partner} onContinue={() => setStep('confirm')} />;

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      {offline ? <FormMessage kind="info" text={t('breakup.offline')} testID="breakup-offline" /> : null}
      {content}
    </ScrollView>
  );
}

function StepLabel({ step }: { step: 1 | 2 | 3 }) {
  const t = useT();
  return (
    <AppText variant="label" color="textMuted" testID={`breakup-step-${step}`}>
      {t('breakup.step', { step })}
    </AppText>
  );
}

function WarnStep({ partner, onContinue }: { partner: string; onContinue: () => void }) {
  const t = useT();
  const colors = useColors();
  return (
    <Card testID="breakup-warn">
      <StepLabel step={1} />
      <View style={styles.row}>
        <HeartCrack size={22} color={colors.danger} strokeWidth={iconStroke} />
        <AppText variant="h3" accessibilityRole="header" style={styles.flex}>
          {t('breakup.warnTitle')}
        </AppText>
      </View>
      <AppText>{t('breakup.warnBody')}</AppText>
      <AppText>{t('breakup.warnRestore')}</AppText>
      <AppText>{t('breakup.warnPurge')}</AppText>
      <AppText color="textMuted">{t('breakup.warnPartner', { partner })}</AppText>
      <AppButton label={t('breakup.continue')} onPress={onContinue} testID="breakup-continue" />
      <AppButton variant="ghost" label={t('common.cancel')} onPress={() => router.back()} testID="breakup-cancel" />
    </Card>
  );
}

function ConfirmStep({ offline, onDone }: { offline: boolean; onDone: () => void }) {
  const t = useT();
  const errorText = useErrorText();
  const { breakup } = useBreakupMutations();
  const [password, setPassword] = useState('');
  const wrong = isWrongPassword(breakup.error);
  return (
    <Card testID="breakup-confirm-step">
      <StepLabel step={2} />
      <AppText variant="h3" accessibilityRole="header">
        {t('breakup.confirmTitle')}
      </AppText>
      <AppText>{t('breakup.confirmBody')}</AppText>
      <TextField
        label={t('breakup.password')}
        value={password}
        onChangeText={setPassword}
        secure
        autoComplete="current-password"
        hint={t('breakup.passwordHint')}
        error={wrong ? t('breakup.passwordWrong') : null}
        testID="breakup-password"
      />
      {breakup.error && !wrong ? <FormMessage text={errorText(breakup.error)} testID="breakup-error" /> : null}
      <AppButton
        label={t('breakup.confirm')}
        onPress={() => breakup.mutate(password, { onSuccess: onDone })}
        loading={breakup.isPending}
        disabled={offline}
        testID="breakup-confirm"
      />
      <AppButton variant="ghost" label={t('common.cancel')} onPress={() => router.back()} testID="breakup-confirm-cancel" />
    </Card>
  );
}

function ExportOffer({ onLater }: { onLater: () => void }) {
  const t = useT();
  return (
    <Card testID="breakup-export">
      <StepLabel step={3} />
      <AppText variant="h3" accessibilityRole="header">
        {t('breakup.exportTitle')}
      </AppText>
      <AppText>{t('breakup.exportBody')}</AppText>
      <AppButton label={t('breakup.exportOpen')} onPress={() => router.push('/settings/data')} testID="breakup-export-open" />
      <AppButton variant="ghost" label={t('breakup.exportLater')} onPress={onLater} testID="breakup-export-later" />
    </Card>
  );
}

interface BreakingProps {
  couple: Couple;
  partner: string;
  offline: boolean;
  restore: ReturnType<typeof useBreakupMutations>['restore'];
}

function BreakingState({ couple, partner, offline, restore }: BreakingProps) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const now = useNow();
  const state = couple.breakup;
  const mine = !!state?.myRestoreConfirmed;
  const theirs = !!state?.partnerRestoreConfirmed;
  const count = daysLeft(readOnlyDeadline(couple), now);
  return (
    <>
      <Card testID="breakup-state">
        <View style={styles.row}>
          <HeartCrack size={22} color={colors.danger} strokeWidth={iconStroke} />
          <AppText variant="h3" accessibilityRole="header" style={styles.flex}>
            {t('breakup.stateTitle')}
          </AppText>
        </View>
        <AppText variant="h2" testID="breakup-days-left">
          {t('breakup.daysLeft', { count })}
        </AppText>
        <AppText color="textMuted" testID="breakup-read-only">
          {t('breakup.readOnly')}
        </AppText>
        <AppButton variant="secondary" label={t('breakup.exportOpen')} onPress={() => router.push('/settings/data')} testID="breakup-state-export" />
      </Card>
      <Card testID="breakup-restore-card">
        <View style={styles.row}>
          <RotateCcw size={20} color={colors.primary} strokeWidth={iconStroke} />
          <AppText variant="h3" accessibilityRole="header" style={styles.flex}>
            {t('breakup.restoreTitle')}
          </AppText>
        </View>
        {mine ? (
          <FormMessage kind="success" text={t('breakup.restoreMine', { partner })} testID="breakup-restore-mine" />
        ) : (
          <>
            {theirs ? (
              <FormMessage kind="info" text={t('breakup.restorePartner', { partner })} testID="breakup-restore-partner" />
            ) : (
              <AppText color="textMuted">{t('breakup.restoreBody')}</AppText>
            )}
            <AppButton label={t('breakup.restore')} onPress={() => restore.mutate()} loading={restore.isPending} disabled={offline} testID="breakup-restore" />
          </>
        )}
        {restore.error ? <FormMessage text={errorText(restore.error)} testID="breakup-restore-error" /> : null}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
});
