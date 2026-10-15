#!/usr/bin/env python3
"""Exercise production Grafana rules and Discord delivery against local stubs.

Requires Docker; sends no requests to Discord and uses no production credentials.
Only evaluation/pending/grouping intervals are shortened in temporary copies.
"""

import base64
import json
from pathlib import Path
import re
import subprocess
import tempfile
import time
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen
import uuid


ROOT = Path(__file__).resolve().parent.parent
NAMES = {"InstanceDown", "HighErrorRate", "DiskSpaceRunningLow"}


def serve_stub():
    healthy = False
    messages = []
    queries = set()

    class Stub(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def respond(self, params):
            query = params.get("query", [""])[0]
            queries.add(query)
            if query == "up":
                value = 1 if healthy else 0
                labels = {"instance": "test:9100", "job": "node"}
            elif "node_filesystem_avail_bytes" in query:
                value = 50 if healthy else 10
                labels = {"instance": "test:9100", "mountpoint": "/"}
            elif "http_server_requests_seconds_count" in query:
                value = 0 if healthy else 10
                labels = {}
            else:
                self.send_error(400, "Unexpected Prometheus query")
                return
            body = json.dumps({"status": "success", "data": {
                "resultType": "vector", "result": [{"metric": labels,
                    "value": [time.time(), str(value)]}]}}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path in {"/messages", "/queries"}:
                body = json.dumps(messages if self.path == "/messages" else sorted(queries)).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(body)
            else:
                self.respond(parse_qs(urlsplit(self.path).query))

        def do_POST(self):
            nonlocal healthy
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            if urlsplit(self.path).path == "/healthy":
                healthy = True
                self.send_response(204)
                self.end_headers()
            elif urlsplit(self.path).path == "/discord":
                messages.append(json.loads(body))
                self.send_response(204)
                self.end_headers()
            else:
                self.respond(parse_qs(body.decode()))

    ThreadingHTTPServer(("0.0.0.0", 8080), Stub).serve_forever()


def run():
    token = uuid.uuid4().hex[:12]
    container = "dcc-alert-test-" + token
    mock = "dcc-alert-mock-" + token
    network = "dcc-alert-network-" + token
    grafana_port = None
    mock_port = None

    def port(name, internal):
        published = subprocess.check_output(["docker", "port", name, str(internal) + "/tcp"], text=True)
        return int(published.strip().rsplit(":", 1)[1])

    password = uuid.uuid4().hex
    auth = base64.b64encode(("admin:" + password).encode()).decode()

    def api(path):
        req = Request(f"http://127.0.0.1:{grafana_port}{path}",
                      headers={"Authorization": "Basic " + auth})
        with urlopen(req, timeout=5) as response:
            return json.load(response)

    def mock_api(path):
        with urlopen(f"http://127.0.0.1:{mock_port}{path}", timeout=5) as response:
            return json.load(response)

    def wait_for(predicate, description, seconds=60):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            try:
                if predicate():
                    return
            except (OSError, ValueError):
                pass
            time.sleep(1)
        raise AssertionError("Timed out waiting for " + description)

    def received(status):
        found = set()
        messages = mock_api("/messages")
        for message in messages:
            text = json.dumps(message)
            if "[" + status in text:
                found.update(name for name in NAMES if name in text)
        return found

    try:
        with tempfile.TemporaryDirectory(prefix="dcc-alert-test-") as temp:
            base = Path(temp)
            # Grafana runs as uid 472 and must be able to read provisioning files.
            base.chmod(0o755)
            for subdir in ("alerting", "datasources", "plugins", "dashboards"):
                (base / subdir).mkdir()
            source = ROOT / "infrastructure/monitoring/grafana"
            for name in ("rules.yml", "notifications.yml"):
                content = (source / "alerting" / name).read_text()
                content = re.sub(r"(?m)^(\s*for:) (2m|5m)$", r"\1 2s", content)
                content = content.replace("interval: 30s", "interval: 10s")
                content = content.replace("group_wait: 30s", "group_wait: 1s")
                content = content.replace("group_interval: 5m", "group_interval: 1s")
                (base / "alerting" / name).write_text(content)
            datasource = (source / "provisioning/datasources/prometheus.yml").read_text()
            datasource = datasource.replace("http://devops-prometheus:9090",
                                            "http://mock:8080")
            (base / "datasources/prometheus.yml").write_text(datasource)
            subprocess.run(["docker", "network", "create", network], check=True,
                           stdout=subprocess.DEVNULL)
            subprocess.run([
                "docker", "run", "--detach", "--name", mock,
                "--network", network, "--network-alias", "mock", "--memory", "64m",
                "--publish", "127.0.0.1::8080", "--user", "10001:10001",
                "--volume", str(Path(__file__).resolve()) + ":/server.py:ro",
                "python:3.12-alpine", "python3", "/server.py", "--stub"],
                check=True, stdout=subprocess.DEVNULL)
            mock_port = port(mock, 8080)
            wait_for(lambda: mock_api("/queries") == [], "mock startup", seconds=15)
            subprocess.run([
                "docker", "run", "--detach", "--name", container,
                "--network", network, "--memory", "256m",
                "--publish", "127.0.0.1::3000",
                "--volume", str(base) + ":/etc/grafana/provisioning:ro",
                "--env", "GF_SECURITY_ADMIN_PASSWORD=" + password,
                "--env", "GF_ANALYTICS_REPORTING_ENABLED=false",
                "--env", "GF_ANALYTICS_CHECK_FOR_UPDATES=false",
                "--env", "GF_ANALYTICS_CHECK_FOR_PLUGIN_UPDATES=false",
                "--env", "DISCORD_WEBHOOK_URL=http://mock:8080/discord",
                "grafana/grafana:11.0.0"], check=True, stdout=subprocess.DEVNULL)
            grafana_port = port(container, 3000)
            wait_for(lambda: api("/api/health")["database"] == "ok", "Grafana startup")
            rules = api("/api/v1/provisioning/alert-rules")
            assert {rule["title"] for rule in rules} == NAMES, "Missing provisioned rule"
            contacts = api("/api/v1/provisioning/contact-points")
            discord = next(cp for cp in contacts if cp["uid"] == "dcc-discord")
            assert discord["type"] == "discord"
            assert not discord["disableResolveMessage"]
            print("Grafana rules and Discord receiver provisioned; checking delivery", flush=True)
            wait_for(lambda: received("FIRING") == NAMES, "three firing notifications")
            with urlopen(Request(f"http://127.0.0.1:{mock_port}/healthy", data=b""), timeout=5):
                pass
            wait_for(lambda: received("RESOLVED") == NAMES, "three recovery notifications")
            with urlopen(f"http://127.0.0.1:{mock_port}/queries", timeout=5) as response:
                assert len(json.load(response)) == 3, "Not all metric queries executed"
            print("PASS: all three rules provisioned, fired and resolved through the Discord receiver")
    except Exception:
        # This container only has generated test credentials and a local webhook.
        for name in (container, mock):
            logs = subprocess.run(["docker", "logs", "--tail", "25", name],
                                  capture_output=True, text=True)
            print(logs.stdout + logs.stderr)
        raise
    finally:
        subprocess.run(["docker", "rm", "--force", container, mock],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["docker", "network", "rm", network],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


if __name__ == "__main__":
    if "--stub" in sys.argv:
        serve_stub()
    else:
        run()
