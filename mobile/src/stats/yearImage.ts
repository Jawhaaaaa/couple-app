import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { captureRef } from 'react-native-view-shot';

import type { YearInReview } from '@/api/queries/stats';

export type SaveOutcome = 'saved' | 'denied' | 'failed';

/**
 * S-72-ыг зураг болгон хадгалах (AC-118): native-д слайдын талбайг PNG болгоод (`react-native-view-shot`)
 * системийн хуваалцах цонхоор («Зураг хадгалах») — зургийн сангийн тусдаа зөвшөөрөл шаардахгүй (S-33-тай ижил).
 */
export async function saveYearImage(stage: RefObject<unknown>, _data: YearInReview, _labels: Record<string, string>): Promise<SaveOutcome> {
  try {
    const uri = await captureRef(stage as never, { format: 'png', quality: 1 });
    if (!(await Sharing.isAvailableAsync())) return 'failed';
    await Sharing.shareAsync(uri, { mimeType: 'image/png' });
    return 'saved';
  } catch {
    return 'failed';
  }
}
