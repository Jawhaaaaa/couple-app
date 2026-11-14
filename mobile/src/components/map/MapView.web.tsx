import { lazy, Suspense } from 'react';
import { View } from 'react-native';

import { useColors } from '@/theme/ThemeProvider';

import type { MapViewProps } from './types';

/**
 * Leaflet (~150 KB + CSS) эхний ачааллын bundle-д орохгүй — газрын зураг анх харагдах үед л тусдаа
 * chunk болж татагдана (FR-19.10, AC-160). Хэрэгжүүлэлт: `LeafletMap.tsx` (WebView-гүй, FR-19.8).
 */
const LeafletMap = lazy(() => import('./LeafletMap'));

export function MapView(props: MapViewProps) {
  const colors = useColors();
  return (
    <Suspense fallback={<View style={[{ flex: 1, minHeight: 280, backgroundColor: colors.surfaceRaised }, props.style]} testID="map-loading" />}>
      <LeafletMap {...props} />
    </Suspense>
  );
}
