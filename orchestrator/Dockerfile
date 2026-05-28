# --- Build Stage ---
FROM maven:3.9-eclipse-temurin-21 AS builder

WORKDIR /app

# Copy dependency definition and source files
COPY pom.xml .
COPY src ./src

# Build the application using BuildKit cache mount
RUN --mount=type=cache,target=/root/.m2 \
    mvn package -DskipTests && \
    cp target/orchestrator-0.0.1-SNAPSHOT.jar /app/app.jar

# --- Final Stage ---
FROM eclipse-temurin:21-jre-jammy

WORKDIR /app

# Copy the built jar from the builder
COPY --from=builder /app/app.jar app.jar

# Expose the orchestrator port
EXPOSE 8080

# Run the application
ENTRYPOINT ["java", "-jar", "app.jar"]
