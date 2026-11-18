import { router } from 'expo-router';
import { MapPin, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { MemoryPlace } from '@/api/queries/memories';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { useT } from '@/i18n';
import { type MapCluster, type MapPoint, OSM_ATTRIBUTION } from '@/map/cluster';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

import { MapView } from './MapView';

export function placesToPoints(places: MemoryPlace[]): MapPoint[] {
  return places.map((p) => ({ id: `${p.lat},${p.lon},${p.placeName}`, lat: p.lat, lon: p.lon, label: p.placeName, count: p.count }));
}

/**
 * Дурсамжийн байршлын газрын зураг (FR-12.1, AC-86, AC-116) — S-70 ба S-30-ийн «Газрын зураг» таб
 * ижил `GET /memories/places`-ийг хуваалцана. Cluster/цэг товшвол тухайн газрын дурсамжууд руу.
 */
export function PlacesMap({ places, height = 360 }: { places: MemoryPlace[]; height?: number }) {
  const t = useT();
  const colors = useColors();
  const points = useMemo(() => placesToPoints(places), [places]);
  const [selected, setSelected] = useState<MapCluster | null>(null);
  return (
    <View style={styles.root}>
      <View style={[styles.map, { height, borderColor: colors.border }]}>
        <MapView points={points} onSelect={setSelected} />
      </View>
      <AppText variant="caption" color="textMuted" testID="map-attribution">
        {t('map.attribution', { osm: OSM_ATTRIBUTION })}
      </AppText>
      {selected ? (
        <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="map-selection">
          <View style={styles.panelHead}>
            <AppText variant="h3" style={styles.flex}>
              {t('memories.count', { count: selected.count })}
            </AppText>
            <Pressable onPress={() => setSelected(null)} accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.close}>
              <X size={20} color={colors.textMuted} strokeWidth={iconStroke} />
            </Pressable>
          </View>
          {selected.points.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => router.push({ pathname: '/memories/search', params: { place: p.label } })}
              accessibilityRole="link"
              accessibilityLabel={`${p.label}, ${t('memories.count', { count: p.count })}`}
              style={styles.place}
              testID="map-place"
            >
              <MapPin size={18} color={colors.primary} strokeWidth={iconStroke} />
              <AppText style={styles.flex}>{p.label}</AppText>
              <AppText variant="caption" color="textMuted">
                {t('memories.count', { count: p.count })}
              </AppText>
            </Pressable>
          ))}
          {selected.points.length === 1 ? (
            <AppButton
              label={t('map.openMemories')}
              variant="secondary"
              onPress={() => router.push({ pathname: '/memories/search', params: { place: selected.points[0].label } })}
              testID="map-open-memories"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  map: { borderRadius: radius.card, overflow: 'hidden', borderWidth: 1 },
  panel: { borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs },
  panelHead: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  close: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  place: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: touchTarget },
});
