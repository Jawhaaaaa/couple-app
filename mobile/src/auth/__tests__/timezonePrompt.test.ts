import { useTimezonePromptStore } from '@/stores/timezonePromptStore';

import { rememberZone, timezoneToAsk } from '../timezonePrompt';

const UB = 'Asia/Ulaanbaatar';
const TOKYO = 'Asia/Tokyo';
const SEOUL = 'Asia/Seoul';

describe('AC-64 цагийн бүс солих асуулт', () => {
  beforeEach(() => useTimezonePromptStore.setState({ answeredZones: [] }));

  it('AC-64 төхөөрөмжийн шинэ бүсийн хувьд нэг удаа асууна', () => {
    expect(timezoneToAsk({ deviceZone: TOKYO, profileZone: UB, answeredZones: [] })).toBe(TOKYO);
    // Өөр шинэ бүс — тэр бүсийн хувьд мөн нэг удаа асууна
    expect(timezoneToAsk({ deviceZone: SEOUL, profileZone: UB, answeredZones: [TOKYO] })).toBe(SEOUL);
  });

  it('AC-64 бүс ижил бол асуухгүй', () => {
    expect(timezoneToAsk({ deviceZone: UB, profileZone: UB, answeredZones: [] })).toBeNull();
  });

  it('AC-64 профайл эсвэл төхөөрөмжийн бүс тодорхойгүй бол асуухгүй', () => {
    expect(timezoneToAsk({ deviceZone: null, profileZone: UB, answeredZones: [] })).toBeNull();
    expect(timezoneToAsk({ deviceZone: TOKYO, profileZone: undefined, answeredZones: [] })).toBeNull();
  });

  it('AC-64 хариулсан бүсийг дахин асуухгүй (зөвшөөрсөн ч, татгалзсан ч)', () => {
    const store = useTimezonePromptStore.getState();
    expect(timezoneToAsk({ deviceZone: TOKYO, profileZone: UB, answeredZones: store.answeredZones })).toBe(TOKYO);

    useTimezonePromptStore.getState().markAnswered(TOKYO);
    const answered = useTimezonePromptStore.getState().answeredZones;
    expect(answered).toEqual([TOKYO]);
    // Дахин нээхэд (профайл хэвээр UB) — асуухгүй
    expect(timezoneToAsk({ deviceZone: TOKYO, profileZone: UB, answeredZones: answered })).toBeNull();
  });

  it('AC-64 хариулсан бүсийг давхардуулахгүй, сүүлийн 20-ийг хадгална', () => {
    expect(rememberZone([TOKYO, SEOUL], TOKYO)).toEqual([SEOUL, TOKYO]);
    const many = Array.from({ length: 25 }, (_, i) => `Etc/GMT+${i % 12}-${i}`);
    expect(many.reduce<string[]>((acc, z) => rememberZone(acc, z), [])).toHaveLength(20);
  });
});
