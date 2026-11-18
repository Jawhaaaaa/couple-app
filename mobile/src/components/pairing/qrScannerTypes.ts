export interface QrScannerProps {
  /** Уншсан QR-ийн агуулга (холбоос эсвэл код). */
  onScanned: (data: string) => void;
  onClose: () => void;
}
