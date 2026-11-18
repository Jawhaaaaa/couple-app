import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useMeQuery } from '@/api/queries/bootstrap';
import {
  cancelPairing,
  confirmPairing,
  createPairing,
  mediaThumb,
  type Pairing,
  type UserRef,
  useCurrentPairing,
  useInviteLookup,
} from '@/api/queries/pairing';
import { firstParam } from '@/auth/validation';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { AuthScreen } from '@/components/AuthScreen';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/FormMessage';
import { ScreenState } from '@/components/ScreenState';
import { UserAvatar } from '@/components/UserAvatar';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';
import { normalizeInviteCode } from '@/pairing/inviteCode';
import { useLinkedRedirect } from '@/pairing/useLinkedRedirect';
import { spacing } from '@/theme/tokens';

/**
 * S-10 Нэгдэхийг батлах (FR-2.2, AC-170). Хоёр тал:
 * - нэгдэгч (`?code`): урьсан хүний нэр, зураг (`GET /invites/lookup`) → «Нэгдэх»
 *   (`POST /pairings`) → «Ану батлахыг хүлээж байна»; «Татгалзах».
 * - урьсан хүн (`?pairing` — мэдэгдлийн холбоос, эсвэл `GET /pairings/current`):
 *   «Ану нэгдэх гэж байна» → «Батлах» (`POST /pairings/{id}/confirm`) эсвэл цуцлах.
 * Хос зөвхөн хоёр дахь баталгааны дараа үүснэ; `couple.linked` → хоёулаа S-12 (AC-11).
 */
export default function JoinConfirmScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ code?: string; pairing?: string }>();
  const code = normalizeInviteCode(firstParam(params.code) ?? '');
  const pairingParam = firstParam(params.pairing);
  const me = useMeQuery().data;
  const pairing = useCurrentPairing({ poll: true });
  const goLinked = useLinkedRedirect();

  const current = pairing.data ?? null;
  const pending = current?.status === 'AWAITING_INVITER' ? current : null;
  const role = pending && me ? (pending.inviter.id === me.id ? 'inviter' : 'joiner') : null;

  let body: ReactNode;
  if (pairing.isPending && !!pairingParam) body = <ScreenState kind="loading" rows={2} />;
  else if (pending && role === 'inviter') body = <InviterView pairing={pending} onLinked={goLinked} />;
  else if (pending && role === 'joiner') body = <JoinerWaiting pairing={pending} />;
  else if (code) body = <JoinerPreview code={code} />;
  else if (pairing.isError) body = <ScreenState kind="error" onRetry={() => void pairing.refetch()} />;
  else body = <NothingPending />;

  return (
    <AuthScreen title={t('pairing.join.title')} mascot={false} testID="screen-S-10">
      {body}
    </AuthScreen>
  );
}

function PersonHeader({ person, title }: { person: Pick<UserRef, 'displayName' | 'avatar'>; title: string }) {
  const t = useT();
  return (
    <View style={styles.person}>
      <UserAvatar
        uri={mediaThumb(person.avatar)}
        label={t('pairing.join.avatarLabel', { name: person.displayName })}
        size={112}
        testID="join-avatar"
      />
      <AppText variant="h2" style={styles.center} accessibilityRole="header" testID="join-title">
        {title}
      </AppText>
    </View>
  );
}

