import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, spacing, touchTarget } from '@/theme/tokens';

import { AppText } from './AppText';

interface Props {
  title: string;
  children: ReactNode;
  testID?: string;
  /** Хаах үйлдэл (анхдагч — буцах, түүх хоосон бол нүүр). */
  onClose?: () => void;
}

export function closeSheet() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** `formSheet` дэлгэцийн хүрээ (S-21, S-26, S-98): гарчиг + хаах товч + гүйлгэх агуулга. */
export function SheetScreen({ title, children, testID, onClose = closeSheet }: Props) {
  const t = useT();
  const colors = useColors();
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]} testID={testID}>
      <View style={styles.header}>
        <AppText variant="h2" accessibilityRole="header" style={styles.title}>
          {title}
        </AppText>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.close} testID="sheet-close">
          <X size={24} color={colors.text} strokeWidth={iconStroke} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.screen, paddingTop: spacing.md, gap: spacing.xs },
  title: { flex: 1 },
  close: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  body: { padding: spacing.screen, gap: spacing.md, width: '100%', maxWidth: 560, alignSelf: 'center' },
});
