import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { isOccasionCelebration, useCelebrations } from '@/api/queries/anniversaries';

/**
 * Апп нээгдэхэд үзээгүй ойн баяр байвал S-25 руу (FR-8.6, AC-39): `GET /me/celebrations` нь
 * хэрэглэгч тутамд үзээгүйг л буцаана (GAP-23), энэ сесс дотор нэг үйл явдлыг нэг л удаа нээнэ.
 */
export function useCelebrationGate(): void {
  const celebrations = useCelebrations();
  const opened = useRef(new Set<string>());
  useEffect(() => {
    const next = celebrations.data?.find((c) => isOccasionCelebration(c) && !opened.current.has(c.eventKey));
    if (!next) return;
    opened.current.add(next.eventKey);
    router.push('/celebration');
  }, [celebrations.data]);
}
