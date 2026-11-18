import * as ScreenCapture from 'expo-screen-capture';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/** Апп-ын түвшний хамгаалалтын түлхүүр — бусад дэлгэцийн `preventScreenCaptureAsync`-тай холилдохгүй. */
const KEY = 'aura-disappearing-chat';

/**
 * Хөтөч дэлгэцийн зургийг хориглох, илрүүлэх API-гүй (GAP-12) — S-46 нь вэб хувилбарт хамгаалалт
 * ажиллахгүйг шударгаар бичнэ.
 */
export function screenProtectionSupported(): boolean {
  return Platform.OS !== 'web';
}

/**
 * Алга болдог мессеж харагдаж байх үеийн хамгаалалт (FR-6.9):
 * - Android — `FLAG_SECURE` (дэлгэцийн зураг, бичлэг хар болно);
 * - iOS — хориглох боломжгүй тул зураг авсныг илрүүлж `onScreenshot` дуудна (сервер илгээгчид мэдэгдэнэ);
 * - вэб — юу ч хийхгүй (GAP-12).
 */
export function useScreenProtection(active: boolean, onScreenshot: () => void) {
  const callback = useRef(onScreenshot);
  useEffect(() => {
    callback.current = onScreenshot;
  }, [onScreenshot]);

  useEffect(() => {
    if (!active || !screenProtectionSupported()) return;
    if (Platform.OS === 'android') {
      void ScreenCapture.preventScreenCaptureAsync(KEY);
      return () => {
        void ScreenCapture.allowScreenCaptureAsync(KEY);
      };
    }
    const subscription = ScreenCapture.addScreenshotListener(() => callback.current());
    return () => subscription.remove();
  }, [active]);
}
