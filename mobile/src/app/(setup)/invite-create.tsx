import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ApiRequestError } from '@/api/client';
import { useMeQuery } from '@/api/queries/bootstrap';
import { cancelInvite, createInvite, type Invite, useCurrentInvite, useCurrentPairing } from '@/api/queries/pairing';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { AuthScreen } from '@/components/AuthScreen';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/FormMessage';
import { InviteQr } from '@/components/pairing/InviteQr';
import { ScreenState } from '@/components/ScreenState';
import { useErrorText } from '@/hooks/useErrorText';
import { useNow } from '@/hooks/useNow';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { formatDate, useT } from '@/i18n';
import { inviteRemaining } from '@/pairing/inviteCode';
import { copyText, shareInvite } from '@/pairing/share';
import { useLinkedRedirect } from '@/pairing/useLinkedRedirect';
import { usePrefsStore } from '@/stores/prefsStore';
import { spacing } from '@/theme/tokens';

/** `PAIRING_COOLDOWN`-ийн `details.availableAt` (ISO огноо-цаг). */
function cooldownUntil(error: unknown): string | null {
  if (!(error instanceof ApiRequestError) || error.code !== 'PAIRING_COOLDOWN') return null;
  const value = error.body?.details?.availableAt;
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

/**
 * S-08 Урилга үүсгэх (FR-2.1, AC-169): идэвхтэй урилга байвал түүнийг (`GET
 * /invites/current`), үгүй бол шинээр үүсгэнэ. Код том, QR (холбоос), хуваалцах,
 * 7 хоногийн тоолуур, цуцлах. Хамтрагч кодыг ашиглавал (`pairing.requested`) S-10 руу.
 */
export default function InviteCreateScreen() {
  const t = useT();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const me = useMeQuery().data;
  const current = useCurrentInvite();
  const pairing = useCurrentPairing({ poll: true });
  const [notice, setNotice] = useState<string | null>(null);
  const autoCreated = useRef(false);
  useLinkedRedirect();

  const create = useMutation({
    mutationFn: createInvite,
    onSuccess: (invite) => {
      queryClient.setQueryData(['invite'], invite);
      setNotice(null);
    },
  });
  const cancel = useMutation({
    mutationFn: (invite: Invite) => cancelInvite(invite.id),
    onSuccess: () => {
      // Цуцалсны дараа автоматаар шинэ урилга үүсгэхгүй — «Шинэ урилга үүсгэх» товчоор
      autoCreated.current = true;
      queryClient.setQueryData(['invite'], null);
      setNotice(t('pairing.create.cancelled'));
    },
  });

  // Идэвхтэй урилга алга бол нэг удаа автоматаар үүсгэнэ (S-13 «Урилга үүсгэх» → энд)
  const { mutate: createNow } = create;
  const noInvite = current.isSuccess && current.data === null;
  useEffect(() => {
    if (!noInvite || autoCreated.current || offline) return;
    autoCreated.current = true;
    createNow();
  }, [noInvite, offline, createNow]);

  // Хамтрагч кодыг ашигласан (AC-68) — урьсан талын баталгаажуулалт руу (AC-170)
  const awaiting = pairing.data?.status === 'AWAITING_INVITER' && !!me && pairing.data.inviter.id === me.id ? pairing.data : null;
  useEffect(() => {
    if (awaiting) router.replace({ pathname: '/join-confirm', params: { pairing: awaiting.id } });
  }, [awaiting]);

  if (current.isPending) {
    return (
      <AuthScreen title={t('pairing.create.title')} mascot={false} testID="screen-S-08">
        <ScreenState kind="loading" rows={3} />
      </AuthScreen>
    );
  }
  if (current.isError && !current.data) {
    return (
      <AuthScreen title={t('pairing.create.title')} mascot={false} testID="screen-S-08">
        <ScreenState kind="error" message={errorText(current.error)} onRetry={() => void current.refetch()} />
      </AuthScreen>
    );
  }

  const invite = current.data ?? null;
  return (
    <AuthScreen title={t('pairing.create.title')} subtitle={t('pairing.create.subtitle')} mascot={!invite} testID="screen-S-08">
      {invite ? (
        <InviteCard invite={invite} offline={offline} cancelling={cancel.isPending} onCancel={() => cancel.mutate(invite)} onNotice={setNotice} />
      ) : (
        <CreateFailure error={create.error} pending={create.isPending} offline={offline} onRetry={() => create.mutate()} />
      )}
      {notice ? <FormMessage kind="success" text={notice} testID="invite-notice" /> : null}
      {cancel.error ? <FormMessage text={errorText(cancel.error)} testID="invite-cancel-error" /> : null}
      <AppButton variant="ghost" label={t('common.back')} onPress={() => router.replace('/waiting')} testID="invite-back" />
    </AuthScreen>
  );
}

function InviteCard({
  invite,
  offline,
  cancelling,
  onCancel,
  onNotice,
}: {
  invite: Invite;
  offline: boolean;
  cancelling: boolean;
  onCancel: () => void;
  onNotice: (text: string | null) => void;
}) {
  const t = useT();
  const errorText = useErrorText();
  const now = useNow(60_000);
  const left = inviteRemaining(invite.expiresAt, new Date(now));
  const [shareError, setShareError] = useState<unknown>(null);

  const remainingText = !left
    ? null
    : left.days > 0
      ? t('pairing.create.remaining', { days: left.days, hours: left.hours })
      : t('pairing.create.remainingShort', { hours: left.hours, minutes: left.minutes });

  const onShare = async () => {
    setShareError(null);
    try {
      const outcome = await shareInvite({ message: t('pairing.create.shareMessage', { code: invite.code }), link: invite.link });
      onNotice(outcome === 'copied' ? t('pairing.create.linkCopied') : null);
    } catch (error) {
      setShareError(error);
    }
  };

  const onCopy = async () => {
    setShareError(null);
    try {
      await copyText(invite.code);
      onNotice(t('pairing.create.copied'));
    } catch (error) {
      setShareError(error);
    }
  };

  return (
    <Card testID="invite-card">
      <AppText variant="label" color="textMuted" style={styles.center}>
        {t('pairing.create.codeLabel')}
      </AppText>
      <AppText variant="display" style={styles.code} selectable testID="invite-code" accessibilityLabel={invite.code.split('').join(' ')}>
        {invite.code}
      </AppText>
      <InviteQr value={invite.link} />
      <AppText color="textMuted" style={styles.center} testID="invite-valid">
        {t('pairing.create.valid')}
      </AppText>
      {remainingText ? (
        <AppText variant="caption" color="textMuted" style={styles.center} testID="invite-remaining">
          {remainingText}
        </AppText>
      ) : (
        <FormMessage kind="info" text={t('pairing.create.expired')} testID="invite-expired" />
      )}
      <View style={styles.actions}>
        <AppButton label={t('pairing.create.share')} onPress={() => void onShare()} disabled={!left} testID="invite-share" />
        <AppButton variant="secondary" label={t('pairing.create.copy')} onPress={() => void onCopy()} disabled={!left} testID="invite-copy" />
        <AppButton
          variant="ghost"
          label={t('pairing.create.cancel')}
          onPress={onCancel}
          disabled={offline}
          loading={cancelling}
          testID="invite-cancel"
        />
      </View>
      {shareError ? <FormMessage text={errorText(shareError)} testID="invite-share-error" /> : null}
    </Card>
  );
}

function CreateFailure({ error, pending, offline, onRetry }: { error: unknown; pending: boolean; offline: boolean; onRetry: () => void }) {
  const t = useT();
  const errorText = useErrorText();
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  const code = error instanceof ApiRequestError ? error.code : undefined;
  const until = cooldownUntil(error);

  if (code === 'ALREADY_PAIRED') {
    return (
      <>
        <FormMessage text={errorText(error)} testID="invite-error" />
        <AppButton label={t('pairing.create.toHome')} onPress={() => router.replace('/')} testID="invite-to-home" />
      </>
    );
  }
  if (code === 'AUTH_EMAIL_NOT_VERIFIED') {
    return (
      <>
        <FormMessage text={errorText(error)} testID="invite-error" />
        <AppButton label={t('pairing.create.verifyEmail')} onPress={() => router.replace('/')} testID="invite-verify" />
      </>
    );
  }
  return (
    <>
      {until ? (
        <FormMessage kind="info" text={t('pairing.create.cooldown', { date: formatDate(new Date(until), dateFormat) })} testID="invite-cooldown" />
      ) : error ? (
        <FormMessage text={errorText(error)} testID="invite-error" />
      ) : null}
      <AppButton
        label={t('pairing.create.createNew')}
        onPress={onRetry}
        disabled={offline || !!until}
        loading={pending}
        testID="invite-create"
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  code: { textAlign: 'center', letterSpacing: 2 },
  actions: { gap: spacing.xs },
});
