import { router } from 'expo-router';
import { useEffect } from 'react';

import { LockScreen } from '@/components/lock/LockScreen';
import { useLockStore } from '@/lock/lockStore';

/**
 * S-14 Түгжээ route (`fullScreenModal`). Ихэвчлэн `AppLockProvider` бүх агуулгын дээр харуулдаг;
 * энэ route нь «Одоо түгжих» (S-84) ба шууд холбоосоор нээгдэхэд — тайлмагц буцна.
 */
export default function LockRoute() {
  const locked = useLockStore((s) => s.locked);
  useEffect(() => {
    if (!locked) {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    }
  }, [locked]);
  return <LockScreen />;
}
