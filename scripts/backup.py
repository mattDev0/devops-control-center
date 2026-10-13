#!/usr/bin/env python3
"""Small, verified DCC backups using only the Python standard library."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tarfile
import tempfile


DATABASES = {"spotify-data": "spotify.db", "grafana-data": "grafana.db"}
VOLUMES = ("spotify-data", "grafana-data", "caddy-data", "caddy-config")
CONFIGS = (".env", "Caddyfile", "docker-compose.yml", "docker-compose.prod.yml")


def digest(path):
    with path.open("rb") as file:
        result = hashlib.sha256()
        for block in iter(lambda: file.read(65536), b""):
            result.update(block)
        return result.hexdigest()


def snapshot(source, destination):
    # SQLite's online backup API includes committed WAL data without stopping writers.
    with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True, timeout=30) as src:
        with sqlite3.connect(destination) as dst:
            src.backup(dst, pages=128, sleep=0.05)


def verify(archive):
    """Restore to a temporary directory and check the databases and file inventory."""
    with tempfile.TemporaryDirectory(prefix="dcc-restore-") as restored:
        root = Path(restored)
        with tarfile.open(archive, "r:gz") as bundle:
            for member in bundle.getmembers():
                path = Path(member.name)
                if not member.isfile() or path.is_absolute() or ".." in path.parts:
                    raise ValueError(f"Unsafe archive member: {member.name}")
                target = root / path
                target.parent.mkdir(parents=True, exist_ok=True)
                with bundle.extractfile(member) as src, target.open("wb") as dst:
                    shutil.copyfileobj(src, dst)
        manifest = json.loads((root / "manifest.json").read_text())
        actual = {str(p.relative_to(root)) for p in root.rglob("*") if p.is_file()}
        if actual != set(manifest["files"]) | {"manifest.json"}:
            raise ValueError("Backup file inventory mismatch")
        for name, checksum in manifest["files"].items():
            if digest(root / name) != checksum:
                raise ValueError(f"Checksum mismatch: {name}")
        for volume, filename in DATABASES.items():
            with sqlite3.connect(root / "volumes" / volume / filename) as db:
                if db.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                    raise ValueError(f"Database integrity check failed: {volume}")
                if volume == "spotify-data":
                    count = db.execute("SELECT COUNT(*) FROM plays").fetchone()[0]
                    if count != manifest["spotify_plays"]:
                        raise ValueError("Spotify play count mismatch")
        return manifest


def create():
    os.umask(0o077)
    project = Path(os.environ.get("DCC_PROJECT_DIR", "/opt/devops-control-center"))
    output = Path(os.environ.get("DCC_BACKUP_DIR", str(project / "backups")))
    prefix = os.environ.get("DCC_COMPOSE_PROJECT", "devops-control-center")
    output.mkdir(parents=True, exist_ok=True)
    output.chmod(0o700)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    final = output / f"backup_{stamp}.tar.gz"
    with tempfile.TemporaryDirectory(prefix=".staging-", dir=output) as staging:
        root = Path(staging)
        for name in CONFIGS:
            source = project / name
            if not source.is_file():
                raise FileNotFoundError(f"Required configuration missing: {name}")
            (root / "configs").mkdir(exist_ok=True)
            shutil.copyfile(source, root / "configs" / name)
        for volume in VOLUMES:
            info = subprocess.check_output(
                ["docker", "volume", "inspect", f"{prefix}_{volume}"], text=True
            )
            source = Path(json.loads(info)[0]["Mountpoint"])
            destination = root / "volumes" / volume
            destination.mkdir(parents=True)
            for entry in source.rglob("*"):
                if entry.is_symlink():
                    raise ValueError(f"Unexpected symlink in {volume}")
                if not entry.is_file():
                    continue
                relative = entry.relative_to(source)
                if volume in DATABASES and str(relative) in (
                    DATABASES[volume], DATABASES[volume] + "-wal", DATABASES[volume] + "-shm",
                    DATABASES[volume] + "-journal"
                ):
                    continue
                target = destination / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(entry, target)
            if volume in DATABASES:
                snapshot(source / DATABASES[volume], destination / DATABASES[volume])
        with sqlite3.connect(root / "volumes/spotify-data/spotify.db") as db:
            plays = db.execute("SELECT COUNT(*) FROM plays").fetchone()[0]
        files = {str(p.relative_to(root)): digest(p) for p in root.rglob("*") if p.is_file()}
        (root / "manifest.json").write_text(json.dumps({
            "created_utc": stamp, "spotify_plays": plays, "files": files
        }, indent=2))
        partial = root / "archive.partial"
        with tarfile.open(partial, "w:gz") as bundle:
            for name in sorted(files) + ["manifest.json"]:
                bundle.add(root / name, arcname=name, recursive=False)
        verify(partial)
        os.replace(partial, final)
    # Keep seven successful snapshots; failures never prune a prior backup.
    for stale in sorted(output.glob("backup_*.tar.gz"), reverse=True)[7:]:
        stale.unlink()
    print(f"Verified backup: {final.name}; Spotify plays: {plays}; bytes: {final.stat().st_size}")


if __name__ == "__main__":
    import sys
    os.umask(0o077)
    if len(sys.argv) == 3 and sys.argv[1] == "--verify":
        metadata = verify(Path(sys.argv[2]))
        print(f"Restore verification passed; Spotify plays: {metadata['spotify_plays']}")
    elif len(sys.argv) == 1:
        create()
    else:
        raise SystemExit("Usage: backup.py [--verify ARCHIVE]")
