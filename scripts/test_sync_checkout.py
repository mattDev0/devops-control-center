"""Tests for sync-checkout.sh."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT_PATH = str(Path(__file__).resolve().with_name("sync-checkout.sh"))


class SyncCheckoutTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.origin = self.root / "origin.git"
        self.work = self.root / "work"
        self.deploy = self.root / "deploy"

        self.git_env = os.environ.copy()
        self.git_env.update({
            "GIT_AUTHOR_NAME": "Test User",
            "GIT_AUTHOR_EMAIL": "test@example.com",
            "GIT_COMMITTER_NAME": "Test User",
            "GIT_COMMITTER_EMAIL": "test@example.com",
        })

        subprocess.run(["git", "init", "--bare", "-b", "main", str(self.origin)], env=self.git_env, check=True, capture_output=True)
        subprocess.run(["git", "clone", str(self.origin), str(self.work)], env=self.git_env, check=True, capture_output=True)

        # Commit A
        (self.work / "config.txt").write_text("A")
        subprocess.run(["git", "add", "config.txt"], cwd=self.work, env=self.git_env, check=True, capture_output=True)
        subprocess.run(["git", "commit", "-m", "commit A"], cwd=self.work, env=self.git_env, check=True, capture_output=True)
        self.sha_a = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.work, env=self.git_env, check=True, capture_output=True, text=True).stdout.strip()

        # Commit B
        (self.work / "config.txt").write_text("B")
        subprocess.run(["git", "commit", "-am", "commit B"], cwd=self.work, env=self.git_env, check=True, capture_output=True)
        self.sha_b = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.work, env=self.git_env, check=True, capture_output=True, text=True).stdout.strip()

        subprocess.run(["git", "push", "origin", "main"], cwd=self.work, env=self.git_env, check=True, capture_output=True)

        # Commit X on branch other (not on main)
        subprocess.run(["git", "checkout", "-b", "other", self.sha_a], cwd=self.work, env=self.git_env, check=True, capture_output=True)
        (self.work / "other.txt").write_text("X")
        subprocess.run(["git", "add", "other.txt"], cwd=self.work, env=self.git_env, check=True, capture_output=True)
        subprocess.run(["git", "commit", "-m", "commit X"], cwd=self.work, env=self.git_env, check=True, capture_output=True)
        self.sha_x = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.work, env=self.git_env, check=True, capture_output=True, text=True).stdout.strip()
        subprocess.run(["git", "push", "origin", "other"], cwd=self.work, env=self.git_env, check=True, capture_output=True)

        # Clone origin into deploy
        subprocess.run(["git", "clone", str(self.origin), str(self.deploy)], env=self.git_env, check=True, capture_output=True)

    def tearDown(self):
        self.temp_dir.cleanup()

    def run_sync(self, sha):
        cmd = ["bash", "-c", '. "$SCRIPT"; sync_checkout "$1"', "_", sha]
        env = self.git_env.copy()
        env["SCRIPT"] = SCRIPT_PATH
        return subprocess.run(cmd, cwd=self.deploy, env=env, capture_output=True, text=True)

    def get_deploy_head(self):
        return subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.deploy, env=self.git_env, check=True, capture_output=True, text=True).stdout.strip()

    def get_deploy_config(self):
        return (self.deploy / "config.txt").read_text()

    def test_checks_out_latest_main_commit(self):
        res = self.run_sync(self.sha_b)
        self.assertEqual(res.returncode, 0)
        self.assertEqual(self.get_deploy_head(), self.sha_b)
        self.assertEqual(self.get_deploy_config(), "B")

    def test_checks_out_older_main_commit(self):
        res = self.run_sync(self.sha_a)
        self.assertEqual(res.returncode, 0)
        self.assertEqual(self.get_deploy_head(), self.sha_a)
        self.assertEqual(self.get_deploy_config(), "A")

    def test_rejects_short_or_non_hex_sha(self):
        initial_head = self.get_deploy_head()
        for invalid_sha in ["abc123", self.sha_b[:12], "g" * 40]:
            with self.subTest(invalid_sha=invalid_sha):
                res = self.run_sync(invalid_sha)
                self.assertNotEqual(res.returncode, 0)
                self.assertEqual(self.get_deploy_head(), initial_head)

    def test_rejects_commit_not_on_main(self):
        initial_head = self.get_deploy_head()
        res = self.run_sync(self.sha_x)
        self.assertNotEqual(res.returncode, 0)
        self.assertEqual(self.get_deploy_head(), initial_head)

    def test_discards_local_changes_to_tracked_files(self):
        (self.deploy / "config.txt").write_text("local")
        res = self.run_sync(self.sha_b)
        self.assertEqual(res.returncode, 0)
        self.assertEqual(self.get_deploy_config(), "B")

    def test_fetches_new_commits(self):
        subprocess.run(["git", "checkout", "main"], cwd=self.work, env=self.git_env, check=True, capture_output=True)
        (self.work / "config.txt").write_text("C")
        subprocess.run(["git", "commit", "-am", "commit C"], cwd=self.work, env=self.git_env, check=True, capture_output=True)
        sha_c = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.work, env=self.git_env, check=True, capture_output=True, text=True).stdout.strip()
        subprocess.run(["git", "push", "origin", "main"], cwd=self.work, env=self.git_env, check=True, capture_output=True)

        res = self.run_sync(sha_c)
        self.assertEqual(res.returncode, 0)
        self.assertEqual(self.get_deploy_head(), sha_c)
        self.assertEqual(self.get_deploy_config(), "C")


if __name__ == "__main__":
    unittest.main()
