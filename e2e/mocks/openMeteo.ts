import { createServer, type Server } from 'node:http';

/**
 * Open-Meteo (цаг агаар ба geocoding) mock (AC-71, AC-100, AC-210). Backend-ийг
 * `AURA_WEATHER_BASE_URL` / `AURA_GEOCODING_BASE_URL`-аар энэ сервер рүү чиглүүлнэ.
 * `fail` горимд 503 буцааж «цаг агаар татагдахгүй» төлөвийг шалгана.
 */
export const CITIES: Record<string, { name: string; latitude: number; longitude: number; country_code: string; timezone: string }> = {
  ulaanbaatar: { name: 'Улаанбаатар', latitude: 47.9077, longitude: 106.8832, country_code: 'MN', timezone: 'Asia/Ulaanbaatar' },
  tokyo: { name: 'Tokyo', latitude: 35.6895, longitude: 139.6917, country_code: 'JP', timezone: 'Asia/Tokyo' },
};

export interface OpenMeteoMock {
  url: string;
  requests: string[];
  setFail(fail: boolean): void;
  close(): Promise<void>;
}

export async function startOpenMeteoMock(port = 0): Promise<OpenMeteoMock> {
  const requests: string[] = [];
  let fail = false;
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    requests.push(url.pathname + url.search);
    res.setHeader('Content-Type', 'application/json');
    if (fail) {
      res.statusCode = 503;
      return res.end('{"error":true}');
    }
    if (url.pathname.endsWith('/search')) {
      const q = (url.searchParams.get('name') ?? '').toLowerCase();
      const hits = Object.entries(CITIES)
        .filter(([key, c]) => key.startsWith(q) || c.name.toLowerCase().startsWith(q))
        .map(([, c], i) => ({ id: i + 1, ...c }));
      return res.end(JSON.stringify({ results: hits }));
    }
    const days = Array.from({ length: 16 }, (_, i) => new Date(Date.UTC(2026, 10, 7 + i)).toISOString().slice(0, 10));
    return res.end(
      JSON.stringify({
        current: { temperature_2m: -18.4, weather_code: 71, is_day: 1 },
        daily: {
          time: days,
          temperature_2m_max: days.map(() => -12),
          temperature_2m_min: days.map(() => -26),
          weather_code: days.map(() => 3),
        },
      }),
    );
  });
  await new Promise<void>((r) => server.listen(port, r));
  const address = server.address();
  const actual = typeof address === 'object' && address ? address.port : port;
  return {
    url: `http://localhost:${actual}`,
    requests,
    setFail: (v) => {
      fail = v;
    },
    close: () => new Promise((r) => server.close(() => r())),
  };
}
