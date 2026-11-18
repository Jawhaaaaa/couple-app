import { CircleAlert, CircleCheck, Info } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

interface Props {
  text: string;
  kind?: 'error' | 'success' | 'info';
  testID?: string;
}

/** Формын дээрх мэдэгдэл: юу болсныг нэг өгүүлбэрээр (алдаа · амжилт · мэдээлэл). */
export function FormMessage({ text, kind = 'error', testID }: Props) {
  const colors = useColors();
  const Icon = kind === 'error' ? CircleAlert : kind === 'success' ? CircleCheck : Info;
  const tone = kind === 'error' ? colors.danger : kind === 'success' ? colors.success : colors.tertiary;
  return (
    <View
      style={[styles.box, { backgroundColor: colors.surfaceRaised, borderColor: tone }]}
      accessibilityRole={kind === 'error' ? 'alert' : 'text'}
      accessibilityLiveRegion="polite"
      testID={testID ?? `form-${kind}`}
    >
      <Icon size={20} color={tone} strokeWidth={iconStroke} />
      <AppText style={styles.text}>{text}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    padding: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.input,
  },
  text: { flex: 1 },
});
