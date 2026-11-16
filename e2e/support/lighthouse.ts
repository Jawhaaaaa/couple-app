import { createServer } from 'node:net';

import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';

/**
 * Lighthouse (mobile) — Playwright-ийн Chromium-ийг `--remote-debugging-port`-оор асааж Lighthouse-ийн
 * node API-г тэр порт руу холбоно (AC-152, AC-160). Lighthouse 12+ PWA ангиллыг хассан тул
 * «installable»-ийг Chrome-ийн `Page.getInstallabilityErrors` (Lighthouse-ийн хуучин шалгалтын эх)-ээр
 * мөн тэр хөтчид шалгана.
 *
 * Сүлжээний профайл — «4G»: Chrome DevTools-ийн «Fast 4G» preset-тэй ижил (татах 9 Mbps, илгээх
 * 1.5 Mbps, RTT 60 ms), CPU 4× удаашруулалт (Lighthouse mobile-ийн анхдагч — дунд зэргийн Android).
 * Lighthouse-ийн анхдагч «Slow 4G» (1.6 Mbps, RTT 150 ms) нь DevTools-ийн хуучин «Fast 3G» бөгөөд
 * шаардлагын «4G эмуляц» биш. Simulated throttling (Lighthouse-ийн анхдагч арга) — ачаалалд тогтвортой.
 */
export const FOUR_G = {
  name: '4G (DevTools «Fast 4G»: 9 Mbps ↓ / 1.5 Mbps ↑, RTT 60 ms) + CPU 4×',
  rttMs: 60,
  throughputKbps: 9_000,
  // `devtools` аргад (simulate-д ашиглагдахгүй) — Lighthouse-ийн өөрийн профайлуудын адил тохируулга
  requestLatencyMs: 60 * 3.75,
  downloadThroughputKbps: 9_000 * 0.9,
  uploadThroughputKbps: 1_500 * 0.9,
  cpuSlowdownMultiplier: 4,
} as const;

export interface LighthouseSummary {
  url: string;
  performance: number;
  accessibility: number;
  lcpMs: number;
  fcpMs: number;
  tbtMs: number;
  cls: number;
  /** Lighthouse-ийн хэмжсэн JS-ийн дамжуулсан хэмжээ (gzip-тэй, байт). */
  scriptTransferBytes: number;
  /** Accessibility-д унасан audit-ууд (оноо < 1). */
  failedA11y: string[];
  installabilityErrors: string[];
  benchmarkIndex: number;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

export async function runLighthouse(url: string): Promise<LighthouseSummary> {
  const port = await freePort();
  const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`] });
  try {
    const result = await lighthouse(
      url,
      { port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility'] },
      {
        extends: 'lighthouse:default',
        settings: {
          formFactor: 'mobile',
          throttlingMethod: 'simulate',
          throttling: {
            rttMs: FOUR_G.rttMs,
            throughputKbps: FOUR_G.throughputKbps,
            requestLatencyMs: FOUR_G.requestLatencyMs,
            downloadThroughputKbps: FOUR_G.downloadThroughputKbps,
            uploadThroughputKbps: FOUR_G.uploadThroughputKbps,
            cpuSlowdownMultiplier: FOUR_G.cpuSlowdownMultiplier,
          },
        },
      },
    );
    if (!result) throw new Error('Lighthouse үр дүн алга');
    const { lhr } = result;
    const audit = (id: string) => lhr.audits[id]?.numericValue ?? Number.NaN;
    const requests = (lhr.audits['network-requests']?.details as { items?: { resourceType?: string; transferSize?: number }[] } | undefined)?.items ?? [];
    const failedA11y = (lhr.categories.accessibility?.auditRefs ?? [])
      .filter((ref) => ref.weight > 0 && (lhr.audits[ref.id]?.score ?? 1) < 1)
      .map((ref) => ref.id);

    // Installable — Lighthouse-ийн ажилласан хөтөч дээр шинэ хуудсаар (SW бүртгэгдэхийг хүлээнэ)
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(async () => !!(await navigator.serviceWorker?.getRegistration())?.active, null, { timeout: 20_000 });
    const cdp = await context.newCDPSession(page);
    const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as { installabilityErrors: { errorId: string }[] };

    return {
      url,
      performance: lhr.categories.performance?.score ?? 0,
      accessibility: lhr.categories.accessibility?.score ?? 0,
      lcpMs: audit('largest-contentful-paint'),
      fcpMs: audit('first-contentful-paint'),
      tbtMs: audit('total-blocking-time'),
      cls: audit('cumulative-layout-shift'),
      scriptTransferBytes: requests.filter((r) => r.resourceType === 'Script').reduce((s, r) => s + (r.transferSize ?? 0), 0),
      failedA11y,
      installabilityErrors: installabilityErrors.map((e) => e.errorId),
      benchmarkIndex: lhr.environment.benchmarkIndex,
    };
  } finally {
    await browser.close();
  }
}

/** Тайланд хавсаргах нэг мөр. */
export function describeRun(s: LighthouseSummary): string {
  return (
    `${s.url} [${FOUR_G.name}] Performance ${Math.round(s.performance * 100)}, Accessibility ${Math.round(s.accessibility * 100)}, ` +
    `LCP ${Math.round(s.lcpMs)} ms, FCP ${Math.round(s.fcpMs)} ms, TBT ${Math.round(s.tbtMs)} ms, CLS ${s.cls.toFixed(3)}, ` +
    `JS ${(s.scriptTransferBytes / 1024).toFixed(0)} KiB (gzip), benchmarkIndex ${Math.round(s.benchmarkIndex)}`
  );
}
