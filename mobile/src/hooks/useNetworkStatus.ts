import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/** `isConnected === false` үед л offline гэж үзнэ (тодорхойгүй бол онлайн). */
export function isOfflineState(state: { isConnected: boolean | null; isInternetReachable?: boolean | null }): boolean {
  return state.isConnected === false || state.isInternetReachable === false;
}

export function useNetworkStatus(): { offline: boolean } {
  const [offline, setOffline] = useState(false);
  useEffect(() => NetInfo.addEventListener((s) => setOffline(isOfflineState(s))), []);
  return { offline };
}
