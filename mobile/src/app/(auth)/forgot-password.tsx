import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { requestPasswordReset } from '@/api/queries/auth';
import { firstParam, isEmail } from '@/auth/validation';
import { AppButton } from '@/components/AppButton';
import { AuthScreen } from '@/components/AuthScreen';
import { FormMessage } from '@/components/FormMessage';
import { TextField } from '@/components/TextField';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';

/** S-06 Нууц үг сэргээх холбоос хүсэх (FR-1.3). Бүртгэлтэй эсэхээс үл хамааран ижил хариу. */
export default function ForgotPasswordScreen() {
  const t = useT();
  const errorText = useErrorText();
  const { disabled: offline } = useOnlineOnly();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(firstParam(params.email) ?? '');
  const [submitted, setSubmitted] = useState(false);
  const mutation = useMutation({ mutationFn: () => requestPasswordReset(email) });

  function submit() {
    setSubmitted(true);
    if (!isEmail(email)) return;
    mutation.mutate();
  }

  return (
    <AuthScreen title={t('auth.forgot.title')} subtitle={t('auth.forgot.subtitle')} testID="screen-S-06">
      {mutation.isSuccess ? (
        <FormMessage kind="success" text={t('auth.forgot.sent')} testID="forgot-sent" />
      ) : (
        <>
          {mutation.error ? <FormMessage text={errorText(mutation.error)} testID="forgot-error" /> : null}
          <TextField
            label={t('auth.fields.email')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            onSubmitEditing={submit}
            error={submitted && !isEmail(email) ? t('auth.validation.emailInvalid') : null}
            testID="forgot-email"
          />
          <AppButton
            label={t('auth.forgot.submit')}
            onPress={submit}
            disabled={offline}
            loading={mutation.isPending}
            testID="forgot-submit"
          />
        </>
      )}
      <AppButton
        variant="ghost"
        label={t('auth.forgot.backToLogin')}
        onPress={() => router.replace({ pathname: '/login', params: email ? { email: email.trim() } : {} })}
        testID="forgot-back"
      />
    </AuthScreen>
  );
}
