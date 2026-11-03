# --- Build Stage ---
FROM rust:1.99-slim-bookworm AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Build the dependencies alone first, against a placeholder main.rs, so this
# layer stays cached until Cargo.toml or Cargo.lock changes.
COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs && \
    cargo build --release && \
    rm -rf src

# Build the real binary. The touch makes cargo rebuild this crate instead of
# reusing the placeholder build.
COPY src ./src
RUN touch src/main.rs && \
    cargo build --release && \
    cp target/release/agent /usr/local/bin/agent

# --- Final Stage ---
FROM debian:bookworm-slim

# Install runtime dependencies and apply security updates
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
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
