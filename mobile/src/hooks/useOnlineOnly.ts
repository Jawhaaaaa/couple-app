import { useNetworkStatus } from './useNetworkStatus';

/**
 * Сервер шууд хариу шаарддаг үйлдлийн товч offline-д идэвхгүй (spec §8, LLD §4.4):
 * нэвтрэх, бүртгэл, урилга батлах, экспорт, хайлт, хос тасалах.
 */
export function useOnlineOnly(): { disabled: boolean } {
  const { offline } = useNetworkStatus();
  return { disabled: offline };
}
