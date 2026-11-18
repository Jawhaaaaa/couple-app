import type { RefObject } from 'react';

import type { YearInReview } from '@/api/queries/stats';
import { shareOrDownload } from '@/pwa/webFallbacks';

export type SaveOutcome = 'saved' | 'denied' | 'failed' | 'dismissed';

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/**
 * Вэбэд «Бидний жил»-ийг canvas-аар зурж PNG болгоно (AC-118, FR-19.8) — DOM-оос зураг авах сан
 * шаардахгүй. Web Share-тэй утасны хөтөчид хуваалцах цонх («Зураг хадгалах»), үгүй бол татна
 * (`shareOrDownload`, AC-158). `labels`: `title`, `colors` (`bg`, `text`, `primary`, `muted`) ба тоонуудын шошго.
 */
export async function saveYearImage(_stage: RefObject<unknown>, data: YearInReview, labels: Record<string, string>): Promise<SaveOutcome> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'failed';
    ctx.fillStyle = labels.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = labels.primary;
    ctx.font = 'italic 96px "Playfair Display", serif';
    ctx.textAlign = 'center';
    ctx.fillText(labels.title, 540, 220);
    ctx.font = '700 44px Nunito, sans-serif';
    let y = 380;
    for (const [key, value] of Object.entries(data.totals)) {
      const label = labels[`total.${key}`];
      if (!label) continue;
      ctx.fillStyle = labels.text;
      ctx.fillText(`${label}: ${Math.round(value)}`, 540, y);
      y += 84;
      if (y > 1100) break;
    }
    if (labels.topPlace) {
      ctx.fillStyle = labels.muted;
      ctx.fillText(labels.topPlace, 540, Math.min(y + 40, 1200));
    }
    ctx.fillStyle = labels.muted;
    ctx.font = '36px Nunito, sans-serif';
    ctx.fillText('Aura', 540, 1290);
    const blob = await canvasBlob(canvas);
    if (!blob) return 'failed';
    const outcome = await shareOrDownload({ title: labels.title, file: { blob, fileName: `aura-${data.year}.png`, mime: 'image/png' } });
    return outcome === 'dismissed' ? 'dismissed' : 'saved';
  } catch {
    return 'failed';
  }
}
