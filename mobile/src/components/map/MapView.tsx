import { useMemo } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { clusterPoints, type MapPoint } from '@/map/cluster';
import { leafletHtml } from '@/map/leafletHtml';
import { useColors } from '@/theme/ThemeProvider';

import type { MapViewProps } from './types';

/** Товшсон cluster-ын цэгүүдийг id-аар сэргээнэ (WebView нь зөвхөн id буцаана). */
export function clusterFromIds(points: MapPoint[], ids: string[]) {
  const picked = points.filter((p) => ids.includes(p.id));
  if (picked.length === 0) return null;
  return clusterPoints(picked, 0, Number.POSITIVE_INFINITY)[0];
}

/**
 * S-70 газрын зураг — native-д WebView + Leaflet (§8.4, `react-native-webview` Expo Go-д бий).
 * Cluster, OSM attribution нь хуудсан дотор; товшилт `onMessage`-ээр.
 */
export function MapView({ points, onSelect, style, testID = 'map-view' }: MapViewProps) {
  const colors = useColors();
  const html = useMemo(() => leafletHtml(points, colors), [points, colors]);
  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as { ids?: string[] };
      const cluster = data.ids ? clusterFromIds(points, data.ids) : null;
      if (cluster) onSelect(cluster);
    } catch {
      // Хуудаснаас ирсэн гэрээний бус мессеж — үл тооно
    }
  };
  return (
    <View style={[{ flex: 1, minHeight: 280 }, style]} testID={testID}>
      <WebView
        source={{ html }}
        originWhitelist={['*']}
        onMessage={onMessage}
        javaScriptEnabled
        style={{ flex: 1, backgroundColor: colors.bg }}
      />
    </View>
  );
}
