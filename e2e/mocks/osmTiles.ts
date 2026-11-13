import type { Page } from '@playwright/test';

/** 1×1 тунгалаг PNG — OSM tile-ийн оронд (тестэд гадаад сүлжээ ашиглахгүй, OSM-ийн хэрэглээний бодлого). */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

export async function mockOsmTiles(page: Page) {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
}
