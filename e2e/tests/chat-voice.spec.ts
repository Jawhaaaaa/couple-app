import { expect } from '@playwright/test';

import { test } from '../fixtures/twoPartners';
import { messagesApi, openChat } from '../support/chat';
import { linkedCouple } from '../support/couple';

/**
 * Дуут мессеж (T-46, FR-6.1, FR-19.8): вэбэд MediaRecorder-аар бичиж (S-45, ANIM-23), сервер нэг
 * формат руу хөрвүүлж долгион гаргана; нөгөө тал урт, долгионтой тоглуулна (AC-32, AC-158).
 * Chromium-ийн хуурамч микрофон (`--use-fake-device-for-media-stream`) — WebKit/Firefox-д ГАР.
 */
test.describe('Дуут мессеж', () => {
  test('AC-32 AC-158 A 3 с бичиж илгээхэд B-д урт ба долгион зөв, тоглуулах явц өснө', async ({ partnerA, partnerB, browserName }) => {
    test.skip(browserName !== 'chromium', 'Хуурамч микрофон зөвхөн Chromium-д (iPhone Safari — ГАР)');
    const [a, b] = await linkedCouple(partnerA.name, partnerB.name, 'ac32');
    await partnerA.context.grantPermissions(['microphone']);
    await openChat(partnerA.page, a);

    await partnerA.page.getByTestId('composer-voice').click();
    await expect(partnerA.page.getByTestId('screen-S-45')).toBeVisible();
    await expect(partnerA.page.getByTestId('anim-ANIM-23')).toBeVisible();
    await partnerA.page.waitForTimeout(3_000);
    await expect(partnerA.page.getByTestId('voice-timer')).toContainText(/0:0[2-4] \/ 5:00/);
    await partnerA.page.getByTestId('voice-send').click();
    await expect(partnerA.page.getByTestId('screen-S-45')).toHaveCount(0);

    await expect
      .poll(async () => (await messagesApi(b)).items.find((m) => m.kind === 'VOICE') as { media?: { status?: string; durationMs?: number; waveform?: number[] } } | undefined, { timeout: 30_000 })
      .toMatchObject({ media: { status: 'READY' } });
    const voice = (await messagesApi(b)).items.find((m) => m.kind === 'VOICE') as unknown as { media: { durationMs: number; waveform: number[] } };
    expect(voice.media.durationMs).toBeGreaterThanOrEqual(2_000);
    expect(voice.media.durationMs).toBeLessThanOrEqual(4_500);
    expect(voice.media.waveform).toHaveLength(64);

    await openChat(partnerB.page, b);
    const player = partnerB.page.getByTestId('voice-player');
    await expect(player.getByTestId('voice-duration')).toContainText(/0:0[2-4]/);
    await player.getByTestId('voice-toggle').click();
    await expect(player.getByTestId('voice-duration')).not.toHaveText('0:00', { timeout: 5_000 });
  });

  test('S-45 бичлэгийг цуцлахад мессеж илгээгдэхгүй', async ({ partnerA, browserName }) => {
    test.skip(browserName !== 'chromium', 'Хуурамч микрофон зөвхөн Chromium-д');
    const [a] = await linkedCouple(partnerA.name, 'Ану', 'voice-cancel');
    await partnerA.context.grantPermissions(['microphone']);
    await openChat(partnerA.page, a);
    await partnerA.page.getByTestId('composer-voice').click();
    await expect(partnerA.page.getByTestId('screen-S-45')).toBeVisible();
    await partnerA.page.getByTestId('voice-cancel').click();
    await partnerA.page.waitForTimeout(1_000);
    expect((await messagesApi(a)).items.filter((m) => m.kind === 'VOICE')).toHaveLength(0);
  });
});
