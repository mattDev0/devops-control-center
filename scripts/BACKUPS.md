# Backup and recovery

The nightly job uses existing VM disk, Python 3, cron and a short-lived rclone process.
It adds no container, disk, VM or paid storage service. Encrypted off-host copies go
directly to an existing Google One Drive account, independently of the laptop.
Small uploads/download verification use the existing bandwidth allowance. Drive API
standard use currently has no additional charge; review published quota/pricing
changes periodically.

Each archive includes `.env`, both Compose files, Caddy configuration, Spotify and
Grafana database snapshots, and Caddy data/config volumes. Prometheus's disposable
three-day metrics are excluded. SQLite's online backup API includes committed WAL
records while services remain running. Each archive is extracted to temporary storage
and checked against its SHA-256 inventory, SQLite integrity checks and Spotify play
count before publication. This verifies data recovery, rather than a full VM rebuild.

Seven successful archives are retained in `/opt/devops-control-center/backups` and
seven encrypted copies in a dedicated Google Drive folder. Uploads must be downloaded
and decrypted successfully and pass restore checks before remote retention runs.
Failures do not prune earlier remote copies. Directories are mode 700 and files 600. Archives contain secrets and
certificate keys: never commit or share them.

## Authorization and installation

Use user OAuth for a personal Google One account; service accounts do not inherit
personal Drive storage. Configure rclone using a dedicated desktop OAuth client;
rclone v1.75.2 warns its shared Drive client will be retired during 2026.
For an external OAuth app,
its publishing status must be Production: Testing tokens with Drive scopes expire
after seven days. Google authorization is a one-time interactive step, after which
rclone refreshes tokens unattended. Token revocation still requires reauthorization.

Prefer the `drive.file` scope, which limits access to files created/opened by this
app. Create a dedicated backup folder through that authorized rclone client. Set
its folder ID as the Drive remote's `root_folder_id`; do not use a broadly shared
folder. Configure a `crypt` remote named `dcc-crypt` wrapping that Drive remote,
with file and directory name encryption and strong independently saved passwords.
No personal Drive file listing is required to operate the dedicated backup folder.

Store the crypt password and salt in a password manager or another safe place
independent of the VM. Losing them makes the backups unrecoverable. Keep OAuth
configuration private (root-owned mode 600) and out of git and backup archives.
Do not paste tokens/passwords into chat. Restrict the containing directory to 700.

Install a checksum-verified rclone binary to `/usr/local/bin/rclone`, and install
`backup.env.example` as `/etc/dcc-backup.env` mode 600. The scripts check that the
configured remote is a crypt wrapper; configuration must point it to the dedicated
Drive folder. After scripts and authorization are ready, run on the VM:

```bash
sudo install -d -m 700 /opt/devops-control-center/backups
sudo timeout 10m bash /opt/devops-control-center/scripts/backup.sh
sudo install -m 644 /opt/devops-control-center/scripts/backup.cron /etc/cron.d/dcc-backup
sudo install -m 644 /opt/devops-control-center/scripts/backup.logrotate /etc/logrotate.d/dcc-backup
```

Install the schedule only after the first full backup/upload/download check passes.
The job runs at 02:15 UTC / 03:15 Lagos, with low CPU priority and a ten-minute
deadline. Check `sudo tail /opt/devops-control-center/backups/backup.log` and archive
timestamps periodically; failure logs do not provide notifications. The local
snapshot completes even if Drive is unavailable, and the job then reports failure.

Defaults can be overridden with `DCC_PROJECT_DIR`, `DCC_BACKUP_DIR`,
`DCC_COMPOSE_PROJECT`, `DCC_BACKUP_REMOTE` and `DCC_RCLONE_CONFIG`.

## Restore

Recover the crypt configuration from your independently stored passwords and
authorize Drive on a recovery machine. Download/decrypt the chosen archive using
`rclone copyto dcc-crypt:ARCHIVE /private/path/ARCHIVE`, then verify it:

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
