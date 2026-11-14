import * as Clipboard from 'expo-clipboard';
import { Redirect, router } from 'expo-router';
import { BellRing, CircleCheck, Globe, type LucideIcon, Monitor, Share, Smartphone, SquarePlus } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/FormMessage';
import { StackScreen } from '@/components/StackScreen';
import { useT } from '@/i18n';
import { type InstallPrompt, useInstallPrompt } from '@/pwa/useInstallPrompt';
import { useInstallPromptStore } from '@/stores/installPromptStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing } from '@/theme/tokens';

/**
 * S-100 PWA суулгах заавар (вэбэд л, FR-19.2, AC-153): iOS Safari — зурагтай 3 алхам; Android/desktop
 * Chromium — `beforeinstallprompt`-оор «Суулгах»; iOS-ийн бусад хөтөч — «Safari-аар нээнэ үү»;
 * суусан (standalone) бол заавар биш, «аль хэдийн суусан». Бүх тохиолдолд push ба offline нь
 * суулгасны дараа ажилладгийг тайлбарлана. Дэлгэцээс гарахад 7 хоног автоматаар гарахгүй.
 */
export default function InstallScreen() {
  const install = useInstallPrompt();
  // Ямар ч замаар гарсан (буцах, «Дараа», суулгасан) — 7 хоног автоматаар гарахгүй (AC-153 в)
  useEffect(() => () => useInstallPromptStore.getState().dismiss(), []);
  if (Platform.OS !== 'web') return <Redirect href="/" />;
  return <InstallContent install={install} />;
}

export function InstallContent({ install }: { install: InstallPrompt }) {
  const t = useT();
  const [message, setMessage] = useState<string | null>(null);

  const later = () => {
    install.dismiss();
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  const promptInstall = async () => {
    const outcome = await install.prompt();
    if (outcome === 'accepted') setMessage(t('install.accepted'));
  };

  const copyLink = async () => {
    const url = typeof window !== 'undefined' ? (window.location?.origin ?? '') : '';
    await Clipboard.setStringAsync(url);
    setMessage(t('install.iosOther.copied'));
  };

  const context = install.context;
  return (
    <StackScreen title={t('install.title')} testID="screen-S-100">
      <ScrollView contentContainerStyle={styles.body}>
        {context === 'standalone' ? (
          <FormMessage kind="success" text={t('install.installed')} testID="install-standalone" />
        ) : (
          <AppText color="textMuted">{t('install.intro')}</AppText>
        )}

        {context === 'ios-safari' ? (
          <Card testID="install-ios-steps">
            <AppText variant="h3" accessibilityRole="header">
              {t('install.ios.title')}
            </AppText>
            <Step icon={Share} title={t('install.ios.step1')} hint={t('install.ios.hint1')} testID="install-ios-step-1" />
            <Step icon={SquarePlus} title={t('install.ios.step2')} hint={t('install.ios.hint2')} testID="install-ios-step-2" />
            <Step icon={CircleCheck} title={t('install.ios.step3')} hint={t('install.ios.hint3')} testID="install-ios-step-3" />
          </Card>
        ) : null}

        {context === 'ios-other' ? (
          <Card testID="install-ios-other">
            <Header icon={Globe} title={t('install.iosOther.title')} />
            <AppText>{t('install.iosOther.body')}</AppText>
            <AppButton variant="secondary" label={t('install.iosOther.action')} onPress={() => void copyLink()} testID="install-copy-link" />
          </Card>
        ) : null}

        {(context === 'android' || context === 'desktop') && install.canPrompt ? (
          <Card testID="install-prompt">
            <Header icon={context === 'android' ? Smartphone : Monitor} title={t(context === 'android' ? 'install.android.title' : 'install.desktop.title')} />
            <AppText>{t('install.android.body')}</AppText>
            <AppButton label={t('install.android.action')} onPress={() => void promptInstall()} testID="install-button" />
          </Card>
        ) : null}

        {(context === 'android' || context === 'desktop') && !install.canPrompt ? (
          <Card testID="install-manual">
            <Header icon={context === 'android' ? Smartphone : Monitor} title={t(context === 'android' ? 'install.android.title' : 'install.desktop.title')} />
            <AppText>{t('install.manual')}</AppText>
          </Card>
        ) : null}

        {message ? <FormMessage kind="success" text={message} testID="install-message" /> : null}

        <Card testID="install-benefits">
          <Header icon={BellRing} title={t('install.benefitsTitle')} />
          <AppText color="textMuted">{t('install.benefits')}</AppText>
        </Card>

        {context !== 'standalone' ? <AppButton variant="ghost" label={t('install.later')} onPress={later} testID="install-later" /> : null}
      </ScrollView>
    </StackScreen>
  );
}

function Header({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <Icon size={20} color={colors.primary} strokeWidth={iconStroke} />
      <AppText variant="h3" accessibilityRole="header" style={styles.flex}>
        {title}
      </AppText>
    </View>
  );
}

/** Зааврын нэг алхам: дүрс (Safari-ийн товчтой ижил) + гарчиг + тайлбар. */
function Step({ icon: Icon, title, hint, testID }: { icon: LucideIcon; title: string; hint: string; testID: string }) {
  const colors = useColors();
  return (
    <View style={styles.row} testID={testID} accessible accessibilityLabel={`${title}. ${hint}`}>
      <View style={[styles.stepIcon, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <Icon size={22} color={colors.primary} strokeWidth={iconStroke} />
      </View>
      <View style={styles.flex}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="caption" color="textMuted">
          {hint}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.md, width: '100%', maxWidth: 560, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  stepIcon: { width: 44, height: 44, borderRadius: radius.input, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
