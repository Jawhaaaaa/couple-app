import { router } from 'expo-router';
import { CalendarHeart, Images, type LucideIcon, Sparkles } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useMeQuery } from '@/api/queries/bootstrap';
import { type Invite, type Pairing, useCurrentInvite, useCurrentPairing } from '@/api/queries/pairing';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Mascot } from '@/components/Mascot';
import { ScreenState } from '@/components/ScreenState';
import { TabScreen } from '@/components/TabScreen';
import { emptyStateText } from '@/content/emptyStates';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';
import { useLinkedRedirect } from '@/pairing/useLinkedRedirect';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

/**
 * S-13 Хамтрагчаа хүлээж байна (FR-2, spec §6.1 — хосгүй нүүр): урилгын төлөв (идэвхтэй
 * код эсвэл «Урилга үүсгэх»), хүлээгдэж буй холболт, «Код оруулах», ганцаараа хийж
 * болох үйлдлүүд (дурсамж, төлөвлөгөө, хамтдаа). Хос холбогдмогц S-12 руу (AC-11).
 */
export default function WaitingScreen() {
  const t = useT();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const { disabled: offline } = useOnlineOnly();
  const me = useMeQuery().data;
  const invite = useCurrentInvite();
  const pairing = useCurrentPairing({ poll: true });
  useLinkedRedirect();

  let body: ReactNode;
  if (invite.isPending) body = <ScreenState kind="loading" rows={3} />;
  else if (invite.isError && invite.data === undefined) {
    body = <ScreenState kind="error" message={errorText(invite.error)} onRetry={() => void invite.refetch()} />;
  } else {
    const pending = pairing.data?.status === 'AWAITING_INVITER' ? pairing.data : null;
    body = (
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Mascot size={96} pose="wave" />
          {me ? (
            <AppText variant="h2" style={styles.center}>
              {t('pairing.waiting.greeting', { name: me.callName ?? me.displayName })}
            </AppText>
          ) : null}
        </View>
        {pending && me ? <PendingCard pairing={pending} meId={me.id} /> : null}
        <InviteStatus invite={invite.data ?? null} offline={offline} emptyText={emptyStateText('S-13', locale)} />
        <Card testID="waiting-enter">
          <AppText>{t('pairing.waiting.haveCode')}</AppText>
          <AppButton variant="secondary" label={t('pairing.waiting.enterCode')} onPress={() => router.push('/invite-enter')} testID="waiting-enter-code" />
        </Card>
        <SoloActions />
      </ScrollView>
    );
  }

  return (
    <TabScreen title={t('pairing.waiting.title')} testID="screen-S-13">
      {body}
    </TabScreen>
  );
}

function PendingCard({ pairing, meId }: { pairing: Pairing; meId: string }) {
  const t = useT();
  const inviter = pairing.inviter.id === meId;
  const text = inviter
    ? t('pairing.waiting.pendingInviter', { name: pairing.joiner.displayName })
    : t('pairing.waiting.pendingJoiner', { name: pairing.inviter.displayName });
  return (
    <Card testID="waiting-pending">
      <AppText variant="h2">{text}</AppText>
      <AppButton
        label={t('pairing.waiting.view')}
        onPress={() => router.push({ pathname: '/join-confirm', params: { pairing: pairing.id } })}
        testID="waiting-pending-view"
      />
    </Card>
  );
}

function InviteStatus({ invite, offline, emptyText }: { invite: Invite | null; offline: boolean; emptyText: { text: string; action: string } }) {
  const t = useT();
  if (invite) {
    return (
      <Card testID="waiting-invite">
        <AppText variant="label" color="textMuted" testID="waiting-invite-code">
          {t('pairing.waiting.inviteActive', { code: invite.code })}
        </AppText>
        <AppText>{emptyText.text}</AppText>
        <AppButton label={emptyText.action} onPress={() => router.push('/invite-create')} testID="waiting-view-invite" />
      </Card>
    );
  }
  return (
    <Card testID="waiting-no-invite">
      <AppText>{t('pairing.waiting.noInvite')}</AppText>
      <AppButton
        label={t('pairing.waiting.createInvite')}
        onPress={() => router.push('/invite-create')}
        disabled={offline}
        testID="waiting-create-invite"
      />
    </Card>
  );
}

function SoloActions() {
  const t = useT();
  return (
    <Card testID="waiting-solo">
      <AppText variant="h2">{t('pairing.waiting.soloTitle')}</AppText>
      <AppText color="textMuted">{t('pairing.waiting.soloBody')}</AppText>
      <SoloLink icon={Images} label={t('pairing.waiting.soloMemories')} onPress={() => router.push('/memories')} testID="waiting-solo-memories" />
      <SoloLink icon={CalendarHeart} label={t('pairing.waiting.soloPlans')} onPress={() => router.push('/plans')} testID="waiting-solo-plans" />
      <SoloLink icon={Sparkles} label={t('pairing.waiting.soloTogether')} onPress={() => router.push('/together')} testID="waiting-solo-together" />
    </Card>
  );
}

function SoloLink({
  icon: Icon,
  label,
  onPress,
  testID,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [styles.link, { backgroundColor: colors.surfaceRaised, opacity: pressed ? 0.85 : 1 }]}
    >
      <Icon size={22} color={colors.primary} strokeWidth={iconStroke} />
      <AppText style={styles.flex}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.screen, gap: spacing.md, width: '100%', maxWidth: 560, alignSelf: 'center' },
  hero: { alignItems: 'center', gap: spacing.xs },
  center: { textAlign: 'center' },
  flex: { flex: 1 },
  link: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.input,
  },
});
