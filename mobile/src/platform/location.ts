import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { getPosition, type PositionOutcome, roundCoord } from '@/pwa/webFallbacks';

export type CoordsOutcome = { status: 'ok'; lat: number; lon: number } | { status: 'denied' } | { status: 'failed' };

/**
 * Одоогийн байршил — чатад байршил илгээх (S-40), дурсамжийн байршил (S-32):
 * - native — `expo-location` (зөвшөөрөл → нэг удаагийн байршил)
 * - вэб — `navigator.geolocation` (`getPosition`, FR-19.8, AC-158): нэг зөвшөөрлийн цонх,
 *   хуучин кэш авахгүй. Geolocation-гүй хөтөч `failed` — дуудагч гараар бичих талбар руу.
 */
export async function currentCoords(): Promise<CoordsOutcome> {
  if (Platform.OS === 'web') return fromWeb(await getPosition());
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { status: 'ok', lat: roundCoord(pos.coords.latitude), lon: roundCoord(pos.coords.longitude) };
  } catch {
    return { status: 'failed' };
  }
}

function fromWeb(out: PositionOutcome): CoordsOutcome {
  if (out.status === 'ok') return { status: 'ok', lat: out.lat, lon: out.lon };
  return { status: out.status === 'denied' ? 'denied' : 'failed' };
}
