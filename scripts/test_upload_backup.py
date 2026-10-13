import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("upload", Path(__file__).with_name("upload-backup.py"))
upload = importlib.util.module_from_spec(spec)
spec.loader.exec_module(upload)


class UploadTest(unittest.TestCase):
    def exercise(self, *, damaged=False, crypt=True, offline=False):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            names = [f"backup_20261013_020000_{i:06d}.tar.gz" for i in range(9)]
            (root / names[-1]).write_bytes(b"verified fixture archive")
            deleted = []

            def run(args, **kwargs):
                command = args[args.index("3") + 1:]
                if command[0] == "listremotes":
                    return json.dumps([{"name": "dcc-crypt", "type": "crypt" if crypt else "drive"}])
                if command[0] == "copyto":
                    if offline:
                        raise upload.subprocess.CalledProcessError(1, "rclone")
                    if command[1].startswith("dcc-crypt:"):
                        Path(command[2]).write_bytes(b"corrupt" if damaged else b"verified fixture archive")
                    return ""
                if command[0] == "lsjson":
                    return json.dumps([{"Path": name} for name in names] + [{"Path": "unrelated.txt"}])
                if command[0] == "deletefile":
                    deleted.append(command[1])
                    return ""
                raise AssertionError(command)

            with patch.dict(os.environ, {"DCC_BACKUP_DIR": str(root), "DCC_BACKUP_REMOTE": "dcc-crypt:"}), \
                 patch.object(upload.subprocess, "check_output", side_effect=run), \
                 patch.object(upload.backup, "verify"):
                if damaged or not crypt or offline:
                    with self.assertRaises((ValueError, upload.subprocess.CalledProcessError)):
                        upload.upload()
                    self.assertEqual(deleted, [])
                else:
                    upload.upload()
                    self.assertEqual(deleted, ["dcc-crypt:" + names[1], "dcc-crypt:" + names[0]])

    def test_verified_download_before_retention(self):
        self.exercise()

    def test_corrupt_download_keeps_prior_copies(self):
        self.exercise(damaged=True)

    def test_reject_unencrypted_remote(self):
        self.exercise(crypt=False)

    def test_failed_upload_keeps_prior_copies(self):
        self.exercise(offline=True)


if __name__ == "__main__":
    unittest.main()
