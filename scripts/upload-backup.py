#!/usr/bin/env python3
"""Upload to an rclone crypt remote, verify a downloaded restore, then prune."""
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

spec = importlib.util.spec_from_file_location("backup", Path(__file__).with_name("backup.py"))
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)
NAME = re.compile(r"^backup_[0-9]{8}_[0-9]{6}_[0-9]{6}\.tar\.gz$")


def upload():
    remote = os.environ.get("DCC_BACKUP_REMOTE", "")
    config = os.environ.get("DCC_RCLONE_CONFIG", "/root/.config/rclone/rclone.conf")
    # A dedicated crypt remote makes retention unable to touch other Drive files.
    if not re.fullmatch(r"[A-Za-z0-9_-]+:", remote):
        raise ValueError("Set DCC_BACKUP_REMOTE to a dedicated crypt remote, e.g. dcc-crypt:")
    base = ["rclone", "--config", config, "--transfers", "1", "--checkers", "1",
            "--buffer-size", "1M", "--retries", "3"]

    def run(*args):
        return subprocess.check_output(base + list(args), text=True)

    types = json.loads(run("listremotes", "--json"))
    if not any(entry.get("name") == remote[:-1] and entry.get("type") == "crypt" for entry in types):
        raise ValueError("Backup destination must be an rclone crypt remote")
    output = Path(os.environ.get("DCC_BACKUP_DIR", "/opt/devops-control-center/backups"))
    archives = sorted(p for p in output.glob("backup_*.tar.gz") if NAME.fullmatch(p.name))
    if not archives:
        raise ValueError("No completed backup to upload")
    archive = archives[-1]
    backup.verify(archive)
    destination = remote + archive.name
    run("copyto", str(archive), destination)
    # Download through crypt: this checks decryption as well as the recovered data.
    with tempfile.TemporaryDirectory(prefix=".drive-restore-", dir=output) as temp:
        restored = Path(temp) / archive.name
        run("copyto", destination, str(restored))
        if backup.digest(restored) != backup.digest(archive):
            raise ValueError("Downloaded backup differs from uploaded archive")
        backup.verify(restored)
    listing = json.loads(run("lsjson", remote, "--files-only", "--max-depth", "1"))
    names = sorted({entry["Path"] for entry in listing if NAME.fullmatch(entry["Path"])}, reverse=True)
    if archive.name not in names:
        raise ValueError("Uploaded backup missing from remote listing")
    # Remote retention only follows a successful download/restore check.
    for stale in names[7:]:
        run("deletefile", remote + stale)
    print(f"Encrypted Drive backup verified: {archive.name}")


if __name__ == "__main__":
    upload()
