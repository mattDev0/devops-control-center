# Docker layer cache never hit, so every deploy rebuilt everything

| | |
|---|---|
| Date | 2026-11-03 |
| Severity | Low (slow deploys, about 12 minutes per change to production; no failures, no user impact) |
| Status | Resolved (warm-cache timing not measured yet, see Open items) |
| Fix | [DCC PR #75](https://github.com/mattDev0/devops-control-center/pull/75), [portfolio PR #40](https://github.com/mattDev0/portfolio-monorepo/pull/40) |

## Summary
Every production deploy in GitHub Actions rebuilt container images and dependencies from scratch because Docker layer caching lacked cache scopes, causing images in the build job to overwrite each other's cache entries. This was a deployment performance problem rather than an outage. I separated cache scopes per image, parallelized image builds across a matrix, and restructured Dockerfiles to cache Rust and Java dependencies in their own layers.

## Impact
Deployments were slow, taking about 12 minutes for DevOps Control Center (DCC) and 6.8 minutes for the portfolio monorepo on every commit pushed to main. Development feedback was delayed and unnecessary runner minutes were consumed. Production uptime and application availability were unaffected.

## Timeline
- 2026-10-31 14:09 UTC: Baseline DCC deploy [run 41207881300](https://github.com/mattDev0/devops-control-center/actions/runs/41207881300) took 11.8 minutes total (1m53s test, 8m09s image build, 1m38s deploy). Unmodified Rust and Java services recompiled their entire dependency trees.
- 2026-10-31 14:35 UTC: Baseline portfolio deploy [run 41208255455](https://github.com/mattDev0/portfolio-monorepo/actions/runs/41208255455) took 6.8 minutes.
- 2026-11-03 04:24 UTC: Merged DCC [PR #75](https://github.com/mattDev0/devops-control-center/pull/75) (commit c5cbe14) and portfolio [PR #40](https://github.com/mattDev0/portfolio-monorepo/pull/40).
- 2026-11-03 05:25 UTC: First deploy after merge: DCC took 5.2 minutes on a cold cache ([run 41577946427](https://github.com/mattDev0/devops-control-center/actions/runs/41577946427)) down from 11.8 minutes; portfolio took 5.1 minutes ([run 41577953928](https://github.com/mattDev0/portfolio-monorepo/actions/runs/41577953928)) down from 6.8 minutes.
- 2026-11-03 05:30 UTC: Production health verified; both sites returned 200 and Cloud Run services were Ready.

## Root cause
In `.github/workflows/deploy-compose.yml`, every `docker/build-push-action` step used GitHub Actions caching without specifying a `scope`:
```yaml
cache-from: type=gha
cache-to: type=gha,mode=max
```
Without a scope, all four images shared one cache key. Each image build overwrote the previous image's cache, so the next run found nothing useful. In run 41207881300, although the Rust agent code had not changed, it spent 2m10s recompiling all dependencies, and the orchestrator recompiled too.

Two contributing factors made builds slower:
1. Sequential execution: All images built sequentially in a single job.
2. Ineffective cache mounts: The Rust and Java Dockerfiles used `--mount=type=cache`, which is not preserved between GitHub Actions runs.

## Fix
In DCC [PR #75](https://github.com/mattDev0/devops-control-center/pull/75) and portfolio [PR #40](https://github.com/mattDev0/portfolio-monorepo/pull/40):
- Separate cache scopes: Added `scope=${{ matrix.image }}` to `cache-from` and `cache-to` in [.github/workflows/deploy-compose.yml](../../.github/workflows/deploy-compose.yml).
- Matrix builds: Converted sequential builds into a matrix running in parallel. In DCC, builds run alongside tests; in the portfolio, builds wait for tests because images push with `:latest`.
- Removed QEMU: Dropped `docker/setup-qemu-action` because all images target `linux/amd64`.
- Dependency caching in Dockerfiles:
  - Rust: In [apps/agent/Dockerfile](../../apps/agent/Dockerfile) and [apps/spotify-service/Dockerfile](../../apps/spotify-service/Dockerfile), compiled dependencies against a placeholder `main.rs` before copying application source.
  - Java: In [apps/orchestrator/Dockerfile](../../apps/orchestrator/Dockerfile), added a Maven `dependency:go-offline` layer before copying source.

## Verification
- Local build checks: Rebuilt all five images locally from PR heads. Verified binaries were complete applications exceeding 2 MB rather than placeholder stubs.
- Incremental test: A source change recompiled only one crate while reusing cached dependency layers.
- Security check: The agent container started with `AGENT_SECRET_KEY` set and failed fast without it.
- Portfolio workflow: Confirmed deploy steps were unchanged.
- Post-merge results: DCC deploy dropped from 11.8 to 5.2 minutes ([run 41577946427](https://github.com/mattDev0/devops-control-center/actions/runs/41577946427)) and portfolio dropped from 6.8 to 5.1 minutes ([run 41577953928](https://github.com/mattDev0/portfolio-monorepo/actions/runs/41577953928)). Both sites returned 200 and Cloud Run services were Ready.

Trade-off: With caching working, the final-stage `apt-get upgrade` layer stays cached until the base image changes, so OS patches arrive with base image updates rather than every build. The per-deploy Trivy scan gate and weekly security scans still run to flag vulnerabilities.

## What I learned
- A cache that is configured is not the same as a cache that hits; check logs for "CACHED" and compare step timings.
- Measure a baseline before optimizing and quote run IDs.
- Caching can hide updates, so pair it with vulnerability scanning.

## Open items
- Warm-cache deploy time (the second deploy after merge) not measured yet.
