import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { ApiRequestError } from '@/api/client';
import { resendVerification, verifyEmail, verifyEmailLink } from '@/api/queries/auth';
import { useApplyTokens } from '@/auth/session';
import { firstParam } from '@/auth/validation';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { AuthScreen } from '@/components/AuthScreen';
import { CODE_LENGTH, CodeInput } from '@/components/auth/CodeInput';
import { RESEND_SECONDS, ResendTimer } from '@/components/auth/ResendTimer';
import { FormMessage } from '@/components/FormMessage';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';

/** `details.attemptsLeft` (CODE_INVALID). */
function attemptsLeft(error: ApiRequestError): number | null {
  const value = error.body?.details?.attemptsLeft;
  return typeof value === 'number' ? value : null;
}

/**
 * S-05 Имэйл баталгаажуулах (FR-1.2, AC-01): 6 нүдтэй код, 60 с-ийн дараа дахин
 * илгээх, имэйл засах. `?token` (имэйлийн холбоос, AC-165) бол шууд баталгаажуулна.
 * Буруу кодод үлдсэн оролдлого, түгжигдвэл хэдэн минут хүлээхийг харуулна.
 */
export default function VerifyEmailScreen() {
  const t = useT();
  const errorText = useErrorText();
  const applyTokens = useApplyTokens();
  const { disabled: offline } = useOnlineOnly();
  const params = useLocalSearchParams<{ email?: string; token?: string; fresh?: string }>();
  const email = firstParam(params.email) ?? '';
  const token = firstParam(params.token);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [resendError, setResendError] = useState<unknown>(null);
  const [locked, setLocked] = useState(false);

  const onVerified = async (tokens: Awaited<ReturnType<typeof verifyEmail>>) => {
    await applyTokens(tokens);
    router.replace('/profile');
  };

  const verify = useMutation({
    mutationFn: (value: string) => verifyEmail(email, value),
    onSuccess: onVerified,
    onError: (error) => {
      setCode('');
      if (error instanceof ApiRequestError && error.code === 'CODE_LOCKED') setLocked(true);
    },
  });

  const link = useMutation({ mutationFn: verifyEmailLink, onSuccess: onVerified });
  const linkStarted = useRef(false);
  const { mutate: verifyLink } = link;
  useEffect(() => {
    // Холбоосын токен нэг удаагийнх — давхар илгээхгүй
    if (!token || linkStarted.current) return;
    linkStarted.current = true;
    verifyLink(token);
  }, [token, verifyLink]);

  // Түгжээ дуусахад дахин оролдохыг зөвшөөрнө
  const lockSeconds = verify.error instanceof ApiRequestError ? verify.error.body?.retryAfterSeconds : undefined;
  useEffect(() => {
    if (!locked) return;
    const timer = setTimeout(() => setLocked(false), (lockSeconds ?? 60) * 1000);
    return () => clearTimeout(timer);
  }, [locked, lockSeconds]);

  async function resend(): Promise<number> {
    setNotice(null);
    setResendError(null);
    try {
      await resendVerification(email);
      setNotice(t('auth.verify.resent'));
      return RESEND_SECONDS;
    } catch (error) {
      setResendError(error);
      if (error instanceof ApiRequestError && error.code === 'RATE_LIMITED') {
        return error.body?.retryAfterSeconds ?? RESEND_SECONDS;
      }
      return 0;
    }
  }

  function submit(value = code) {
    if (value.length !== CODE_LENGTH || verify.isPending || locked) return;
    setNotice(null);
    verify.mutate(value);
  }

  let codeError: string | null = null;
  const err = verify.error;
  if (err instanceof ApiRequestError && err.code === 'CODE_INVALID' && attemptsLeft(err) !== null) {
    codeError = t('auth.verify.attemptsLeft', { count: attemptsLeft(err) ?? 0 });
  } else if (err instanceof ApiRequestError && err.code === 'CODE_LOCKED') {
    codeError = t('auth.verify.locked', { minutes: Math.max(1, Math.ceil((lockSeconds ?? 900) / 60)) });
  } else if (err) {
    codeError = errorText(err);
  }

  if (token && !link.isError) {
    return (
      <AuthScreen title={t('auth.verify.title')} subtitle={t('auth.verify.checkingLink')} testID="screen-S-05">
        {null}
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title={t('auth.verify.title')}
      subtitle={email ? t('auth.verify.subtitle', { email }) : null}
      testID="screen-S-05"
    >
      {link.isError ? <FormMessage text={errorText(link.error)} testID="verify-link-error" /> : null}
      {!email ? (
        <>
          <FormMessage text={t('auth.verify.missingEmail')} testID="verify-missing-email" />
          <AppButton label={t('auth.forgot.backToLogin')} onPress={() => router.replace('/login')} testID="verify-to-login" />
        </>
      ) : (
        <>
          <CodeInput
            value={code}
            onChange={(v) => {
              setCode(v);
              if (verify.error) verify.reset();
            }}
            onComplete={submit}
            disabled={locked || verify.isPending}
            invalid={!!codeError}
          />
          {codeError ? (
            <AppText color="danger" accessibilityRole="alert" style={{ textAlign: 'center' }} testID="verify-error">
              {codeError}
            </AppText>
          ) : null}
          {notice ? <FormMessage kind="success" text={notice} testID="verify-notice" /> : null}
          {resendError ? <FormMessage text={errorText(resendError)} testID="verify-resend-error" /> : null}
          <AppButton
            label={t('auth.verify.submit')}
            onPress={() => submit()}
            disabled={code.length !== CODE_LENGTH || locked || offline}
            loading={verify.isPending}
            testID="verify-submit"
          />
          <ResendTimer initialSeconds={params.fresh ? RESEND_SECONDS : 0} onResend={resend} disabled={offline} />
          <AppButton
            variant="ghost"
            label={t('auth.verify.editEmail')}
            onPress={() => router.replace({ pathname: '/register', params: { email } })}
            testID="verify-edit-email"
          />
        </>
      )}
    </AuthScreen>
  );
}
