import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ApiRequestError } from '@/api/client';
import { login } from '@/api/queries/auth';
import { startOAuth } from '@/auth/oauth';
import { useApplyTokens } from '@/auth/session';
import { firstParam, isEmail } from '@/auth/validation';
import { AppButton } from '@/components/AppButton';
import { AuthScreen } from '@/components/AuthScreen';
import { FormMessage } from '@/components/FormMessage';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { TextField } from '@/components/TextField';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';
import { spacing } from '@/theme/tokens';

/** S-03 Нэвтрэх (FR-1.1, FR-1.5): имэйл, нууц үг, Google, Apple (iOS), «Нууц үг мартсан». */
export default function LoginScreen() {
  const t = useT();
  const errorText = useErrorText();
  const applyTokens = useApplyTokens();
  const { disabled: offline } = useOnlineOnly();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(firstParam(params.email) ?? '');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: async (tokens) => {
      await applyTokens(tokens);
      router.replace('/');
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.code === 'AUTH_EMAIL_NOT_VERIFIED') {
        router.push({ pathname: '/verify-email', params: { email: email.trim() } });
      }
    },
  });

  const oauth = useMutation({
    mutationFn: () => startOAuth('google'),
    onSuccess: (outcome) => {
      if (!outcome) return; // цуцалсан эсвэл вэбэд хуудас шилжсэн
      router.push({ pathname: '/oauth-callback', params: { code: outcome.code ?? '', error: outcome.error ?? '' } });
    },
  });

  const emailError = submitted && !isEmail(email) ? t('auth.validation.emailInvalid') : null;
  const passwordError = submitted && !password ? t('auth.validation.passwordRequired') : null;

  function submit() {
    setSubmitted(true);
    if (!isEmail(email) || !password) return;
    mutation.mutate();
  }

  const error = mutation.error ?? oauth.error;
  let errorMessage: string | null = null;
  if (error instanceof ApiRequestError && error.code === 'RATE_LIMITED' && error.body?.retryAfterSeconds) {
    errorMessage = t('auth.login.rateLimited', { minutes: Math.max(1, Math.ceil(error.body.retryAfterSeconds / 60)) });
  } else if (error && !(error instanceof ApiRequestError && error.code === 'AUTH_EMAIL_NOT_VERIFIED')) {
    errorMessage = errorText(error);
  }

  return (
    <AuthScreen title={t('auth.login.title')} subtitle={t('auth.login.subtitle')} testID="screen-S-03">
      {offline ? <FormMessage kind="info" text={t('auth.login.offline')} testID="login-offline" /> : null}
      {errorMessage ? <FormMessage text={errorMessage} testID="login-error" /> : null}
      <TextField
        label={t('auth.fields.email')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        error={emailError}
        testID="login-email"
      />
      <TextField
        label={t('auth.fields.password')}
        value={password}
        onChangeText={setPassword}
        secure
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={submit}
        error={passwordError}
        testID="login-password"
      />
      <View style={styles.forgot}>
        <AppButton
          variant="ghost"
          label={t('auth.login.forgot')}
          onPress={() => router.push({ pathname: '/forgot-password', params: email ? { email: email.trim() } : {} })}
          testID="login-forgot"
        />
      </View>
      <AppButton
        label={t('auth.login.submit')}
        onPress={submit}
        disabled={offline}
        loading={mutation.isPending}
        testID="login-submit"
      />
      <OAuthButtons onGoogle={() => oauth.mutate()} disabled={offline} loading={oauth.isPending} />
      <AppButton variant="secondary" label={t('auth.login.register')} onPress={() => router.push('/register')} testID="login-register" />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  forgot: { alignItems: 'flex-end', marginTop: -spacing.xs },
});
