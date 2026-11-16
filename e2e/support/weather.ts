import { startOpenMeteoMock, type OpenMeteoMock } from '../mocks/openMeteo';

/**
 * Open-Meteo mock-ийг backend-ийн заасан тогтмол порт дээр асаана (AC-71). Backend контейнерт
 * `AURA_WEATHER_BASE_URL=http://host.docker.internal:<порт>` (geocoding-д `AURA_GEOCODING_BASE_URL`)
 * — порт нь `E2E_OPEN_METEO_PORT` (анхдагч 8098). Backend нь хаягаа эхлэхдээ уншдаг тул санамсаргүй
 * порт болохгүй.
 */
export const OPEN_METEO_PORT = Number(process.env.E2E_OPEN_METEO_PORT ?? 8098);

export function startConfiguredOpenMeteo(): Promise<OpenMeteoMock> {
  return startOpenMeteoMock(OPEN_METEO_PORT);
}

/**
 * Backend цаг агаарыг байршлаар 30 мин кэшилдэг (координат 2 оронтой бутархайгаар, AC-210) —
 * өмнөх тест/ажиллалтын кэшид таарахгүйн тулд тест бүр өөр координат. Токиогийн ойролцоо.
 */
export function uniqueTokyo() {
  const n = Math.floor(Math.random() * 2000);
  return {
    name: 'Tokyo',
    countryCode: 'JP',
    lat: Number((35 + (n % 100) / 100).toFixed(2)),
    lon: Number((130 + Math.floor(n / 100) + Math.floor(Math.random() * 100) / 100).toFixed(2)),
    timezone: 'Asia/Tokyo',
  };
}
