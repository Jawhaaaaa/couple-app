import { useMeQuery } from '@/api/queries/bootstrap';
import { deviceTimezone } from '@/auth/device';

/** Хоосон үед (профайл ачаалаагүй, төхөөрөмж бүсгүй) — хосын анхдагч бүс. */
export const DEFAULT_TIMEZONE = 'Asia/Ulaanbaatar';

/**
 * Хэрэглэгчийн профайлын бүс (INV-08, AC-34): цагийг хүн бүрд өөрийн бүсээр харуулна.
 * Профайл ачаалаагүй бол төхөөрөмжийн бүс.
 */
export function useUserTimezone(): string {
  const me = useMeQuery();
  return me.data?.timezone ?? deviceTimezone() ?? DEFAULT_TIMEZONE;
}
