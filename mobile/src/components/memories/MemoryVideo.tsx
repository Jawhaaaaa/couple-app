import { useVideoPlayer, VideoView } from 'expo-video';
import { type ComponentRef, useEffect, useRef } from 'react';
import { Platform, View, type ViewStyle } from 'react-native';

import type { MediaRef } from '@/api/queries/memories';

/**
 * READY видео (`expo-video`, H.264 720p — T-34, AC-24): системийн удирдлагатай, автоматаар
 * тоглохгүй (хэрэглэгч эхлүүлнэ). Вэбд `<video>` болж рендэрлэгдэнэ.
 *
 * Poster (`urls.poster`, сервер 1 с-ийн кадраас үүсгэнэ): `VideoView` нь poster-ийн prop-гүй тул
 * вэбд `<video poster>`-ийг шууд тавина — тоглуулахаас өмнө хар/хоосон хүрээ харагдахгүй.
 */
export function MemoryVideo({ media, label, style, testID }: { media: MediaRef; label: string; style?: ViewStyle; testID?: string }) {
  const player = useVideoPlayer(media.urls.original, (p) => {
    p.loop = false;
  });
  const box = useRef<ComponentRef<typeof View>>(null);
  const poster = media.urls.poster ?? null;
  useEffect(() => {
    if (Platform.OS !== 'web' || !poster) return;
    // react-native-web: View-ийн ref нь DOM элемент
    const video = (box.current as unknown as HTMLElement | null)?.querySelector('video');
    video?.setAttribute('poster', poster);
  }, [poster]);
  return (
    <View ref={box} style={style} testID={testID}>
      <VideoView player={player} style={style} nativeControls contentFit="contain" accessibilityLabel={label} accessibilityRole="image" />
    </View>
  );
}
