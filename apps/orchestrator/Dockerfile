# --- Build Stage ---
FROM maven:3.10.0-eclipse-temurin-25 AS builder

WORKDIR /app

# Copy dependency definition and source files
COPY pom.xml .
COPY src ./src

# Build the application using BuildKit cache mount
RUN --mount=type=cache,target=/root/.m2 \
    mvn package -DskipTests && \
    cp target/orchestrator-0.0.1-SNAPSHOT.jar /app/app.jar

# --- Final Stage ---
FROM eclipse-temurin:25.0.4.1_1-jre-jammy

WORKDIR /app

# Install curl for container health checks
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Create a non-root user and group with numeric UID/GID
RUN groupadd -g 10001 -r appuser && useradd -u 10001 -r -g appuser appuser

# Copy the built jar from the builder and assign ownership to appuser
COPY --from=builder --chown=appuser:appuser /app/app.jar app.jar

# Switch to the non-root user (using numeric ID for Kubernetes runAsNonRoot verification)
USER 10001

# Expose the orchestrator port
EXPOSE 8080

# Run the application
ENTRYPOINT ["java", "-jar", "app.jar"]
