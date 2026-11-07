import { useEffect, useState } from 'react';

/** Одоогийн цаг (мс), `intervalMs` тутам шинэчлэгдэнэ — тоолуурт (S-08 урилгын хугацаа). */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
