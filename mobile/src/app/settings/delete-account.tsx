import { router } from 'expo-router';
import { TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ApiRequestError } from '@/api/client';
import { phraseMatches, useDeleteAccount } from '@/api/queries/account';
import { partnerName, useCoupleQuery } from '@/api/queries/pairing';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/FormMessage';
import { StackScreen } from '@/components/StackScreen';
import { TextField } from '@/components/TextField';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, spacing } from '@/theme/tokens';

type Step = 1 | 2 | 3;

/**
 * S-87 Акаунт устгах (FR-14.7, AC-128, GAP-14 анхдагч): 1 анхааруулга — сэргээлтгүй, хувийн өгөгдөл шууд
 * устна, хостой бол хамтрагч 30 хоног харах/экспорт → 2 экспортын санал (S-85) → 3 нууц үг ба
 * баталгаажуулах үг. Амжилттай бол энэ төхөөрөмжөөс гарч S-03 нэвтрэх руу. Offline-д идэвхгүй.
 */
export default function DeleteAccountScreen() {
  const t = useT();
  const { disabled: offline } = useOnlineOnly();
  const [step, setStep] = useState<Step>(1);
  return (
    <StackScreen title={t('deleteAccount.title')} testID="screen-S-87">
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {offline ? <FormMessage kind="info" text={t('deleteAccount.offline')} testID="delete-offline" /> : null}
        {step === 1 ? <Warn onContinue={() => setStep(2)} /> : null}
        {step === 2 ? <ExportOffer onContinue={() => setStep(3)} /> : null}
        {step === 3 ? <Confirm offline={offline} /> : null}
      </ScrollView>
    </StackScreen>
  );
}

function StepLabel({ step }: { step: Step }) {
  const t = useT();
  return (
    <AppText variant="label" color="textMuted" testID={`delete-step-${step}`}>
      {t('deleteAccount.step', { step })}
    </AppText>
  );
}

function Warn({ onContinue }: { onContinue: () => void }) {
  const t = useT();
  const colors = useColors();
  const couple = useCoupleQuery().data;
  const paired = couple?.kind === 'COUPLE' && couple.status !== 'ORPHANED';
  const partner = partnerName(couple) ?? t('deleteAccount.partnerFallback');
  return (
    <Card testID="delete-warn">
      <StepLabel step={1} />
      <View style={styles.row}>
        <TriangleAlert size={22} color={colors.danger} strokeWidth={iconStroke} />
        <AppText variant="h3" accessibilityRole="header" style={styles.flex}>
          {t('deleteAccount.warnTitle')}
        </AppText>
      </View>
      <AppText variant="bodyStrong" testID="delete-warn-irreversible">
        {t('deleteAccount.warnBody')}
      </AppText>
      <AppText>{t('deleteAccount.warnPersonal')}</AppText>
      {paired ? (
        <AppText testID="delete-warn-partner">{t('deleteAccount.warnPartner', { partner })}</AppText>
      ) : null}
      <AppButton label={t('deleteAccount.continue')} onPress={onContinue} testID="delete-continue" />
      <AppButton variant="ghost" label={t('common.cancel')} onPress={() => router.back()} testID="delete-cancel" />
    </Card>
  );
}

function ExportOffer({ onContinue }: { onContinue: () => void }) {
  const t = useT();
  return (
    <Card testID="delete-export">
      <StepLabel step={2} />
      <AppText variant="h3" accessibilityRole="header">
        {t('deleteAccount.exportTitle')}
      </AppText>
      <AppText>{t('deleteAccount.exportBody')}</AppText>
      <AppButton variant="secondary" label={t('deleteAccount.exportOpen')} onPress={() => router.push('/settings/data')} testID="delete-export-open" />
      <AppButton label={t('deleteAccount.exportSkip')} onPress={onContinue} testID="delete-export-skip" />
    </Card>
  );
}

function Confirm({ offline }: { offline: boolean }) {
  const t = useT();
  const errorText = useErrorText();
  const mutation = useDeleteAccount();
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const phrase = t('deleteAccount.phrase');
  const matches = phraseMatches(typed, phrase);
  const error = mutation.error;
  const wrongPassword = error instanceof ApiRequestError && error.code === 'AUTH_INVALID_CREDENTIALS';
  const wrongPhrase = error instanceof ApiRequestError && error.status === 400;

  return (
    <Card testID="delete-confirm-step">
      <StepLabel step={3} />
      <AppText variant="h3" accessibilityRole="header">
        {t('deleteAccount.confirmTitle')}
      </AppText>
      <AppText>{t('deleteAccount.confirmBody', { phrase })}</AppText>
      <TextField
        label={t('deleteAccount.password')}
        value={password}
        onChangeText={setPassword}
        secure
        autoComplete="current-password"
        hint={t('deleteAccount.passwordHint')}
        error={wrongPassword ? t('deleteAccount.passwordWrong') : null}
        testID="delete-password"
      />
      <TextField
        label={t('deleteAccount.phraseLabel')}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={phrase}
        error={wrongPhrase ? t('deleteAccount.phraseWrong', { phrase }) : null}
        testID="delete-phrase"
      />
      {error && !wrongPassword && !wrongPhrase ? <FormMessage text={errorText(error)} testID="delete-error" /> : null}
      <AppButton
        label={t('deleteAccount.confirm')}
        onPress={() =>
          mutation.mutate({ password, confirmPhrase: typed.trim() }, { onSuccess: () => router.replace('/login') })
        }
        loading={mutation.isPending}
        disabled={offline || !matches}
        testID="delete-confirm"
      />
      <AppButton variant="ghost" label={t('common.cancel')} onPress={() => router.back()} testID="delete-confirm-cancel" />
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
});
