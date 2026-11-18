import { Camera } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing } from '@/theme/tokens';

/**
 * «Зурагнаас авсан» тэмдэг (FR-5.2, AC-79): огноо/байршил EXIF-ээс бөглөгдсөн үед талбарын
 * дэргэд. Хэрэглэгч засмагц `MANUAL` болж алга болно.
 */
export function ExifSuggestion({ source, testID }: { source: 'EXIF' | 'MANUAL' | 'NONE'; testID: string }) {
  const t = useT();
  const colors = useColors();
  if (source !== 'EXIF') return null;
  return (
    <View style={[styles.badge, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} testID={testID}>
      <Camera size={14} color={colors.primary} strokeWidth={iconStroke} />
      <AppText variant="caption">{t('memories.editor.fromPhoto')}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
