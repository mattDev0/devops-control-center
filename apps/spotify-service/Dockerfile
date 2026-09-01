# --- Build Stage ---
FROM rust:1.90-slim-bookworm AS builder

# rusqlite is built with the bundled SQLite, which needs a C toolchain.
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY Cargo.toml Cargo.lock* ./
COPY src ./src

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
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
