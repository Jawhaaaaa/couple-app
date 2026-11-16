import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { api } from '@/api/client';
import MapScreen from '@/app/(tabs)/together/map';
import { clusterFromIds } from '@/components/map/MapView';
import { placesToPoints } from '@/components/map/PlacesMap';
import { boundsOf, clusterPoints, type MapPoint, OSM_ATTRIBUTION, project } from '@/map/cluster';
import { leafletHtml } from '@/map/leafletHtml';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';
import { basePalette } from '@/theme/tokens';

import { ME, ok, renderWithClient } from '../../../test/memoryFixtures';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const UB: MapPoint = { id: 'ub', lat: 47.918, lon: 106.917, label: 'Улаанбаатар', count: 3 };
const ZAISAN: MapPoint = { id: 'za', lat: 47.886, lon: 106.917, label: 'Зайсан', count: 1 };
const TERELJ: MapPoint = { id: 'te', lat: 47.98, lon: 107.45, label: 'Тэрэлж', count: 2 };
const TOKYO: MapPoint = { id: 'to', lat: 35.68, lon: 139.69, label: 'Токио', count: 1 };

describe('AC-116 cluster', () => {
  it('Web Mercator: (0,0) нь zoom 0-д 128,128 пиксел', () => {
    expect(project(0, 0, 0)).toEqual({ x: 128, y: 128 });
  });

  it('жижиг zoom-д ойрхон цэгүүд нэг cluster (тоо = дурсамжийн нийлбэр), том zoom-д салангид', () => {
    const far = clusterPoints([UB, ZAISAN, TERELJ, TOKYO], 4);
    expect(far).toHaveLength(2);
    const mongolia = far.find((c) => c.points.some((p) => p.id === 'ub'))!;
    expect(mongolia.count).toBe(6);
    expect(mongolia.points.map((p) => p.id).sort()).toEqual(['te', 'ub', 'za']);

    const near = clusterPoints([UB, ZAISAN, TERELJ, TOKYO], 15);
    expect(near).toHaveLength(4);
  });

  it('төв нь дурсамжийн тоогоор жигнэсэн; хүрээ бүх цэгийг багтаана', () => {
    const [c] = clusterPoints([UB, ZAISAN], 3);
    expect(c.lat).toBeCloseTo((47.918 * 3 + 47.886) / 4, 5);
    expect(boundsOf([UB, TOKYO])).toEqual([
      [35.68, 106.917],
      [47.918, 139.69],
    ]);
  });

  it('native WebView-ийн HTML-д OSM attribution, `</script>` escape; товшсон id-аар cluster сэргээнэ', () => {
    const html = leafletHtml([{ ...UB, label: '</script><b>x' }], basePalette.dark);
    expect(html).toContain(JSON.stringify(OSM_ATTRIBUTION));
    expect(html).not.toContain('</script><b>x');
    expect(clusterFromIds([UB, TERELJ], ['ub', 'te'])?.count).toBe(5);
    expect(clusterFromIds([UB], ['nope'])).toBeNull();
  });
});

describe('S-70 газрын зураг', () => {
  const spies: jest.SpyInstance[] = [];
  beforeEach(() => {
    jest.clearAllMocks();
    usePrefsStore.setState({ ...defaultPrefs });
    useSessionStore.setState({ accessToken: 'at', userId: ME.id, signedOut: false });
    spies.push(
      jest.spyOn(api, 'GET').mockImplementation((async () =>
        ok([
          { lat: UB.lat, lon: UB.lon, placeName: 'Улаанбаатар', memoryIds: ['m1', 'm2', 'm3'], count: 3 },
          { lat: TERELJ.lat, lon: TERELJ.lon, placeName: 'Тэрэлж', memoryIds: ['m4', 'm5'], count: 2 },
        ])) as never),
    );
  });
  afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

  it('AC-116 газрын зураг OSM attribution-тай; WebView-ийн товшилтоор тухайн газрын дурсамж руу', async () => {
    await renderWithClient(<MapScreen />);
    expect(await screen.findByTestId('screen-S-70')).toBeTruthy();
    // screen-S-70 skeleton үед ч гардаг — газрын зураг өгөгдөл ирсний дараа л рендэрлэгдэнэ.
    expect(await screen.findByTestId('map-attribution')).toHaveTextContent(/OpenStreetMap/);
    const webview = screen.getByTestId('webview');
    const ids = placesToPoints([{ lat: TERELJ.lat, lon: TERELJ.lon, placeName: 'Тэрэлж', memoryIds: [], count: 2 }]).map((p) => p.id);
    await act(async () => webview.props.onMessage({ nativeEvent: { data: JSON.stringify({ ids }) } }));
    expect(screen.getByTestId('map-selection')).toHaveTextContent(/Тэрэлж/);
    await fireEvent.press(screen.getByTestId('map-open-memories'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/memories/search', params: { place: 'Тэрэлж' } });
  });

  it('байршилтай дурсамжгүй бол хоосон төлөв', async () => {
    spies.push(jest.spyOn(api, 'GET').mockImplementation((async () => ok([])) as never));
    await renderWithClient(<MapScreen />);
    expect(await screen.findByTestId('state-empty-action')).toBeTruthy();
    expect(screen.queryByTestId('webview')).toBeNull();
  });
});
