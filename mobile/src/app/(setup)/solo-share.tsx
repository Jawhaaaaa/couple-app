import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import { ApiRequestError } from '@/api/client';
import { decideSoloShare, partnerName, useCoupleQuery } from '@/api/queries/pairing';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { AuthScreen } from '@/components/AuthScreen';
import { FormMessage } from '@/components/FormMessage';
import { ScreenState } from '@/components/ScreenState';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';

/** S-12-т буцах (баярыг дахин үзүүлэхгүй) — «Эхний дурсамжаа нэмье». */
function backToLinked() {
  router.replace({ pathname: '/linked', params: { celebrated: '1' } });
}

/**
 * Ганцаараа үеийн агуулгыг хуваалцах эсэх (FR-2.5, AC-67): «Өмнө оруулсан 3 зүйлээ
 * Ану-тай хуваалцах уу?» → `POST /couple/solo-share {share}`. Аль хэдийн шийдсэн
 * (`409 ALREADY_DECIDED`) бол асуухгүйгээр үргэлжилнэ.
 */
export default function SoloShareScreen() {
  const t = useT();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const couple = useCoupleQuery();

  const decide = useMutation({
    mutationFn: decideSoloShare,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['couple'] });
      void queryClient.invalidateQueries({ queryKey: ['memories'] });
      backToLinked();
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.code === 'ALREADY_DECIDED') backToLinked();
    },
  });

  if (couple.isPending) {
    return (
      <AuthScreen title={t('pairing.linked.title')} mascot={false} testID="screen-solo-share">
        <ScreenState kind="loading" rows={2} />
      </AuthScreen>
    );
  }
  if (couple.isError && !couple.data) {
    return (
      <AuthScreen title={t('pairing.linked.title')} mascot={false} testID="screen-solo-share">
        <ScreenState kind="error" message={errorText(couple.error)} onRetry={() => void couple.refetch()} />
      </AuthScreen>
    );
  }

  const count = couple.data.soloShare?.pendingCount ?? 0;
  const name = partnerName(couple.data) ?? t('pairing.startDate.partnerFallback');
  return (
    <AuthScreen title={t('pairing.soloShare.title', { count, name })} testID="screen-solo-share">
      <AppText color="textMuted">{t('pairing.soloShare.body')}</AppText>
      {decide.error && !(decide.error instanceof ApiRequestError && decide.error.code === 'ALREADY_DECIDED') ? (
        <FormMessage text={errorText(decide.error)} testID="solo-share-error" />
      ) : null}
      <AppButton
        label={t('pairing.soloShare.yes')}
        onPress={() => decide.mutate(true)}
        disabled={offline || decide.isPending}
        loading={decide.isPending && decide.variables === true}
        testID="solo-share-yes"
      />
      <AppButton
        variant="secondary"
        label={t('pairing.soloShare.no')}
        onPress={() => decide.mutate(false)}
        disabled={offline || decide.isPending}
        loading={decide.isPending && decide.variables === false}
        testID="solo-share-no"
      />
    </AuthScreen>
  );
}
