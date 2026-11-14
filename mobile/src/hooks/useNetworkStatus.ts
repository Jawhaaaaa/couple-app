import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/** `isConnected === false` үед л offline гэж үзнэ (тодорхойгүй бол онлайн). */
export function isOfflineState(state: { isConnected: boolean | null; isInternetReachable?: boolean | null }): boolean {
  return state.isConnected === false || state.isInternetReachable === false;
}

export function useNetworkStatus(): { offline: boolean } {
  const [netOffline, setNetOffline] = useState(false);
  const [browserOffline, setBrowserOffline] = useState(false);
  useEffect(() => NetInfo.addEventListener((s) => setNetOffline(isOfflineState(s))), []);
  // Вэб: NetInfo нь `navigator.connection`-ийг сонсдог тул `online`/`offline` үйл явдлыг шууд сонсоно
  useEffect(() => {
    const win = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
    if (!win || typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return;
    const update = () => setBrowserOffline(!navigator.onLine);
    win.addEventListener('online', update);
    win.addEventListener('offline', update);
    return () => {
      win.removeEventListener('online', update);
      win.removeEventListener('offline', update);
    };
  }, []);
  return { offline: netOffline || browserOffline };
}
