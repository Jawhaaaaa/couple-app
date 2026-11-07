# Aura — хосын мобайл апп

Expo (iOS/Android/PWA) + Spring Boot + PostgreSQL. Stack: `docs/STACK.md`.

## Локалд асаах
```bash
cp .env.example .env      # POSTGRES_PASSWORD солино
docker compose up --build
```
- Backend: http://localhost:8080/actuator/health
- Mobile web: http://localhost:8090

## Шалгах
```bash
cd backend && ./mvnw verify
cd mobile && npm ci && npx tsc --noEmit && npx jest && npx expo export --platform web
```
