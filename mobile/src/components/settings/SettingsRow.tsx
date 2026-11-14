import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

interface RowProps {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  danger?: boolean;
  testID?: string;
}

/** Тохиргооны жагсаалтын мөр: дүрс · нэр · сум (S-80). */
export function SettingsRow({ icon: Icon, label, onPress, danger, testID }: RowProps) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <Icon size={22} color={danger ? colors.danger : colors.primary} strokeWidth={iconStroke} />
      <AppText style={styles.flex} color={danger ? 'danger' : 'text'}>
        {label}
      </AppText>
      <ChevronRight size={20} color={colors.textMuted} strokeWidth={iconStroke} />
    </Pressable>
  );
}

/** Гарчигтай бүлэг. */
export function SettingsSection({ title, children, testID }: { title: string; children: ReactNode; testID?: string }) {
  return (
    <View style={styles.section} testID={testID}>
      <AppText variant="label" color="textMuted" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xs },
  flex: { flex: 1 },
  row: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.input,
  },
});
