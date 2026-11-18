import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { exchangeOAuthCode, linkOAuthAccount, type OAuthExchangeResponse } from '@/api/queries/auth';
import { useApplyTokens } from '@/auth/session';
import { firstParam } from '@/auth/validation';
import { AppButton } from '@/components/AppButton';
import { AuthScreen } from '@/components/AuthScreen';
import { FormMessage } from '@/components/FormMessage';
import { TextField } from '@/components/TextField';
import { useErrorText } from '@/hooks/useErrorText';
import { useT } from '@/i18n';

/**
 * OAuth буцах цэг (`?code` эсвэл `?error`, FR-1.5, AC-06, AC-167): нэг удаагийн
 * кодыг `POST /auth/oauth/exchange`-ээр токен болгоно. Шинэ хэрэглэгч → S-07;
 * ижил имэйлтэй бүртгэл байвал нууц үгээр холбоно (`/auth/oauth/link`).
 */
export default function OAuthCallbackScreen() {
  const t = useT();
  const errorText = useErrorText();
  const applyTokens = useApplyTokens();
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const code = firstParam(params.code);
  const idpError = firstParam(params.error);
  const [password, setPassword] = useState('');

  const exchange = useMutation({
    mutationFn: exchangeOAuthCode,
    onSuccess: async (res: OAuthExchangeResponse) => {
      if (res.tokens) {
        await applyTokens(res.tokens);
        router.replace(res.isNewUser ? '/profile' : '/');
      }
    },
  });
  const link = useMutation({
    mutationFn: (linkToken: string) => linkOAuthAccount(linkToken, password),
    onSuccess: async (tokens) => {
      await applyTokens(tokens);
      router.replace('/');
    },
  });

  // Код нэг удаагийнх (60 с) — давхар солихгүй
  const started = useRef(false);
  const { mutate: exchangeCode } = exchange;
  useEffect(() => {
    if (!code || idpError || started.current) return;
    started.current = true;
    exchangeCode(code);
  }, [code, idpError, exchangeCode]);

  const toLogin = (
    <AppButton variant="secondary" label={t('auth.forgot.backToLogin')} onPress={() => router.replace('/login')} testID="oauth-to-login" />
  );

  const dead = exchange.isSuccess && !exchange.data.tokens && !exchange.data.linkRequired;
  if (idpError || !code || exchange.isError || dead) {
    return (
      <AuthScreen title={t('auth.login.title')} testID="screen-oauth-callback">
        <FormMessage text={exchange.error ? errorText(exchange.error) : t('auth.oauth.failed')} testID="oauth-error" />
        {toLogin}
      </AuthScreen>
    );
  }

  const linkToken = exchange.data?.linkRequired ? exchange.data.linkToken : null;
  if (linkToken) {
    return (
      <AuthScreen title={t('auth.oauth.linkTitle')} subtitle={t('auth.oauth.linkBody')} testID="screen-oauth-link">
        {link.error ? <FormMessage text={errorText(link.error)} testID="oauth-link-error" /> : null}
        <TextField
          label={t('auth.fields.password')}
          value={password}
          onChangeText={setPassword}
          secure
          autoCapitalize="none"
          autoComplete="current-password"
          testID="oauth-link-password"
        />
        <AppButton
          label={t('auth.oauth.linkSubmit')}
          onPress={() => link.mutate(linkToken)}
          disabled={!password}
          loading={link.isPending}
          testID="oauth-link-submit"
        />
        {toLogin}
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title={t('auth.oauth.signingIn')} testID="screen-oauth-callback">
      {null}
    </AuthScreen>
  );
}
