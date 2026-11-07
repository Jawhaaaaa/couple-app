import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ApiRequestError } from '@/api/client';
import { confirmPasswordReset } from '@/api/queries/auth';
import { passwordIssue } from '@/auth/passwordStrength';
import { firstParam } from '@/auth/validation';
import { AppButton } from '@/components/AppButton';
import { AuthScreen } from '@/components/AuthScreen';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { FormMessage } from '@/components/FormMessage';
import { TextField } from '@/components/TextField';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';

/**
 * S-06 Шинэ нууц үг (`?token`, FR-1.3, AC-166): амжилттай бол бусад бүх session
 * хаагдана → S-03. Хугацаа дууссан/ашигласан холбоос — «хүчингүй» мессеж + шинэ холбоос.
 */
export default function ResetPasswordScreen() {
  const t = useT();
  const errorText = useErrorText();
  const { disabled: offline } = useOnlineOnly();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = firstParam(params.token);
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const mutation = useMutation({ mutationFn: (value: string) => confirmPasswordReset(token ?? '', value) });

  const issue = passwordIssue(password);
  const code = mutation.error instanceof ApiRequestError ? mutation.error.code : undefined;
  const fieldError =
    code === 'PASSWORD_WEAK' || code === 'PASSWORD_COMMON'
      ? errorText(mutation.error)
      : submitted && issue
        ? t(`auth.password.${issue}`)
        : null;
  const linkError = mutation.error && !fieldError ? errorText(mutation.error) : null;
  const linkDead = code === 'TOKEN_INVALID' || code === 'TOKEN_EXPIRED';

  function submit() {
    setSubmitted(true);
    if (!token || issue) return;
    mutation.mutate(password);
  }

  const toLogin = (
    <AppButton variant="ghost" label={t('auth.forgot.backToLogin')} onPress={() => router.replace('/login')} testID="reset-to-login" />
  );
  const requestNew = (
    <AppButton variant="secondary" label={t('auth.reset.requestNew')} onPress={() => router.replace('/forgot-password')} testID="reset-request-new" />
  );

  if (!token) {
    return (
      <AuthScreen title={t('auth.reset.title')} testID="screen-S-06-reset">
        <FormMessage text={t('auth.reset.missingToken')} testID="reset-missing-token" />
        {requestNew}
        {toLogin}
      </AuthScreen>
    );
  }

  if (mutation.isSuccess) {
    return (
      <AuthScreen title={t('auth.reset.title')} testID="screen-S-06-reset">
        <FormMessage kind="success" text={t('auth.reset.done')} testID="reset-done" />
        <AppButton label={t('auth.login.submit')} onPress={() => router.replace('/login')} testID="reset-login" />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title={t('auth.reset.title')} subtitle={t('auth.reset.subtitle')} testID="screen-S-06-reset">
      {linkError ? <FormMessage text={linkError} testID="reset-error" /> : null}
      <TextField
        label={t('auth.fields.newPassword')}
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          if (mutation.error && !linkDead) mutation.reset();
        }}
        secure
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        maxLength={128}
        onSubmitEditing={submit}
        error={fieldError}
        testID="reset-password"
      />
      <PasswordStrength password={password} />
      <AppButton
        label={t('auth.reset.submit')}
        onPress={submit}
        disabled={offline || linkDead}
        loading={mutation.isPending}
        testID="reset-submit"
      />
      {linkDead ? requestNew : null}
      {toLogin}
    </AuthScreen>
  );
}
