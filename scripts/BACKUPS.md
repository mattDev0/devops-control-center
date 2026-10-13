# Backup and recovery

The nightly job uses existing VM disk, Python 3, cron and Docker volume metadata.
It adds no container, disk, VM or paid storage service. Off-host copies use existing
WSL disk and a small SSH download, subject to existing bandwidth allowances.
WSL must be running and connected to download a copy.

Each archive includes `.env`, both Compose files, Caddy configuration, Spotify and
Grafana database snapshots, and Caddy data/config volumes. Prometheus's disposable
three-day metrics are excluded. SQLite's online backup API includes committed WAL
records while services remain running. Each archive is extracted to temporary storage
and checked against its SHA-256 inventory, SQLite integrity checks and Spotify play
count before publication. This verifies data recovery, rather than a full VM rebuild.

Seven successful archives are retained in `/opt/devops-control-center/backups` and
seven downloaded copies in `~/.local/share/dcc-backups`. Failures do not prune older
copies. Directories are mode 700 and files 600. Archives contain secrets and
certificate keys: never commit or share them.

## Install after approval

After the files are deployed, run on the VM:

```bash
sudo install -d -m 700 /opt/devops-control-center/backups
sudo timeout 10m bash /opt/devops-control-center/scripts/backup.sh
sudo install -m 644 /opt/devops-control-center/scripts/backup.cron /etc/cron.d/dcc-backup
sudo install -m 644 /opt/devops-control-center/scripts/backup.logrotate /etc/logrotate.d/dcc-backup
```

The job runs at 02:15 UTC / 03:15 Lagos, with low CPU priority and a ten-minute
deadline. Check `sudo tail /opt/devops-control-center/backups/backup.log` and archive
timestamps periodically; failure logs do not provide notifications.

On WSL, first run `bash scripts/pull-backup.sh`. Use `crontab -e` to add this hourly
check, retaining existing entries:

```cron
17 * * * * timeout 10m bash /home/matt/prod/devops-control-center/scripts/pull-backup.sh
```

The download uses the existing SSH identity without reading or copying its contents.
Only a new completed archive is downloaded, verified and then published locally.
The job does not wake Windows/WSL. Override local defaults with
`DCC_LOCAL_BACKUP_DIR`, `DCC_BACKUP_SSH_KEY` and `DCC_BACKUP_SSH_HOST`. VM overrides
are `DCC_PROJECT_DIR`, `DCC_BACKUP_DIR` and `DCC_COMPOSE_PROJECT`.

## Restore

```bash
python3 scripts/backup.py --verify /path/to/backup_TIMESTAMP.tar.gz
```

To recover services, extract the verified archive into a private staging directory
(`umask 077`). Stop the affected service before replacing volume contents; never
overwrite a running SQLite database. Preserve the old volume until recovery works.
Copy `volumes/<volume-name>/` contents to the matching Docker volume. Remove obsolete
SQLite WAL/SHM files from the destination before replacing its database. Restore file
ownership for the service's runtime user (inspect existing volume ownership and image
user; archive files belong to root). For the current deployment, Spotify's database
owner is 10001:10001 and Grafana's is 472:0; recheck these with different images.
Restore `.env` with mode 600 and other files from `configs/` to the project directory.
Start services and verify history, Grafana,
TLS and health checks. Changed bind-mounted Caddy config requires recreating Caddy.

A full replacement VM also needs infrastructure, Docker, deployment SSH setup and
images. These archives protect persistent data and configuration.
