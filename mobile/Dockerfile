# syntax=docker/dockerfile:1
# Вэб апп (Expo web export → nginx). Build stage нь build хийж буй машины платформд ($BUILDPLATFORM)
# ажиллана — гаралт нь статик файл тул QEMU-гүй; зөвхөн nginx-ийн суурь image зорилтот платформынх
# (linux/amd64, linux/arm64 — Oracle Ampere A1, AC-161):
#   docker buildx build --platform linux/arm64 -t aura-mobile-web mobile
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# `EXPO_PUBLIC_*` нь bundle-д шигтгэгдэнэ — нууц утга хэзээ ч бүү дамжуул (INV-10, AC-195).
# Жагсаалт: src/config.ts. Хоосон утгыг unset хийнэ: хоосон мөр `??`-ийн анхдагчийг дарж эвдэнэ.
ARG EXPO_PUBLIC_API_URL=http://localhost:8080
ARG EXPO_PUBLIC_WS_URL=
ARG EXPO_PUBLIC_APP_VERSION=
ARG EXPO_PUBLIC_BUILD=
ARG EXPO_PUBLIC_COMMIT_SHA=
ARG EXPO_PUBLIC_OAUTH_GOOGLE=
# Export-ийн дараа service worker-ийг угсарна (dist/sw.js — precache + хувилбар, FR-19.5).
RUN for v in EXPO_PUBLIC_API_URL EXPO_PUBLIC_WS_URL EXPO_PUBLIC_APP_VERSION EXPO_PUBLIC_BUILD \
             EXPO_PUBLIC_COMMIT_SHA EXPO_PUBLIC_OAUTH_GOOGLE; do \
      eval "[ -n \"\$$v\" ] && export $v || unset $v"; \
    done \
    && env | grep '^EXPO_PUBLIC_' | sort \
    && npx expo export --platform web \
    && node scripts/build-sw.cjs

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
