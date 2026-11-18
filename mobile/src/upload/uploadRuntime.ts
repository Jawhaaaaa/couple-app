import NetInfo from '@react-native-community/netinfo';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { isOfflineState } from '@/hooks/useNetworkStatus';
import { kvStore } from '@/offline/storage';
import { useSessionStore } from '@/stores/sessionStore';

import { blobStore } from './blobStore';
import { type UploadItem, UploadQueue } from './uploadQueue';

/** Апп-ын нэг upload дараалал. Квот дүүрвэл (507) S-98 руу (AC-200). */
export const uploadQueue = new UploadQueue({
  store: kvStore,
  blobs: blobStore,
  onQuotaExceeded: () => router.push('/storage-full'),
});

function resume() {
  // Алдаа нь item бүрийн төлөвт хадгалагдана — энд барих зүйлгүй
  uploadQueue.resume().catch(() => undefined);
}

/** Апп нээгдэх, сүлжээ сэргэх, апп урд гарах үед дуусаагүй upload-ыг үргэлжлүүлнэ (AC-20). */
export function startUploadQueue(): () => void {
  resume();
  const net = NetInfo.addEventListener((s) => {
    if (!isOfflineState(s)) resume();
  });
  const app = AppState.addEventListener('change', (s) => {
    if (s === 'active') resume();
  });
  // Апп нээгдэхэд access token refresh-ээр хожуу ирдэг — тэр мөчид дахин оролдоно (дахин ачаалсны дараа AC-20)
  const session = useSessionStore.subscribe((state, prev) => {
    if (state.accessToken && !prev.accessToken) resume();
  });
  // Вэб: `online` үйл явдал (FR-19.5) — NetInfo вэбэд түүн дээр заавал дуудагддаггүй
  const win = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
  win?.addEventListener('online', resume);
  return () => {
    net();
    app.remove();
    session();
    win?.removeEventListener('online', resume);
  };
}

/** Дарааллын төлөв (явцын мөр, «илгээгдэж байна» тэмдэг). */
export function useUploads(): UploadItem[] {
  const [items, setItems] = useState<UploadItem[]>([]);
  useEffect(() => {
    let alive = true;
    uploadQueue
      .items()
      .then((list) => alive && setItems(list))
      // Хадгалсан дараалал уншигдахгүй бол хоосон жагсаалт хэвээр (дараагийн өөрчлөлтөөр шинэчлэгдэнэ)
      .catch(() => undefined);
    const unsubscribe = uploadQueue.subscribe(setItems);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  return items;
}
