# Terraform — production infrastructure

Declares the Azure substrate the platform runs on: resource group, virtual network
and subnet, network security group, static public IP, NIC, and the `dcc-prod-01`
VM.

Everything above the VM is already declarative and lives elsewhere in this
repository — `docker-compose.yml`, the Caddy config, the Prometheus scrape config
and alert rules, the Grafana dashboards, and the GitHub Actions workflows. This
directory closes the last gap: the substrate itself, which was built by hand
during the 2026-08-31 subscription rebuild and previously existed only as a
sequence of `az` commands in a terminal history.

## What it does not manage

- **The application stack.** Deployment is `scripts/deploy.sh` over SSH, driven by
  CI. Terraform provisions the host; it does not deploy onto it.
- **The live `authorized_keys` file.** `ssh_public_keys` is the boot-time key set
  only. The CI deploy key is installed on the host with a forced command that
  validates the commit SHA, and is deliberately not Terraform-managed — rotating
  it must not require touching the VM resource.
- **DNS.** The records for `mattdev0.tech` are held at the registrar, not in
  Azure DNS. The public IP is static so those records stay valid.
- **Secrets.** `/opt/devops-control-center/.env` is managed on the host.

## First run — adopting the existing infrastructure

The infrastructure already exists and is serving traffic. Import it; do not apply
into an empty state, which would build a second, parallel stack.

```bash
cp terraform.tfvars.example terraform.tfvars   # then fill it in
terraform init
./import.sh
terraform plan
```

A correct first plan proposes **tag additions and nothing else**. If it proposes
to destroy or replace the VM, the OS disk or the public IP, the configuration has
drifted from reality — fix the configuration and re-plan. Do not apply.

`prevent_destroy` is set on the VM and the public IP as a second line of defence:
Terraform will refuse the operation rather than take production down. The `ignore_changes`
block on the VM covers the attributes that force replacement — notably
`source_image_reference`, since `version = "latest"` resolves to a newer image
whenever Canonical publishes one, while the running host was built from
`22.04.202608060`.

## Routine use

```bash
terraform plan     # review
terraform apply    # apply
terraform fmt -recursive && terraform validate
```

## Region constraint

The subscription's Azure Policy permits only `germanywestcentral`, `italynorth`,
`norwayeast`, `switzerlandnorth` and `chilecentral`, and B1s capacity is
restricted in `germanywestcentral` — a `SkuNotAvailable` failure during the
rebuild is why production sits in `italynorth`. The `location` variable validates
against that list so a bad region fails at plan time rather than halfway through
an apply.

## Sizing

`Standard_B1s` is 1 vCPU and ~892 MiB usable RAM. The stack fits only with the
4 GiB swapfile and `vm.swappiness=20` on the host, plus per-container memory
limits in Compose. Resizing is a capacity decision — check `free -h` on the host
first.

## State

Local by default, and gitignored: the state file records resource ids and the
public IP. `versions.tf` carries a commented `azurerm` backend block for moving
state into Azure Storage (`terraform init -migrate-state`) if this ever needs to
run from CI or from more than one machine.
