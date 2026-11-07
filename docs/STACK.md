<!-- LAB-2 · stack · Репо бэлдэх · 2026-11-07 -->
# Stack — Aura (платформ: mobile)

## mobile
- App (`mobile/`): React Native + Expo SDK 58 (managed), TypeScript strict, Expo Router. SDK-г 58 дээр түгжинэ: App Store-ийн Expo Go = SDK 58 (2026-11-07).
- Өгөгдөл: TanStack Query; HTTP төрлийг `contracts/*.yaml`-аас `openapi-typescript`-ээр үүсгэнэ
- Токен: `expo-secure-store`; OAuth: `expo-auth-session`
- Тохиргоо: `EXPO_PUBLIC_API_URL` (build үед); нууц утга `EXPO_PUBLIC_*`-д орохгүй
- Web: `web.output = "single"` (SPA), nginx `try_files $uri /index.html`
- Шалгалт: `npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor`, `npx jest` (jest-expo + RNTL)
- E2E: `expo export --platform web` дээр Playwright (Pixel 7, iPhone 14)
- Android APK: Docker дотор (`reactnativecommunity/react-native-android`); iOS: Expo Go / PWA
- Docker: `mobile/Dockerfile` (nginx), compose-ийн `mobile-web`, порт `${MOBILE_HOST_PORT:-8090}`

## backend (`backend/`)
- Java 21, Spring Boot 3.5, Maven Wrapper, PostgreSQL 16 (Flyway/JPA дараагийн шатанд)
- Health: `/actuator/health`
- Багц: root `Dockerfile` (multi-stage), порт `${HOST_PORT:-8080}`

## Гэрээ ба e2e
- `contracts/*.yaml` — OpenAPI 3.1 / AsyncAPI; `e2e/` — Playwright (дараагийн шатуудад)
