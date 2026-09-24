output "public_ip_address" {
  description = "Static public IP the DNS A records point at."
  value       = azurerm_public_ip.dcc.ip_address
}

output "ssh_command" {
  description = "How to reach the host."
  value       = "ssh -i ~/.ssh/dcc-prod_key ${var.admin_username}@${azurerm_public_ip.dcc.ip_address}"
}

output "vm_id" {
  description = "Resource id of the VM."
  value       = azurerm_linux_virtual_machine.dcc.id
}
