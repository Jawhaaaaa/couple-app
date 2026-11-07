import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { useMeQuery } from '@/api/queries/bootstrap';
import { firstParam } from '@/auth/validation';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { AuthScreen } from '@/components/AuthScreen';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/FormMessage';
import { useErrorText } from '@/hooks/useErrorText';
import { useT } from '@/i18n';
import { normalizeInviteCode } from '@/pairing/inviteCode';
import { copyText } from '@/pairing/share';
import { useSessionStore } from '@/stores/sessionStore';

/**
 * Урилгын холбоос `https://<host>/i/AURA-XXXX` (FR-2.1, AC-12). Нэвтэрсэн бол S-09
 * (код бөглөгдсөн, шууд шалгана). Нэвтрээгүй бол — ялангуяа iPhone Safari-д
 * суусан PWA биш хөтөч нээгддэг тул (GAP-13) — кодыг томоор харуулж «Aura апп-аа
 * нээж кодоо оруул» заавар, нэвтрэх/бүртгүүлэх товч.
 */
export default function InviteLinkScreen() {
  const t = useT();
  const errorText = useErrorText();
  const params = useLocalSearchParams<{ code?: string }>();
  const raw = firstParam(params.code) ?? '';
  const code = normalizeInviteCode(raw);
  const signedIn = !!useSessionStore((s) => s.accessToken);
  const me = useMeQuery().data;
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<unknown>(null);

  if (signedIn && me) {
    return <Redirect href={code ? { pathname: '/invite-enter', params: { code } } : '/invite-enter'} />;
  }

  const onCopy = async () => {
    if (!code) return;
    try {
      await copyText(code);
      setCopied(true);
    } catch (error) {
      setCopyError(error);
    }
  };

  return (
    <AuthScreen title={t('pairing.link.title')} subtitle={t('pairing.link.body')} testID="screen-invite-link">
      <Card>
        <AppText variant="label" color="textMuted" style={styles.center}>
          {t('pairing.create.codeLabel')}
        </AppText>
        <AppText variant="display" style={styles.code} selectable testID="invite-link-code">
          {code ?? raw.toUpperCase()}
        </AppText>
        {code ? <AppButton variant="secondary" label={t('pairing.create.copy')} onPress={() => void onCopy()} testID="invite-link-copy" /> : null}
      </Card>
      {copied ? <FormMessage kind="success" text={t('pairing.create.copied')} testID="invite-link-copied" /> : null}
      {copyError ? <FormMessage text={errorText(copyError)} testID="invite-link-copy-error" /> : null}
      <AppButton label={t('pairing.link.signIn')} onPress={() => router.push('/login')} testID="invite-link-login" />
      <AppButton variant="ghost" label={t('pairing.link.register')} onPress={() => router.push('/register')} testID="invite-link-register" />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  code: { textAlign: 'center', letterSpacing: 2 },
});
