# Monitoring alerts

Production uses Grafana's built-in alert evaluator and Discord receiver. It adds
no container or paid service. Prometheus continues scraping metrics; the former
Prometheus-only rules have moved to Grafana so each alert has one authoritative
pending/firing state. The base local Compose stack provides dashboards; the
production override enables alert provisioning and requires a webhook.

| Alert | Condition | Pending time |
| --- | --- | --- |
| InstanceDown | A Prometheus scrape target has `up < 1` | 2 minutes |
| HighErrorRate | HTTP 5xx requests exceed 5% over a five-minute window | 5 minutes |
| DiskSpaceRunningLow | Free space on `/` is below 15% | 5 minutes |

Availability covers the configured Prometheus, node-exporter and orchestrator
scrape targets. It is not a check of every container or the public website.
No data fires availability/disk alerts; no request data is normal for the HTTP
error-rate rule. Query errors fire alerts for all three rules.

Notifications group by folder and alert name, wait 30 seconds for the first
message, group changes over five minutes, and remind every four hours. Recovery
messages are enabled. Provisioned rules/contact points/policies are managed in
git, not edited in the UI. The policy file owns the organization's entire policy
tree; review/export any manually created policies before first activation.

## Activate after review

1. Reuse a Discord channel webhook, or create one under Server Settings →
   Integrations → Webhooks. Set `DISCORD_WEBHOOK_URL` in the VM's private
   `/opt/devops-control-center/.env` before merging/deploying this change. Never
   commit the URL or print it in logs. Grafana reads it from its environment.
2. Deploy the reviewed commit. Compose recreates Grafana because its environment
   and mounts change. Prometheus's single-file bind mount can retain the old
   configuration after a git update; recreate it explicitly once:

   ```sh
   cd /opt/devops-control-center
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate prometheus
   ```

3. In Grafana Alerting, verify the three rules in **DCC Monitoring**, the **DCC
   Discord** contact point and notification policy. Use the contact point's Test
   button with permission to send a test message to the selected channel.
4. Check the public dashboard, Prometheus targets and Grafana health. Confirm a
   real or controlled alert also sends a recovery message. Avoid stopping a
   production service just to test delivery.

Deployment fails before container changes if the production webhook is missing.
The existing Kubernetes deployment notifier is separate and remains unchanged.
This provisioning applies to Compose production, not the alternative Kubernetes
manifests. The portfolio repository is unaffected.

## Validation and rollback

`python3 scripts/test-alerting.py` boots the production Grafana version locally
with a mock Prometheus API and mock Discord webhook. It validates provisioning,
all three firing transitions and all three recovery deliveries. Timing is
shortened only in temporary copies; no Discord or production credentials are used.
The test also runs in PR/main CI.

Rollback: revert the alerting commit and redeploy, then recreate Prometheus to
restore its previous configuration. File-provisioned Grafana rules can remain in
its database after removing provisioning files: explicitly delete the three
`dcc-*` rules and the `dcc-discord` receiver through Grafana provisioning before
or during rollback. Restore an exported previous notification policy if needed.
Keep the webhook secret until Grafana's obsolete contact point is removed.

This VM cannot notify when the entire VM, Grafana or its network connection is
down. Add an external uptime check for `https://devops.mattdev0.tech` separately
if whole-host outage coverage is needed. Discord delivery also depends on webhook
validity, Discord availability and channel notification settings.
