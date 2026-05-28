# --- Build Stage ---
FROM maven:3.9-eclipse-temurin-21 AS builder

WORKDIR /app

# Copy pom.xml and cache dependencies
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Copy source and build the application
COPY src ./src
RUN mvn package -DskipTests

# --- Final Stage ---
FROM eclipse-temurin:21-jre-jammy

WORKDIR /app

# Copy the built jar from the builder
COPY --from=builder /app/target/orchestrator-0.0.1-SNAPSHOT.jar app.jar

# Expose the orchestrator port
EXPOSE 8080

# Run the application
ENTRYPOINT ["java", "-jar", "app.jar"]
