import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { patchPreferences } from '@/api/queries/settings';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Mascot, type MascotPose } from '@/components/Mascot';
import data from '@/content/onboarding.json';
import { useT } from '@/i18n';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

/** Слайд бүрийн маскот: юу хийдэг (хоёулаа) · нууцлал (толгой хазайлгана) · хос болох (хоёулаа даллана). */
const MASCOTS: { pair: boolean; pose: MascotPose }[] = [
  { pair: true, pose: 'idle' },
  { pair: false, pose: 'tilt' },
  { pair: true, pose: 'wave' },
  { pair: false, pose: 'wave' },
];

/**
 * S-02 Танилцуулга (FR-16.1, AC-133): `onboarding.json`-ийн 3–4 слайд маскоттой — юу хийдэг · нууцлал ·
 * хос болох. «Алгасах» эсвэл сүүлийн «Эхлэх» → локал туг (`onboardingStore`, persist) ба нэвтэрсэн бол
 * `Preferences.introSeen` → эхлэлийн хаалга (`/`). Анх суулгахад НЭГ л удаа — хаалга дахин энд хөтлөхгүй.
 */
export default function IntroScreen() {
  const t = useT();
  const colors = useColors();
  const locale = usePrefsStore((s) => s.locale);
  const [index, setIndex] = useState(0);
  const slides = data.items;
  const slide = slides[index][locale];
  const mascot = MASCOTS[index % MASCOTS.length];
  const last = index === slides.length - 1;

  const finish = () => {
    useOnboardingStore.getState().markIntroSeen();
    // Нэвтэрсэн бол бусад төхөөрөмжид ч дахин гаргахгүй; амжилтгүй бол дараагийн синкээр (usePreferencesSync)
    if (useSessionStore.getState().accessToken) void patchPreferences({ introSeen: true }).catch(() => undefined);
    router.replace('/');
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} testID="screen-S-02">
      <View style={styles.top}>
        {!last ? <AppButton variant="ghost" label={t('onboarding.skip')} onPress={finish} testID="intro-skip" /> : null}
      </View>
      <View style={styles.slide} accessibilityLiveRegion="polite" testID={`intro-slide-${index + 1}`}>
        <View style={styles.mascots}>
          <Mascot size={mascot.pair ? 112 : 140} pose={mascot.pose} />
          {mascot.pair ? <Mascot name="bombii" size={112} pose={mascot.pose} /> : null}
        </View>
        <AppText variant="h1" accessibilityRole="header" style={styles.center} testID="intro-title">
          {slide.title}
        </AppText>
        <AppText color="textMuted" style={styles.center} testID="intro-body">
          {slide.body}
        </AppText>
      </View>
      <View style={styles.bottom}>
        <View style={styles.dots} accessible accessibilityLabel={t('onboarding.progress', { current: index + 1, total: slides.length })} testID="intro-dots">
          {slides.map((s, i) => (
            <View key={s.id} style={[styles.dot, { backgroundColor: i === index ? colors.primary : colors.border }, i === index && styles.dotActive]} />
          ))}
        </View>
        <View style={styles.actions}>
          {index > 0 ? (
            <AppButton variant="secondary" label={t('onboarding.back')} onPress={() => setIndex(index - 1)} testID="intro-back" style={styles.flex} />
          ) : null}
          <AppButton
            label={last ? t('onboarding.start') : t('onboarding.next')}
            onPress={last ? finish : () => setIndex(index + 1)}
            testID={last ? 'intro-start' : 'intro-next'}
            style={styles.flex}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: spacing.screen },
  top: { minHeight: 48, alignItems: 'flex-end' },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, maxWidth: 520, width: '100%', alignSelf: 'center' },
  mascots: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  center: { textAlign: 'center' },
  bottom: { gap: spacing.md, maxWidth: 520, width: '100%', alignSelf: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  dotActive: { width: 24 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
