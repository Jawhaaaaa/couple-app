import { useVideoPlayer, VideoView } from 'expo-video';
import type { ViewStyle } from 'react-native';

import type { MediaRef } from '@/api/queries/memories';

/**
 * READY видео (`expo-video`, H.264 720p — T-34): системийн удирдлагатай, автоматаар
 * тоглохгүй (хэрэглэгч эхлүүлнэ). Вэбд `<video>` болж рендэрлэгдэнэ.
 */
export function MemoryVideo({ media, label, style, testID }: { media: MediaRef; label: string; style?: ViewStyle; testID?: string }) {
  const player = useVideoPlayer(media.urls.original, (p) => {
    p.loop = false;
  });
  return (
    <VideoView
      player={player}
      style={style}
      nativeControls
      contentFit="contain"
      accessibilityLabel={label}
      accessibilityRole="image"
      testID={testID}
    />
  );
}
