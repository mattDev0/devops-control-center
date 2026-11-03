# --- Build Stage ---
FROM rust:1.99-slim-bookworm AS builder

# rusqlite is built with the bundled SQLite, which needs a C toolchain.
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
    cp target/release/spotify-service /usr/local/bin/spotify-service

# --- Final Stage ---
FROM debian:bookworm-slim

RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN groupadd -g 10001 -r appuser && useradd -u 10001 -m -r -g appuser appuser

# The play history lives on a volume so it survives redeploys.
RUN mkdir -p /data && chown appuser:appuser /data
VOLUME /data

COPY --from=builder --chown=appuser:appuser /usr/local/bin/spotify-service /usr/local/bin/spotify-service

USER 10001

EXPOSE 3002
CMD ["spotify-service"]
