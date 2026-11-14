import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

// i18n-ийг бусад модулиас өмнө эхлүүлнэ (side effect)
import { useT } from '@/i18n';
import { useBootstrap } from '@/api/queries/bootstrap';
import UpdateRequiredScreen from '@/app/update-required';
import { AppText } from '@/components/AppText';
import { SignalReceiver } from '@/components/home/SignalReceiver';
import { Mascot } from '@/components/Mascot';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ServerUnreachable } from '@/components/ServerUnreachable';
import { SettingsSync } from '@/components/settings/SettingsSync';
import { SpaceStatusBanner } from '@/components/settings/SpaceStatusBanner';
import { TimezonePrompt } from '@/components/TimezonePrompt';
import { AppLockProvider } from '@/lock/AppLockProvider';
import { installSoundPlayer } from '@/motion/sound';
import { useLocalReminderSync } from '@/notifications/useLocalReminderSync';
import { useNotificationTapRouting } from '@/notifications/useNotificationTapRouting';
import { startOutbox } from '@/offline/outboxRuntime';
import { persistOptions, queryClient } from '@/offline/persist';
import { startRealtime } from '@/realtime';
import { useSessionStore } from '@/stores/sessionStore';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { fontAssets } from '@/theme/typography';
import { startUploadQueue } from '@/upload/uploadRuntime';

SplashScreen.preventAutoHideAsync().catch(() => {});
installSoundPlayer();

/**
 * S-01 Splash (spec §6.1): хувилбар, сесс, `me` ачаалж дуустал маскот; сервер
 * хүрэхгүй ба кэш хоосон бол S-96; `minVersion` > апп бол шинэчлэх. Нэг удаа
 * бэлэн болсны дараа навигацийг дахин салгахгүй (оролт, түүх хэвээр).
 */
function SplashGate({ children }: { children: ReactNode }) {
  const boot = useBootstrap();
  const [opened, setOpened] = useState(false);
  if (boot.status === 'ready' && !opened) setOpened(true);

  // Сесс хүчингүй болбол (AUTH_SESSION_REVOKED, refresh дууссан) S-03 руу (AC-56, AC-168)
  useEffect(
    () =>
      useSessionStore.subscribe((state, prev) => {
        if (prev.accessToken && !state.accessToken && state.signedOut) {
          queryClient.removeQueries({ queryKey: ['me'] });
          router.replace('/login');
        }
      }),
    [],
  );

  // S-97: minVersion > апп — бүх апп хаагдана (навигаци ч рендэрлэгдэхгүй)
  if (boot.status === 'updateRequired') return <UpdateRequiredScreen />;
  if (opened) return children;
  if (boot.status === 'unreachable') return <ServerUnreachable onRetry={boot.retry} />;
  return <Splash />;
}

function Splash() {
  const t = useT();
  return (
    <View style={styles.center} testID="screen-S-01" accessibilityLabel={t('a11y.splash')}>
      <Mascot size={120} />
      <AppText variant="display">{t('app.name')}</AppText>
    </View>
  );
}

function ThemedStack() {
  const { mode, colors } = useTheme();
  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.bg }}>
        <OfflineBanner />
        {/* Зөвхөн харах/экспорт горим — хос тасалсан эсвэл хамтрагч устгагдсан (AC-127, AC-128) */}
        <SpaceStatusBanner />
        {/* Хосын сэдэв, маскотын өнгө → локал палитр (AC-138, AC-190) */}
        <SettingsSync />
      </SafeAreaView>
      <SplashGate>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen
            name="storage-full"
            options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, sheetCornerRadius: 24 }}
          />
          {/* S-32 дурсамж нэмэх/засах (modal), S-33 медиа үзэгч ба S-38 жилийн хураангуй (fullScreenModal) */}
          <Stack.Screen name="memory-editor" options={{ presentation: 'modal' }} />
          <Stack.Screen name="media/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="recap/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="year/[year]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          {/* S-25 ойн мэндчилгээ (ANIM-05, AC-39) */}
          <Stack.Screen name="celebration" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        </Stack>
        <TimezonePrompt />
        {/* Хамтрагчийн зүрх/тэврэлт аль ч дэлгэц дээр (ANIM-02, AC-17) */}
        <SignalReceiver />
      </SplashGate>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const ready = fontsLoaded || fontError != null;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  useEffect(() => startOutbox(), []);
  // Тасарсан upload-ыг апп нээгдэх, сүлжээ сэргэх үед үргэлжлүүлнэ (AC-20)
  useEffect(() => startUploadQueue(), []);
  // Нэвтэрсэн үед STOMP холболт (DD-AURA-008); токен солигдоход дахин холбогдоно
  useEffect(() => startRealtime(queryClient), []);
  useNotificationTapRouting();
  useLocalReminderSync();

  if (!ready) return null;
  return (
    <GestureHandlerRootView style={styles.root}>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <ThemeProvider>
          <AppLockProvider>
            <ThemedStack />
          </AppLockProvider>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
});
