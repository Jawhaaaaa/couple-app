import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

import { AppText } from './AppText';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  /** Дэлгэц уншигчид (өгөөгүй бол `label`). */
  accessibilityLabel?: string;
  testID?: string;
}

/** Шүүлтүүр/сонголтын chip (≥ 44 өндөр, NFR-07): сонгогдсон бол `primary` дэвсгэр. */
export function Chip({ label, selected = false, onPress, icon: Icon, disabled, accessibilityLabel, testID }: ChipProps) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled: !!disabled }}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {Icon ? <Icon size={16} color={selected ? colors.onPrimary : colors.text} strokeWidth={iconStroke} /> : null}
      <AppText variant="label" color={selected ? 'onPrimary' : 'text'}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** Хэвтээ гүйдэг chip-ийн мөр. */
export function ChipRow({ children, wrap = false, testID }: { children: ReactNode; wrap?: boolean; testID?: string }) {
  if (wrap) {
    return (
      <View style={styles.wrap} testID={testID}>
        {children}
      </View>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} testID={testID}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  row: { gap: spacing.xs, paddingVertical: spacing.xxs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
