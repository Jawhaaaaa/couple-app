import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, spacing, touchTarget } from '@/theme/tokens';

import { AppText } from './AppText';

/** Табын stack-ийн дэд дэлгэц (S-22 г.м.): «Буцах» товч + гарчиг + агуулга. */
export function StackScreen({ title, children, testID }: { title: string; children: ReactNode; testID?: string }) {
  const t = useT();
  const colors = useColors();
  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={styles.back}
          testID="stack-back"
        >
          <ChevronLeft size={26} color={colors.text} strokeWidth={iconStroke} />
        </Pressable>
        <AppText variant="h1" accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {title}
        </AppText>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs, paddingVertical: spacing.xs, gap: spacing.xxs },
  back: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1 },
  body: { flex: 1 },
});
