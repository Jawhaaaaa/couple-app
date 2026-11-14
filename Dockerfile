# syntax=docker/dockerfile:1
# Backend (Spring Boot). Build нь контейнер дотор — хост дээр JDK шаардахгүй.
# Context = репогийн үндэс: гэрээнээс controller интерфейс үүсгэнэ (`contracts/`, DD-AURA-002),
# алдааны мессеж ба контентыг classpath-д хийнэ (`mobile/src/content/`, T-14).
# Хоёр image хоёулаа multi-arch (linux/amd64, linux/arm64 — Oracle Ampere A1, AC-161):
#   docker buildx build --platform linux/arm64 -t aura-backend .
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src/backend
COPY backend/pom.xml .
RUN mvn -B -q dependency:go-offline
COPY contracts /src/contracts
COPY mobile/src/content /src/mobile/src/content
# Нууцлалын бодлого ба нөхцөл — jar-ын `policy/`-д орно (T-76, `GET /policies/current`).
COPY docs/PRIVACY.md docs/TERMS.md /src/docs/
COPY backend/src ./src
RUN mvn -B -q package -DskipTests

# Runtime: ffmpeg (видео H.264 720p, дуу AAC — DD-AURA-014), fontconfig (PDF-ийн Монгол фонт —
# `fonts/*.ttf` jar дотор, DD-AURA-024), wget (compose healthcheck). Alpine-ийн оронд jammy:
# ffmpeg-ийн codec бүрэн, glibc.
FROM eclipse-temurin:21-jre-jammy
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg fontconfig wget \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system aura && useradd --system --gid aura --home /app aura
WORKDIR /app
COPY --from=build /src/backend/target/*.jar app.jar
USER aura
EXPOSE 8080
ENTRYPOINT ["java","-XX:MaxRAMPercentage=70","-jar","/app/app.jar"]
