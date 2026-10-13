#!/bin/bash
set -euo pipefail
umask 077

# Run as root from cron; no containers, downloads, or service interruption.
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
BACKUP_DIR=${DCC_BACKUP_DIR:-/opt/devops-control-center/backups}
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.lock"
flock -n 9 || { echo 'Backup already running' >&2; exit 1; }
exec python3 "$SCRIPT_DIR/backup.py"
