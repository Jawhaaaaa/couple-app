import { Stack } from 'expo-router';

import { useColors } from '@/theme/ThemeProvider';

/** Чатын stack: S-40 → S-42, S-43, S-44 (push), S-46, S-47 (`formSheet`). */
export default function ChatStackLayout() {
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
      <Stack.Screen name="disappearing" options={{ ...sheet, sheetAllowedDetents: [0.5, 1] }} />
      <Stack.Screen name="promise" options={{ ...sheet, sheetAllowedDetents: [0.6, 1] }} />
      <Stack.Screen name="pins" />
      <Stack.Screen name="search" />
      <Stack.Screen name="media" />
    </Stack>
  );
}
