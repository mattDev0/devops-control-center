# Incident Write-ups

Blameless write-ups of real problems encountered and resolved in this platform, documented honestly regarding scale and impact.

| Date | Title | Severity | Status |
|---|---|---|---|
| 2026-11-03 | [Docker layer cache never hit, so every deploy rebuilt everything](2026-11-03-ci-docker-layer-cache.md) | Low (slow deploys, about 12 minutes per change; no outage) | Resolved |
| 2026-10-31 | [Empty API responses overwrote cached Spotify genres](2026-10-31-spotify-genres-cache.md) | Low (cosmetic gap on public dashboard; no data loss outside cache) | Partially resolved |

Each write-up follows a standard format covering Summary, Impact, Timeline, Root cause, Fix, Verification, What I learned, and Open items.
