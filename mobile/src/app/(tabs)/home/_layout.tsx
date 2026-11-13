import { Stack } from 'expo-router';

import { useColors } from '@/theme/ThemeProvider';

/** Нүүрний stack: S-20 → S-22, S-23 (push), S-21 ба S-26 (`formSheet`). */
export default function HomeStackLayout() {
  const colors = useColors();
  const sheet = {
    presentation: 'formSheet',
    sheetGrabberVisible: true,
    sheetCornerRadius: 24,
    contentStyle: { backgroundColor: colors.bg },
  } as const;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="question" />
      <Stack.Screen name="on-this-day" />
      <Stack.Screen name="counter" options={{ ...sheet, sheetAllowedDetents: [0.6, 1] }} />
      <Stack.Screen name="thinking" options={{ ...sheet, sheetAllowedDetents: [0.5, 1] }} />
    </Stack>
  );
}
