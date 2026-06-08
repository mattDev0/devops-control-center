# --- Build Stage ---
FROM rust:1.90-slim-bookworm AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency definitions and source files
COPY Cargo.toml Cargo.lock* ./
COPY src ./src

# Build the application using BuildKit cache mounts
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build --release && \
    cp target/release/agent /usr/local/bin/agent

# --- Final Stage ---
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create a non-root user and group with numeric UID/GID
RUN groupadd -g 10001 -r appuser && useradd -u 10001 -m -r -g appuser appuser

# Copy the binary from the builder and set ownership
COPY --from=builder --chown=appuser:appuser /usr/local/bin/agent /usr/local/bin/agent

# Switch to the non-root user (using numeric ID for Kubernetes runAsNonRoot verification)
USER 10001

# Expose the agent port
EXPOSE 3001

# Run the agent
CMD ["agent"]
