import type { QrScannerProps } from './qrScannerTypes';

/**
 * Вэб: камераар QR уншуулах нь заавал биш (LLD §4.3 S-09) — кодыг гараар оруулна.
 * Native хувилбар нь `QrScanner.native.tsx` (`expo-camera`).
 */
export const qrScannerAvailable = false;

export function QrScanner(_props: QrScannerProps) {
  return null;
}
