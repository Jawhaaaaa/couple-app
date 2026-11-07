import { useEffect, useState } from 'react';

import { useT } from '@/i18n';

import { AppButton } from '../AppButton';
import { AppText } from '../AppText';

export const RESEND_SECONDS = 60;

interface Props {
  /** Эхний хүлээлт (бүртгүүлсний дараа 60 с, нэвтрэхээс ирсэн бол 0). */
  initialSeconds?: number;
  /**
   * Код дахин илгээнэ; дараагийн хүлээлтийг секундээр буцаана (амжилттай бол 60,
   * `RATE_LIMITED` бол `retryAfterSeconds`). Алдааг дуудагч өөрөө харуулна — reject хийхгүй.
   */
  onResend: () => Promise<number>;
  disabled?: boolean;
}

/** «Кодыг дахин илгээх» 60 с-ийн тоолууртай (FR-1.2, S-05). */
export function ResendTimer({ initialSeconds = RESEND_SECONDS, onResend, disabled }: Props) {
  const t = useT();
  const [remaining, setRemaining] = useState(initialSeconds);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  if (remaining > 0) {
    return (
      <AppText color="textMuted" style={{ textAlign: 'center' }} accessibilityLiveRegion="polite" testID="resend-countdown">
        {t('auth.verify.resendIn', { seconds: remaining })}
      </AppText>
    );
  }
  return (
    <AppButton
      variant="secondary"
      label={t('auth.verify.resend')}
      loading={busy}
      disabled={disabled}
      onPress={async () => {
        setBusy(true);
        try {
          setRemaining(await onResend());
        } finally {
          setBusy(false);
        }
      }}
      testID="resend-code"
    />
  );
}
