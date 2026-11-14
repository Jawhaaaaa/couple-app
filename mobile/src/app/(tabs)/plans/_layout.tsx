import { Stack } from 'expo-router';

import { useColors } from '@/theme/ThemeProvider';

/** Төлөвлөгөөний stack: S-50 → S-51…S-54, S-56…S-59 (push), S-55 (`formSheet`). */
export default function PlansStackLayout() {
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
      <Stack.Screen name="calendar" />
      <Stack.Screen name="ideas" />
      <Stack.Screen name="idea-editor" />
      <Stack.Screen name="random" />
      <Stack.Screen name="deck" />
      <Stack.Screen name="library" />
      <Stack.Screen name="budget" />
      <Stack.Screen name="new" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="[id]/counter" options={{ ...sheet, sheetAllowedDetents: [0.7, 1] }} />
    </Stack>
  );
}
