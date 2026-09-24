#!/usr/bin/env bash
# Adopt the hand-built production infrastructure into Terraform state.
#
# The VM, its network and its disk were created by hand during the 2026-08-31
# rebuild. This imports them so Terraform manages what already exists instead of
# creating a parallel copy. It is safe to re-run: already-imported resources are
# skipped.
#
# Usage: SUBSCRIPTION_ID=<id> ./import.sh
set -euo pipefail

SUBSCRIPTION_ID="${SUBSCRIPTION_ID:-$(az account show --query id -o tsv)}"
RG="${RG:-dcc-prod-rg}"
VM="${VM:-dcc-prod-01}"

base="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}"
net="${base}/providers/Microsoft.Network"

import() {
  local addr="$1" id="$2"
  if terraform state show "$addr" >/dev/null 2>&1; then
    echo "skip   $addr (already in state)"
  else
    echo "import $addr"
    terraform import "$addr" "$id"
  fi
}

import azurerm_resource_group.dcc "${base}"
import azurerm_virtual_network.dcc "${net}/virtualNetworks/${VM}VNET"
import azurerm_subnet.dcc "${net}/virtualNetworks/${VM}VNET/subnets/${VM}Subnet"
import azurerm_network_security_group.dcc "${net}/networkSecurityGroups/${VM}NSG"
import azurerm_public_ip.dcc "${net}/publicIPAddresses/${VM}PublicIP"
import azurerm_network_interface.dcc "${net}/networkInterfaces/${VM}VMNic"
import azurerm_network_interface_security_group_association.dcc \
  "${net}/networkInterfaces/${VM}VMNic|${net}/networkSecurityGroups/${VM}NSG"
import azurerm_linux_virtual_machine.dcc \
  "${base}/providers/Microsoft.Compute/virtualMachines/${VM}"

echo
echo "Now run: terraform plan"
echo "Expect only tag additions. Anything proposing to destroy or replace the VM,"
echo "the disk or the public IP means the configuration has drifted from reality —"
echo "reconcile the config, do not apply."
