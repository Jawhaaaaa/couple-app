import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CalendarHeart, Heart, type LucideIcon, MessageCircle } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/FormMessage';
import { Mascot } from '@/components/Mascot';
import { closeSheet, SheetScreen } from '@/components/SheetScreen';
import { useErrorText } from '@/hooks/useErrorText';
import { useT } from '@/i18n';
import { type EnableResult, enablePush, fetchVapidKey, pushPermission, type PushPermission, pushSupport } from '@/pwa/subscribePush';
import { useSessionStore } from '@/stores/sessionStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, spacing } from '@/theme/tokens';

type Outcome = { kind: 'idle' } | { kind: 'done'; result: EnableResult } | { kind: 'error'; error: unknown };

/**
 * S-101 Мэдэгдлийн зөвшөөрлийн тайлбар (`formSheet`, FR-13.1, FR-19.3, AC-154): яагаад хэрэгтэйг
 * тайлбарлаад «Зөвшөөрөх» товшилтоор л системийн цонхыг нээнэ (апп өөрөө хэзээ ч асуухгүй),
 * «Дараа» — хаана. iPhone-д суулгаагүй бол S-100 руу; зөвшөөрөл татгалзсан бол тохиргооноос
 * асаах заавар; серверт бүртгэж чадаагүй бол «Дахин оролдох».
 */
export default function PushPermissionSheet() {
  const t = useT();
  const errorText = useErrorText();
  const signedIn = useSessionStore((s) => !!s.accessToken);
  const support = pushSupport();
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const web = Platform.OS === 'web';
  // VAPID түлхүүрийг урьдчилан — товшилтын дараа сүлжээ хүлээвэл Safari зөвшөөрлийн цонхыг хаадаг
  const vapid = useQuery({ queryKey: ['push', 'vapid-key'], queryFn: fetchVapidKey, enabled: web && signedIn && support === 'supported', staleTime: Infinity });

  useEffect(() => {
    let alive = true;
    void pushPermission().then((p) => alive && setPermission(p));
    return () => {
      alive = false;
    };
  }, []);

  const allow = async () => {
    setBusy(true);
    try {
      const result = await enablePush(vapid.data ?? null);
      setOutcome({ kind: 'done', result });
      if (result === 'granted' || result === 'denied') setPermission(result);
    } catch (error) {
      setOutcome({ kind: 'error', error });
    } finally {
      setBusy(false);
    }
  };

  const result = outcome.kind === 'done' ? outcome.result : null;
  const denied = permission === 'denied' || result === 'denied';
  const granted = result === 'granted';

  let notice = null;
  if (support === 'needs-install') notice = <FormMessage kind="info" text={t('pushPermission.needsInstall')} testID="push-needs-install" />;
  else if (support === 'unsupported') notice = <FormMessage kind="info" text={t('pushPermission.unsupported')} testID="push-unsupported" />;
  else if (granted) notice = <FormMessage kind="success" text={t('pushPermission.granted')} testID="push-granted" />;
  else if (denied) notice = <FormMessage kind="info" text={t(web ? 'pushPermission.deniedWeb' : 'pushPermission.deniedNative')} testID="push-denied" />;
  else if (result === 'not-configured') notice = <FormMessage text={t('pushPermission.notConfigured')} testID="push-not-configured" />;
  else if (outcome.kind === 'error') notice = <FormMessage text={`${t('pushPermission.failed')} ${errorText(outcome.error)}`} testID="push-error" />;

  const canAsk = support === 'supported' && !granted && !denied && permission !== 'granted';
  return (
    <SheetScreen title={t('pushPermission.title')} testID="screen-S-101">
      <View style={styles.mascot}>
        <Mascot size={110} pose={outcome.kind === 'error' ? 'tilt' : 'wave'} />
      </View>
      <AppText color="textMuted">{t('pushPermission.why')}</AppText>
      <Card testID="push-reasons">
        <Reason icon={Heart} text={t('pushPermission.reason.heart')} />
        <Reason icon={MessageCircle} text={t('pushPermission.reason.message')} />
        <Reason icon={CalendarHeart} text={t('pushPermission.reason.reminder')} />
      </Card>
      <AppText variant="caption" color="textMuted">
        {t('pushPermission.inAppNote')}
      </AppText>
      {notice}
      {permission === 'granted' && !granted ? <FormMessage kind="success" text={t('pushPermission.alreadyOn')} testID="push-already" /> : null}
      {canAsk ? (
        <AppButton
          label={outcome.kind === 'error' ? t('common.retry') : t('pushPermission.allow')}
          onPress={() => void allow()}
          loading={busy}
          disabled={web && vapid.isLoading}
          testID="push-allow"
        />
      ) : null}
      {support === 'needs-install' ? <AppButton label={t('pushPermission.howToInstall')} onPress={() => router.replace('/install')} testID="push-install" /> : null}
      {denied && !web ? <AppButton variant="secondary" label={t('pushPermission.openSettings')} onPress={() => void Linking.openSettings()} testID="push-open-settings" /> : null}
      <AppButton variant="ghost" label={granted || permission === 'granted' ? t('common.close') : t('pushPermission.later')} onPress={closeSheet} testID="push-later" />
    </SheetScreen>
  );
}

function Reason({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  const colors = useColors();
  return (
    <View style={styles.reason}>
      <Icon size={20} color={colors.primary} strokeWidth={iconStroke} />
      <AppText style={styles.flex}>{text}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  mascot: { alignItems: 'center' },
  reason: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  flex: { flex: 1 },
});
