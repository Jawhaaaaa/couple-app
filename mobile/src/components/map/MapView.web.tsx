import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { boundsOf, clusterPoints, OSM_ATTRIBUTION, OSM_TILE_URL } from '@/map/cluster';
import { useColors } from '@/theme/ThemeProvider';

import type { MapViewProps } from './types';

/**
 * S-70 газрын зураг — вэбэд Leaflet шууд (WebView-гүй, FR-19.8). Ойрхон цэгүүд тоотой cluster
 * болж (zoom бүрд дахин тооцно, AC-116), товшвол `onSelect`; OSM attribution заавал.
 */
export function MapView({ points, onSelect, style, testID = 'map-view' }: MapViewProps) {
  const colors = useColors();
  const container = useRef<HTMLElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const latest = useRef({ points, onSelect, colors });

  useEffect(() => {
    latest.current = { points, onSelect, colors };
  });

  useEffect(() => {
    const el = container.current;
    if (!el || map.current) return;
    const m = L.map(el, { zoomControl: true, attributionControl: true, worldCopyJump: true });
    L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 18 }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const draw = () => {
      const group = layer.current;
      if (!group) return;
      group.clearLayers();
      const { points: pts, onSelect: select, colors: c } = latest.current;
      for (const cluster of clusterPoints(pts, m.getZoom())) {
        const size = cluster.points.length > 1 ? 40 : 32;
        const label = cluster.points.length > 1 ? `${cluster.count}` : `${cluster.points[0].count}`;
        const icon = L.divIcon({
          className: 'aura-map-marker',
          iconSize: [size, size],
          html: `<div data-testid="${cluster.points.length > 1 ? 'map-cluster' : 'map-marker'}" style="width:${size}px;height:${size}px;border-radius:50%;background:${c.primary};color:${c.onPrimary};border:2px solid ${c.surface};display:flex;align-items:center;justify-content:center;font:700 13px Nunito_700Bold, sans-serif;box-shadow:0 0 12px ${c.glow}">${label}</div>`,
        });
        const title = cluster.points.map((p) => p.label).join(', ');
        L.marker([cluster.lat, cluster.lon], { icon, title, keyboard: true, alt: title })
          .on('click', () => select(cluster))
          .addTo(group);
      }
    };
    m.on('zoomend', draw);
    const [[s, w], [n, e]] = boundsOf(latest.current.points);
    m.fitBounds([[s, w], [n, e]], { padding: [40, 40], maxZoom: 13 });
    draw();
    return () => {
      m.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  // Өгөгдөл солигдоход дахин зурна (zoom хэвээр)
  useEffect(() => {
    map.current?.fire('zoomend');
  }, [points, colors]);

  // RN Web-д View-ийн ref нь DOM элемент
  return <View ref={container as never} style={[{ flex: 1, minHeight: 280 }, style]} testID={testID} />;
}
