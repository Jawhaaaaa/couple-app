import { Platform, useWindowDimensions } from 'react-native';

import { breakpoints } from '@/theme/tokens';

export interface WideLayout {
  /** ≥ 768 dp — жагсаалт + дэлгэрэнгүй хоёр багана (§3.3, AC-192). */
  isTablet: boolean;
  /** Вэб ≥ 1024 px — зүүн талын навигаци. */
  isDesktopWeb: boolean;
  width: number;
}

export function layoutFor(width: number, os: string): WideLayout {
  return {
    width,
    isTablet: width >= breakpoints.tablet,
    isDesktopWeb: os === 'web' && width >= breakpoints.desktop,
  };
}

export function useWideLayout(): WideLayout {
  const { width } = useWindowDimensions();
  return layoutFor(width, Platform.OS);
}
