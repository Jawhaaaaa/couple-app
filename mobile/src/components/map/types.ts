import type { StyleProp, ViewStyle } from 'react-native';

import type { MapCluster, MapPoint } from '@/map/cluster';

export interface MapViewProps {
  points: MapPoint[];
  onSelect: (cluster: MapCluster) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}
