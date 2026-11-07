# syntax=docker/dockerfile:1
# Backend (Spring Boot). Build нь контейнер дотор — хост дээр JDK шаардахгүй.
# Context = репогийн үндэс: гэрээнээс controller интерфейс үүсгэнэ (`contracts/`, DD-AURA-002),
# алдааны мессеж ба контентыг classpath-д хийнэ (`mobile/src/content/`, T-14).
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src/backend
COPY backend/pom.xml .
RUN mvn -B -q dependency:go-offline
COPY contracts /src/contracts
COPY mobile/src/content /src/mobile/src/content
COPY backend/src ./src
RUN mvn -B -q package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /src/backend/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]
