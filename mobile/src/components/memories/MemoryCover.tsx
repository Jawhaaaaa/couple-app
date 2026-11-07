import { Image } from 'expo-image';
import { Images } from 'lucide-react-native';
import { type ImageStyle, StyleSheet, View, type ViewStyle } from 'react-native';

import { type MediaRef, mediaUrl } from '@/api/queries/memories';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke } from '@/theme/tokens';

interface Props {
  media: MediaRef | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  style?: ImageStyle;
  /** Зургийн alt (NFR-07). Өгөөгүй бол чимэглэл гэж үзнэ (эцэг элемент нь шошготой). */
  alt?: string | null;
  fit?: 'cover' | 'contain';
  testID?: string;
}

/** Нүүр зураг: blurhash орлуулгатай `expo-image`; видео бол poster. Медиагүй бол дүрс. */
export function MemoryCover({ media, size = 'md', style, alt, fit = 'cover', testID }: Props) {
  const colors = useColors();
  const uri = media?.kind === 'VIDEO' ? (media.urls.poster ?? null) : mediaUrl(media, size);
  if (!media || !uri) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.surfaceRaised }, style as ViewStyle]} testID={testID}>
        <Images size={28} color={colors.textMuted} strokeWidth={iconStroke} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      placeholder={media.blurhash ? { blurhash: media.blurhash } : undefined}
      contentFit={fit}
      transition={200}
      style={[styles.image, { backgroundColor: colors.surfaceRaised }, style]}
      accessible={!!alt}
      accessibilityRole={alt ? 'image' : undefined}
      accessibilityLabel={alt ?? undefined}
      alt={alt ?? undefined}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: '100%' },
  empty: { alignItems: 'center', justifyContent: 'center' },
});
