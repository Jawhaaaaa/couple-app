/**
 * Цагийн бүс солих асуулт (FR-1.4, AC-64). Төхөөрөмжийн бүс профайлынхаас өөр
 * бол «Цагийн бүсээ Asia/Tokyo болгох уу?» гэж нэг л удаа асууна; хариулсан
 * (зөвшөөрсөн ч, татгалзсан ч) бүсийг `timezonePromptStore` санаж дахин асуухгүй.
 */
export interface TimezonePromptInput {
  /** Төхөөрөмжийн IANA бүс (`expo-localization`). Тодорхойгүй бол `null`. */
  deviceZone: string | null | undefined;
  /** `me.timezone`. Профайл ачаалаагүй бол `null`. */
  profileZone: string | null | undefined;
  /** Аль хэдийн асуусан бүсүүд. */
  answeredZones: readonly string[];
}

/** Асуух бүс (асуухгүй бол `null`). */
export function timezoneToAsk({ deviceZone, profileZone, answeredZones }: TimezonePromptInput): string | null {
  if (!deviceZone || !profileZone) return null;
  if (deviceZone === profileZone) return null;
  if (answeredZones.includes(deviceZone)) return null;
  return deviceZone;
}

/** Хариулсан бүсийг жагсаалтад нэмнэ (давхардуулахгүй, сүүлийн 20-ийг л хадгална). */
export function rememberZone(answeredZones: readonly string[], zone: string): string[] {
  return [...answeredZones.filter((z) => z !== zone), zone].slice(-20);
}
