#!/bin/bash
set -euo pipefail
umask 077

# Run as root from cron; no containers, downloads, or service interruption.
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
if [[ -f /etc/dcc-backup.env ]]; then
  set -a
  source /etc/dcc-backup.env
  set +a
fi
BACKUP_DIR=${DCC_BACKUP_DIR:-/opt/devops-control-center/backups}
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.lock"
flock -n 9 || { echo 'Backup already running' >&2; exit 1; }
python3 "$SCRIPT_DIR/backup.py"
python3 "$SCRIPT_DIR/upload-backup.py"
