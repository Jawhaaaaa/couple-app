import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { router, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { lazy, type ReactNode, startTransition, Suspense, useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

// i18n-ийг бусад модулиас өмнө эхлүүлнэ (side effect)
import { useT } from '@/i18n';
import { useBootstrap } from '@/api/queries/bootstrap';
import { needsLogin } from '@/auth/gate';
import { AppText } from '@/components/AppText';
import { Mascot } from '@/components/Mascot';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ServerUnreachable } from '@/components/ServerUnreachable';
import { SettingsSync } from '@/components/settings/SettingsSync';
import { SpaceStatusBanner } from '@/components/settings/SpaceStatusBanner';
import { UpdateBanner } from '@/components/UpdateBanner';
import { AppLockProvider } from '@/lock/AppLockProvider';
import { installSoundPlayer } from '@/motion/sound';
import { useLocalReminderSync } from '@/notifications/useLocalReminderSync';
import { useNotificationTapRouting } from '@/notifications/useNotificationTapRouting';
import { startOutbox } from '@/offline/outboxRuntime';
import { persistOptions, queryClient, refreshRestoredQueries } from '@/offline/persist';
import { captureInstallPrompt } from '@/pwa/pwaStore';
import { registerServiceWorker } from '@/pwa/registerSW';
import { startRealtime } from '@/realtime';
import { useSessionStore } from '@/stores/sessionStore';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { basePalette, spacing } from '@/theme/tokens';
import { fontAssets } from '@/theme/typography';
import { startUploadQueue } from '@/upload/uploadRuntime';

SplashScreen.preventAutoHideAsync().catch(() => {});
// `beforeinstallprompt` ачаалсны дараахан ирдэг — PwaPrompts lazy тул энд (модуль ачаалагдах үед) барина
if (Platform.OS === 'web') captureInstallPrompt();

/*
 * Эхний дэлгэцэд шаардлагагүй бүрэлдэхүүнүүд тусдаа chunk-аар (FR-19.10 «маршрут бүр lazy»): root
 * layout-ын модуль ачаалах нэг урт task-ийг (TBT, AC-152) багасгана. Бүгд дэлгэцгүй эсвэл үйл явдлаар
 * гарч ирдэг тул хэдэн зуун мс хожуу ачаалагдах нь хэрэглэгчид мэдэгдэхгүй.
 */
const UpdateRequiredScreen = lazy(() => import('@/app/update-required'));
const SignalReceiver = lazy(() => import('@/components/home/SignalReceiver').then((m) => ({ default: m.SignalReceiver })));
const PwaPrompts = lazy(() => import('@/components/PwaPrompts').then((m) => ({ default: m.PwaPrompts })));
const TimezonePrompt = lazy(() => import('@/components/TimezonePrompt').then((m) => ({ default: m.TimezonePrompt })));
const HapticFlash = lazy(() => import('@/motion/HapticFlash').then((m) => ({ default: m.HapticFlash })));
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

  // Сессгүйгээр хамгаалагдсан route-ыг (дахин ачаалал, хуучин таб) нээвэл S-03 руу (AC-56, AC-125)
  const segments = useSegments();
  const mustLogin = boot.status === 'ready' && needsLogin(boot.signedIn, segments);
  useEffect(() => {
    if (mustLogin) router.replace('/login');
  }, [mustLogin]);

  // S-97: minVersion > апп — бүх апп хаагдана (навигаци ч рендэрлэгдэхгүй)
  if (boot.status === 'updateRequired') {
    return (
      <Suspense fallback={<Splash />}>
        <UpdateRequiredScreen />
      </Suspense>
    );
  }
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
        {/* Вэб: шинэ service worker бэлэн — «Шинэчлэх» (FR-19.9, AC-191) */}
        <UpdateBanner />
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
          {/* S-101 мэдэгдлийн зөвшөөрлийн тайлбар (FR-19.3) */}
          <Stack.Screen
            name="push-permission"
            options={{ presentation: 'formSheet', sheetAllowedDetents: [0.75, 1], sheetGrabberVisible: true, sheetCornerRadius: 24 }}
          />
          {/* S-32 дурсамж нэмэх/засах (modal), S-33 медиа үзэгч ба S-38 жилийн хураангуй (fullScreenModal) */}
          <Stack.Screen name="memory-editor" options={{ presentation: 'modal' }} />
          <Stack.Screen name="media/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="recap/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="year/[year]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          {/* S-25 ойн мэндчилгээ (ANIM-05, AC-39) */}
          <Stack.Screen name="celebration" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        </Stack>
        <Suspense fallback={null}>
          <TimezonePrompt />
          {/* Хамтрагчийн зүрх/тэврэлт аль ч дэлгэц дээр (ANIM-02, AC-17) */}
          <SignalReceiver />
          {/* Вэб: нэвтэрсний дараа S-100 суулгах / S-101 мэдэгдэл (FR-19.2, FR-19.3) */}
          <PwaPrompts />
        </Suspense>
      </SplashGate>
      {/* Вэб (iOS Safari): haptic-ийн оронд тод дүрслэл (FR-19.7, AC-217 (б)) */}
      <Suspense fallback={null}>
        <HapticFlash />
      </Suspense>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  // Вэбэд фонт татагдахыг хүлээхгүй (FR-19.10, AC-160 LCP): `@font-face` солигдох хүртэл системийн
  // фонтоор; native-д splash дэлгэц фонтыг хүлээнэ (текст үсрэхгүй)
  const ready = Platform.OS === 'web' || fontsLoaded || fontError != null;

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
  // Вэб: service worker — offline shell, кэш, шинэ хувилбар (FR-19.5, AC-140, AC-156)
  useEffect(() => registerServiceWorker(), []);

  // Вэб: апп-ын модны эхний рендэрийг transition-оор (React хэсэгчлэн, 5 мс тутам main thread-ийг
  // чөлөөлнө) — нэг урт task болж TBT-г (AC-152) өсгөдөг байв. Тэр хооронд index.html-ийн S-01 splash-тай
  // ижил дүр (createRoot static splash-ийг цэвэрлэнэ).
  const [mounted, setMounted] = useState(Platform.OS !== 'web');
  useEffect(() => {
    if (!mounted) startTransition(() => setMounted(true));
  }, [mounted]);

  if (!ready) return null;
  if (!mounted) return <WebBootSplash />;
  return (
    <GestureHandlerRootView style={styles.root}>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions} onSuccess={() => void refreshRestoredQueries(queryClient)}>
        <ThemeProvider>
          <AppLockProvider>
            <ThemedStack />
          </AppLockProvider>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}

/** `public/index.html`-ийн `#aura-splash`-тай ижил (зураг 224, «Aura») — шилжилт харагдахгүй. */
function WebBootSplash() {
  const t = useT();
  return (
    <View style={styles.boot} testID="boot-splash">
      <Image source={{ uri: '/icons/icon-512.png' }} style={styles.bootIcon} accessibilityIgnoresInvertColors />
      <Text style={styles.bootText}>{t('app.name')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: basePalette.dark.bg },
  bootIcon: { width: 224, height: 224, borderRadius: 48 },
  bootText: { color: basePalette.dark.text, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 40, lineHeight: 44 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
});
