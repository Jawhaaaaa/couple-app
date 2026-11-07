import { distanceKm } from '../geo';

describe('AC-74 агаарын шугамын зай (haversine)', () => {
  const ulaanbaatar = { lat: 47.9077, lon: 106.8832 };
  const tokyo = { lat: 35.6895, lon: 139.6917 };

  it('AC-74 Улаанбаатар – Токио ≈ 3 009 км (±1%)', () => {
    const km = distanceKm(ulaanbaatar, tokyo);
    expect(km).toBeGreaterThan(3009 * 0.99);
    expect(km).toBeLessThan(3009 * 1.01);
  });

  it('тэгш хэмтэй, ижил цэгт 0', () => {
    expect(distanceKm(tokyo, ulaanbaatar)).toBeCloseTo(distanceKm(ulaanbaatar, tokyo), 9);
    expect(distanceKm(tokyo, tokyo)).toBe(0);
  });

  it('эсрэг цэг ≈ дэлхийн хагас тойрог', () => {
    expect(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 180 })).toBeCloseTo(Math.PI * 6371.0088, 3);
  });
});
