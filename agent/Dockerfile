# --- Build Stage ---
FROM rust:1.90-slim-bookworm AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

# Build the application
RUN cargo build --release

# --- Final Stage ---
FROM debian:bookworm-slim

# Install runtime dependencies and Terraform
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    && curl -fsSL https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com bookworm main" | tee /etc/apt/sources.list.d/hashicorp.list \
    && apt-get update && apt-get install -y terraform \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the binary from the builder
COPY --from=builder /app/target/release/agent /usr/local/bin/agent

# Expose the agent port
EXPOSE 3001

# Run the agent
CMD ["agent"]
