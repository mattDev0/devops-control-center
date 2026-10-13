#!/bin/bash
set -euo pipefail
umask 077

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
LOCAL_DIR=${DCC_LOCAL_BACKUP_DIR:-$HOME/.local/share/dcc-backups}
SSH_KEY=${DCC_BACKUP_SSH_KEY:-$HOME/.ssh/dcc-prod_key}
SSH_HOST=${DCC_BACKUP_SSH_HOST:-matt@172.213.224.239}
mkdir -p "$LOCAL_DIR"
chmod 700 "$LOCAL_DIR"
exec 9>"$LOCAL_DIR/.lock"
flock -n 9 || exit 0
SSH_OPTIONS=(-i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3)
latest=$(ssh "${SSH_OPTIONS[@]}" "$SSH_HOST" \
  "sudo -n find /opt/devops-control-center/backups -maxdepth 1 -type f -name 'backup_*.tar.gz' -printf '%f\\n'" | sort | tail -n 1)
[[ "$latest" =~ ^backup_[0-9]{8}_[0-9]{6}_[0-9]{6}\.tar\.gz$ ]] || {
  echo 'No completed VM backup found' >&2; exit 1;
}
[[ -f "$LOCAL_DIR/$latest" ]] && exit 0
partial=$(mktemp "$LOCAL_DIR/.download-XXXXXX")
trap 'rm -f -- "$partial"' EXIT
ssh "${SSH_OPTIONS[@]}" "$SSH_HOST" \
  "sudo -n cat /opt/devops-control-center/backups/$latest" > "$partial"
python3 "$SCRIPT_DIR/backup.py" --verify "$partial"
mv -- "$partial" "$LOCAL_DIR/$latest"
python3 - "$LOCAL_DIR" <<'PY'
from pathlib import Path
import sys
for stale in sorted(Path(sys.argv[1]).glob('backup_*.tar.gz'), reverse=True)[7:]:
    stale.unlink()
PY
echo "Off-VM backup saved: $LOCAL_DIR/$latest"
