#!/bin/bash
set -e

BACKUP_DIR="/opt/devops-control-center/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.tar.gz"

echo "=== Starting DevOps Control Center Backup ==="

# Create temp dir for files
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

# Copy config files
if [ -f /opt/devops-control-center/.env ]; then
    cp /opt/devops-control-center/.env .
fi
if [ -f /opt/devops-control-center/Caddyfile ]; then
    cp /opt/devops-control-center/Caddyfile .
fi
if [ -f /opt/devops-control-center/docker-compose.prod.yml ]; then
    cp /opt/devops-control-center/docker-compose.prod.yml .
fi

# Tar config files
tar czf "${BACKUP_DIR}/configs_${TIMESTAMP}.tar.gz" .
rm -rf "$TEMP_DIR"

# Backup docker volumes
echo "Backing up Grafana data volume..."
docker run --rm \
  -v devops-control-center_grafana-data:/data \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf /backup/grafana_${TIMESTAMP}.tar.gz -C /data . || echo "Warning: grafana-data volume backup failed (volume may not exist yet)"

echo "Backing up Caddy SSL certs volume..."
docker run --rm \
  -v devops-control-center_caddy-data:/data \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf /backup/caddy_${TIMESTAMP}.tar.gz -C /data . || echo "Warning: caddy-data volume backup failed (volume may not exist yet)"

# Combine into a single master archive for this timestamp
cd "$BACKUP_DIR"
tar czf "$BACKUP_FILE" configs_${TIMESTAMP}.tar.gz \
  $([ -f grafana_${TIMESTAMP}.tar.gz ] && echo "grafana_${TIMESTAMP}.tar.gz") \
  $([ -f caddy_${TIMESTAMP}.tar.gz ] && echo "caddy_${TIMESTAMP}.tar.gz")

rm -f configs_${TIMESTAMP}.tar.gz grafana_${TIMESTAMP}.tar.gz caddy_${TIMESTAMP}.tar.gz

echo "Backup created: $BACKUP_FILE"

# Clean up backups older than 7 days
echo "Cleaning up backups older than 7 days..."
find "$BACKUP_DIR" -name "backup_*.tar.gz" -type f -mtime +7 -delete

echo "=== Backup completed successfully ==="
