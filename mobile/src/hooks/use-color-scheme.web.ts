import { useColorScheme as useRNColorScheme } from 'react-native';

// web.output = "single" (SPA) тул SSR hydration хүлээх шаардлагагүй.
export function useColorScheme() {
  return useRNColorScheme() ?? 'light';
}
