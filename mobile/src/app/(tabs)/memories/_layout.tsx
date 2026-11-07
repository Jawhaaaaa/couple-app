import { Stack } from 'expo-router';

import { useColors } from '@/theme/ThemeProvider';

/**
 * Дурсамжийн stack (LLD §4.3): S-30 → S-31, S-34…S-37, S-39 (push). S-32 (`modal`), S-33 ба
 * S-38 (`fullScreenModal`) нь табын гадна — үндсэн `_layout.tsx`-д.
 */
export default function MemoriesStackLayout() {
  const colors = useColors();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="search" />
      <Stack.Screen name="favorites" />
      <Stack.Screen name="trash" />
      <Stack.Screen name="export" />
      <Stack.Screen name="groups/index" />
      <Stack.Screen name="groups/[id]" />
    </Stack>
  );
}
