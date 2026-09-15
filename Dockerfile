# Stage 1: Build the application with Maven and Java 21
FROM maven:3.9.9-eclipse-temurin-21-alpine AS builder
WORKDIR /build

# Cache dependencies
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Copy source code and package application
COPY src ./src
RUN mvn clean package -DskipTests

# Stage 2: Ultra-slim Java 21 JRE Runtime
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Copy the packaged jar from builder stage
COPY --from=builder /build/target/inventory-*.jar app.jar

# Cloud Run injects PORT; defaults to 8080
ENV PORT=8080
EXPOSE 8080

# Run Spring Boot application
ENTRYPOINT ["java", "-Djava.security.egd=file:/dev/./urandom", "-jar", "app.jar"]
