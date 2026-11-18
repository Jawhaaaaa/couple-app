import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

interface Props {
  children: ReactNode;
  testID?: string;
  style?: ViewStyle;
}

/** Агуулгын карт (§3.3): `surface` дэвсгэр, 24 радиус, хүрээ. */
export function Card({ children, testID, style }: Props) {
  const colors = useColors();
  return (
    <View testID={testID} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
});
