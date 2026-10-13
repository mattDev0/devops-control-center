"""Exercise WAL snapshots, archive restore, retention and failure handling."""
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("backup", Path(__file__).with_name("backup.py"))
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class BackupTest(unittest.TestCase):
    def test_live_wal_restore_retention_and_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            project, output = root / "project", root / "backups"
            project.mkdir()
            for name in backup.CONFIGS:
                (project / name).write_text("fixture configuration")
            volumes = {}
            connections = []
            for name in backup.VOLUMES:
                volume = root / name
                volume.mkdir()
                volumes[f"devops-control-center_{name}"] = volume
                if name in backup.DATABASES:
                    db = sqlite3.connect(volume / backup.DATABASES[name])
                    connections.append(db)
                    db.execute("PRAGMA journal_mode=WAL")
                    db.execute("CREATE TABLE plays (id INTEGER)")
                    db.execute("INSERT INTO plays VALUES (1)")
                    db.commit()
                else:
                    (volume / "account.json").write_text("fixture certificate account")

            def inspect(args, **kwargs):
                return json.dumps([{"Mountpoint": str(volumes[args[-1]])}])

            try:
                with patch.dict(os.environ, {"DCC_PROJECT_DIR": str(project), "DCC_BACKUP_DIR": str(output)}), \
                     patch.object(backup.subprocess, "check_output", side_effect=inspect):
                    for _ in range(8):
                        backup.create()
                    archives = sorted(output.glob("backup_*.tar.gz"))
                    self.assertEqual(len(archives), 7)
                    self.assertEqual(backup.verify(archives[-1])["spotify_plays"], 1)
                    self.assertEqual(archives[-1].stat().st_mode & 0o777, 0o600)
                    (project / ".env").unlink()
                    with self.assertRaises(FileNotFoundError):
                        backup.create()
                    self.assertEqual(sorted(output.glob("backup_*.tar.gz")), archives)
                    damaged = root / "damaged.tar.gz"
                    damaged.write_bytes(archives[-1].read_bytes()[:100])
                    with self.assertRaises((EOFError, backup.tarfile.TarError)):
                        backup.verify(damaged)
            finally:
                for connection in connections:
                    connection.close()


if __name__ == "__main__":
    unittest.main()
