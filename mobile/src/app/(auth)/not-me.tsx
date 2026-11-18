import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';

import { api } from '@/api/client';
import { reportNotMe } from '@/api/queries/auth';
import { firstParam } from '@/auth/validation';
import { AppButton } from '@/components/AppButton';
import { AuthScreen } from '@/components/AuthScreen';
import { FormMessage } from '@/components/FormMessage';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';

/**
 * «Би биш» (`?token`, FR-14.4, AC-125): бүх session хаагдаж, дараагийн нэвтрэлтэд
 * нууц үг шаардана. Хэрэглэгч товч дарж баталгаажуулна (холбоосыг урьдчилан
 * нээгч хэрэгслүүд санамсаргүй дуудахгүй). Энэ төхөөрөмжийн сессийг ч цэвэрлэнэ.
 */
export default function NotMeScreen() {
  const t = useT();
  const errorText = useErrorText();
  const { disabled: offline } = useOnlineOnly();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = firstParam(params.token);
  const mutation = useMutation({
    mutationFn: async (value: string) => {
      await reportNotMe(value);
      await api.signOut();
    },
  });

  return (
    <AuthScreen title={t('auth.notMe.title')} subtitle={mutation.isSuccess ? null : t('auth.notMe.body')} testID="screen-not-me">
      {!token ? <FormMessage text={t('auth.notMe.missingToken')} testID="not-me-missing-token" /> : null}
      {mutation.error ? <FormMessage text={errorText(mutation.error)} testID="not-me-error" /> : null}
      {mutation.isSuccess ? (
        <>
          <FormMessage kind="success" text={t('auth.notMe.done')} testID="not-me-done" />
          <AppButton label={t('auth.reset.requestNew')} onPress={() => router.replace('/forgot-password')} testID="not-me-reset" />
        </>
      ) : token ? (
        <AppButton
          label={t('auth.notMe.confirm')}
          onPress={() => mutation.mutate(token)}
          disabled={offline}
          loading={mutation.isPending}
          testID="not-me-confirm"
        />
      ) : null}
      <AppButton variant="ghost" label={t('auth.forgot.backToLogin')} onPress={() => router.replace('/login')} testID="not-me-login" />
    </AuthScreen>
  );
}