/** Нэгдэгч: урилгыг харж «Нэгдэх» эсвэл «Татгалзах». */
function JoinerPreview({ code }: { code: string }) {
  const t = useT();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const preview = useInviteLookup(code);

  const join = useMutation({
    mutationFn: () => createPairing(code),
    onSuccess: (created) => queryClient.setQueryData(['pairing'], created),
  });

  if (preview.isPending) return <ScreenState kind="loading" rows={2} />;
  if (preview.isError) {
    return (
      <>
        <FormMessage text={errorText(preview.error)} testID="join-lookup-error" />
        <AppButton label={t('common.retry')} onPress={() => void preview.refetch()} disabled={offline} testID="join-retry" />
        <AppButton variant="ghost" label={t('pairing.join.back')} onPress={() => router.replace({ pathname: '/invite-enter', params: { code } })} testID="join-back" />
      </>
    );
  }
  const name = preview.data.inviterName;
  return (
    <Card testID="join-preview">
      <PersonHeader person={{ displayName: name, avatar: preview.data.inviterAvatar }} title={t('pairing.join.inviter', { name })} />
      <AppText color="textMuted" style={styles.center}>
        {t('pairing.join.joinBody', { name })}
      </AppText>
      {join.error ? <FormMessage text={errorText(join.error)} testID="join-error" /> : null}
      <AppButton label={t('pairing.join.join')} onPress={() => join.mutate()} disabled={offline} loading={join.isPending} testID="join-accept" />
      <AppButton variant="ghost" label={t('pairing.join.decline')} onPress={() => router.replace('/waiting')} testID="join-decline" />
    </Card>
  );
}

/** Нэгдэгч «Нэгдэх» дарсны дараа: урьсан хүн батлахыг хүлээнэ, цуцалж болно. */
function JoinerWaiting({ pairing }: { pairing: Pairing }) {
  const t = useT();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const name = pairing.inviter.displayName;
  const cancel = useMutation({
    mutationFn: () => cancelPairing(pairing.id),
    onSuccess: () => {
      queryClient.setQueryData(['pairing'], null);
      router.replace('/waiting');
    },
  });
  return (
    <Card testID="join-waiting">
      <PersonHeader person={pairing.inviter} title={t('pairing.join.waitingTitle', { name })} />
      <AppText color="textMuted" style={styles.center}>
        {t('pairing.join.waitingBody', { name })}
      </AppText>
      {cancel.error ? <FormMessage text={errorText(cancel.error)} testID="join-cancel-error" /> : null}
      <AppButton
        variant="secondary"
        label={t('pairing.join.cancelRequest')}
        onPress={() => cancel.mutate()}
        disabled={offline}
        loading={cancel.isPending}
        testID="join-cancel"
      />
    </Card>
  );
}

/** Урьсан хүн: «Ану нэгдэх гэж байна» → батлах (хос үүснэ) эсвэл татгалзах. */
function InviterView({ pairing, onLinked }: { pairing: Pairing; onLinked: () => void }) {
  const t = useT();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const name = pairing.joiner.displayName;
  const confirm = useMutation({
    mutationFn: () => confirmPairing(pairing.id),
    onSuccess: (couple) => {
      queryClient.setQueryData(['couple'], couple);
      queryClient.setQueryData(['pairing'], null);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      onLinked();
    },
  });
  const reject = useMutation({
    mutationFn: () => cancelPairing(pairing.id),
    onSuccess: () => {
      queryClient.setQueryData(['pairing'], null);
      router.replace('/waiting');
    },
  });
  const error = confirm.error ?? reject.error;
  return (
    <Card testID="join-request">
      <PersonHeader person={pairing.joiner} title={t('pairing.join.requestTitle', { name })} />
      <AppText color="textMuted" style={styles.center}>
        {t('pairing.join.requestBody')}
      </AppText>
      {error ? <FormMessage text={errorText(error)} testID="join-confirm-error" /> : null}
      <AppButton
        label={t('pairing.join.confirm')}
        onPress={() => confirm.mutate()}
        disabled={offline || reject.isPending}
        loading={confirm.isPending}
        testID="join-confirm"
      />
      <AppButton
        variant="ghost"
        label={t('pairing.join.decline')}
        onPress={() => reject.mutate()}
        disabled={offline || confirm.isPending}
        loading={reject.isPending}
        testID="join-reject"
      />
    </Card>
  );
}

function NothingPending() {
  const t = useT();
  return (
    <>
      <FormMessage kind="info" text={t('pairing.join.notFound')} testID="join-not-found" />
      <AppButton label={t('pairing.join.back')} onPress={() => router.replace('/')} testID="join-back" />
    </>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  person: { alignItems: 'center', gap: spacing.sm },
});
