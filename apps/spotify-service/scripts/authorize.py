#!/usr/bin/env python3
"""One-off Spotify re-authorization.

The existing refresh token only carries user-read-currently-playing. The
dashboard also needs top artists/tracks and recently-played, which requires
consenting again with the wider scope set.

Usage:
    export SPOTIFY_CLIENT_ID=...
    export SPOTIFY_CLIENT_SECRET=...
    python3 authorize.py

Add http://127.0.0.1:8888/callback to the app's Redirect URIs first:
    https://developer.spotify.com/dashboard -> your app -> Settings

The refresh token is written to spotify_refresh_token.txt (mode 600) and is
never printed, so it does not end up in scrollback or a transcript.
"""
import base64
import http.server
import json
import os
import secrets
import sys
import urllib.parse
import urllib.request
import webbrowser

CLIENT_ID = os.environ.get("SPOTIFY_CLIENT_ID")
CLIENT_SECRET = os.environ.get("SPOTIFY_CLIENT_SECRET")
REDIRECT_URI = os.environ.get("SPOTIFY_REDIRECT_URI", "http://127.0.0.1:8888/callback")
SCOPES = "user-read-currently-playing user-read-recently-played user-top-read"

if not CLIENT_ID or not CLIENT_SECRET:
    sys.exit("Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET first.")

state = secrets.token_urlsafe(16)
auth_url = "https://accounts.spotify.com/authorize?" + urllib.parse.urlencode({
    "client_id": CLIENT_ID,
    "response_type": "code",
    "redirect_uri": REDIRECT_URI,
    "scope": SCOPES,
    "state": state,
    "show_dialog": "true",
})

result = {}


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        query = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(query)
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        if params.get("state", [None])[0] != state:
            self.wfile.write(b"<h3>State mismatch. Ignored.</h3>")
            return
        if "error" in params:
            result["error"] = params["error"][0]
            self.wfile.write(b"<h3>Denied. You can close this tab.</h3>")
            return
        result["code"] = params.get("code", [None])[0]
        self.wfile.write(b"<h3>Authorized. You can close this tab.</h3>")

    def log_message(self, *_args):
        pass


port = urllib.parse.urlparse(REDIRECT_URI).port or 8888
print("\nOpen this URL and approve:\n")
print(auth_url + "\n")
try:
    webbrowser.open(auth_url)
except Exception:
    pass

with http.server.HTTPServer(("127.0.0.1", port), Handler) as httpd:
    print(f"Waiting for the redirect on 127.0.0.1:{port} ...")
    while "code" not in result and "error" not in result:
        httpd.handle_request()

if "error" in result:
    sys.exit(f"Authorization denied: {result['error']}")

basic = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
body = urllib.parse.urlencode({
    "grant_type": "authorization_code",
    "code": result["code"],
    "redirect_uri": REDIRECT_URI,
}).encode()
req = urllib.request.Request(
    "https://accounts.spotify.com/api/token",
    data=body,
    headers={"Authorization": f"Basic {basic}",
             "Content-Type": "application/x-www-form-urlencoded"},
)
with urllib.request.urlopen(req, timeout=20) as resp:
    payload = json.load(resp)

refresh = payload.get("refresh_token")
if not refresh:
    sys.exit(f"No refresh token returned: {payload}")

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "spotify_refresh_token.txt")
with open(out, "w") as fh:
    fh.write(refresh + "\n")
os.chmod(out, 0o600)

print("\nGranted scopes:", payload.get("scope"))
print(f"Refresh token written to {out} (mode 600, not printed).")
