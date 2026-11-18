import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing, touchTarget } from '@/theme/tokens';

import { AppText } from './AppText';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  style?: ViewStyle;
}

/** Pill товч (§3.3): ≥ 44×44 (NFR-07), бичиг нь `onPrimary` (AC-DS-01). */
export function AppButton({ label, onPress, variant = 'primary', disabled, loading, testID, style }: Props) {
  const colors = useColors();
  const bg = variant === 'primary' ? colors.primary : variant === 'secondary' ? colors.surfaceRaised : 'transparent';
  const fg = variant === 'primary' ? 'onPrimary' : 'text';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, borderColor: colors.border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'secondary' && styles.bordered,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={colors[fg]} /> : <AppText variant="label" color={fg}>{label}</AppText>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    minWidth: touchTarget,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bordered: { borderWidth: 1 },
});
