import { Image } from 'expo-image';
import { CircleUser } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius } from '@/theme/tokens';

interface Props {
  uri: string | null | undefined;
  /** Дэлгэц уншигчид — «Ану-гийн зураг» г.м. */
  label: string;
  size?: number;
  testID?: string;
}

/** Дугуй профайл зураг; зураггүй бол дүрс тэмдэг. */
export function UserAvatar({ uri, label, size = 72, testID }: Props) {
  const colors = useColors();
  const frame = { width: size, height: size, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, borderColor: colors.border };
  return (
    <View style={[styles.frame, frame]} accessibilityRole="image" accessibilityLabel={label} testID={testID}>
      {uri ? (
        <Image accessibilityLabel="" source={{ uri }} style={[styles.image, { borderRadius: radius.pill }]} contentFit="cover" accessible={false} />
      ) : (
        <CircleUser size={size * 0.55} color={colors.textMuted} strokeWidth={iconStroke} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
});
