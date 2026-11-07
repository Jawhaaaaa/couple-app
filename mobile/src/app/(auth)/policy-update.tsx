import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import { acceptPolicy, fetchCurrentPolicy, type Me } from '@/api/queries/auth';
import { AppButton } from '@/components/AppButton';
import { AuthScreen } from '@/components/AuthScreen';
import { PolicyText } from '@/components/auth/PolicyCheckbox';
import { FormMessage } from '@/components/FormMessage';
import { ScreenState } from '@/components/ScreenState';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';

/**
 * S-90 хаалга (FR-14.9, AC-63): бодлогын шинэ хувилбар гарсны дараах эхний нээлтэд
 * бодлого + нөхцөлийг харуулж `POST /me/policy-acceptance`. Зөвшөөрөхөөс өмнө цааш явахгүй.
 */
export default function PolicyUpdateScreen() {
  const t = useT();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const { disabled: offline } = useOnlineOnly();
  const queryClient = useQueryClient();
  const policy = useQuery({ queryKey: ['policies', locale], queryFn: () => fetchCurrentPolicy(locale) });
  const mutation = useMutation({
    mutationFn: acceptPolicy,
    onSuccess: (_data, version) => {
      queryClient.setQueryData<Me>(['me'], (me) =>
        me ? { ...me, policyUpdateRequired: false, policyVersionAccepted: version } : me,
      );
      router.replace('/');
    },
  });

  if (policy.isPending) return <ScreenState kind="loading" />;
  if (policy.isError) {
    return <ScreenState kind="error" message={errorText(policy.error)} onRetry={() => void policy.refetch()} />;
  }

  return (
    <AuthScreen title={t('auth.policyUpdate.title')} subtitle={t('auth.policyUpdate.subtitle')} mascot={false} testID="screen-S-90">
      <PolicyText policy={policy.data} maxHeight={420} />
      {mutation.error ? <FormMessage text={errorText(mutation.error)} testID="policy-accept-error" /> : null}
      <AppButton
        label={t('auth.policyUpdate.accept')}
        onPress={() => mutation.mutate(policy.data.version)}
        disabled={offline}
        loading={mutation.isPending}
        testID="policy-accept"
      />
    </AuthScreen>
  );
}
