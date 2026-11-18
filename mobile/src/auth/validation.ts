/** Имэйлийн энгийн шалгалт (жинхэнэ шалгалт серверийнх — `format: email`). */
export function isEmail(value: string): boolean {
  const v = value.trim();
  return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** Route-ын `?param`-ын эхний утга (`useLocalSearchParams` нь массив өгч болно). */
export function firstParam(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v ? v : undefined;
}
