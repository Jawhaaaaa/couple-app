import { Pressable, StyleSheet, View } from 'react-native';

import { playHaptic } from '@/motion/haptics';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing, touchTarget } from '@/theme/tokens';

import { AppText } from './AppText';

interface Props<K extends string> {
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  testID?: string;
}

/** Дэлгэц доторх таб (S-30 Timeline / Газрын зураг / Recap): `tab` role, ANIM-10 haptic. */
export function SegmentedTabs<K extends string>({ options, value, onChange, testID }: Props<K>) {
  const colors = useColors();
  return (
    <View style={[styles.root, { backgroundColor: colors.surfaceRaised }]} accessibilityRole="tablist" testID={testID}>
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              if (selected) return;
              playHaptic('ANIM-10');
              onChange(o.key);
            }}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            testID={testID ? `${testID}-${o.key}` : undefined}
            style={[styles.tab, selected && { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <AppText variant="label" color={selected ? 'text' : 'textMuted'} numberOfLines={1}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', borderRadius: radius.pill, padding: spacing.xxs, gap: spacing.xxs },
  tab: {
    flex: 1,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: spacing.xs,
  },
});
