import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * Expo Go-д апп унах ёсгүй (INV-13, AC-208). Expo Go-д байхгүй native модулийг
 * зөвхөн standalone/dev build-д ачаална.
 */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/**
 * Expo Go-д байхгүй модулийг хамгаалалттай ачаална: Expo Go-д эсвэл ачаалж
 * чадаагүй үед `null` буцаана (дуудагч орлуулга хэрэглэнэ).
 */
export function loadOutsideExpoGo<T>(loader: () => T): T | null {
  if (isExpoGo()) return null;
  try {
    return loader();
  } catch {
    return null;
  }
}
