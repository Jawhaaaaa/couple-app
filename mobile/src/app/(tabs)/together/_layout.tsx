import { Stack } from 'expo-router';

import { useColors } from '@/theme/ThemeProvider';

/** «Хамтдаа» табын stack — дэвсгэр нь theme-ийн `bg` (навигацийн анхдагч цайвар саарал биш, AC-197). */
export default function TogetherStackLayout() {
  const colors = useColors();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
