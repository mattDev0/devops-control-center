variable "subscription_id" {
  description = "Azure subscription id the stack is deployed into."
  type        = string
}

variable "location" {
  description = <<-EOT
    Azure region. The subscription's policy only permits germanywestcentral,
    italynorth, norwayeast, switzerlandnorth and chilecentral, and B1s capacity
    is restricted in germanywestcentral.
  EOT
  type        = string
  default     = "italynorth"

  validation {
    condition = contains([
      "germanywestcentral", "italynorth", "norwayeast",
      "switzerlandnorth", "chilecentral",
    ], var.location)
    error_message = "Region is blocked by subscription policy; pick one of the five permitted regions."
  }
}

variable "resource_group_name" {
  description = "Resource group holding every resource in this stack."
  type        = string
  default     = "dcc-prod-rg"
}

variable "resource_group_location" {
  description = <<-EOT
    Location recorded on the resource group itself, which differs from where its
    resources run. The group was created in germanywestcentral during the
    2026-08-31 rebuild, before B1s capacity there turned out to be restricted and
    the VM went to italynorth. A resource group's location only says where its
    metadata lives, so the mismatch is harmless — but changing it forces
    replacement of the group and everything in it. Leave it alone.
  EOT
  type        = string
  default     = "germanywestcentral"
}

variable "vm_name" {
  description = "Name of the VM. Network resources derive their names from it."
  type        = string
  default     = "dcc-prod-01"
}

variable "vm_size" {
  description = <<-EOT
    VM size. B1s is 1 vCPU / ~892 MiB usable RAM, which the stack fits into only
    with the 4 GiB swapfile and per-container memory limits. Changing this is a
    capacity decision, not a config tweak.
  EOT
  type        = string
  default     = "Standard_B1s"
}

variable "admin_username" {
  description = "Login user on the VM. Password auth is disabled; SSH keys only."
  type        = string
  default     = "matt"
}

variable "ssh_public_keys" {
  description = <<-EOT
    SSH public keys authorised for the admin user at provision time. This is the
    boot-time set only: the deploy key used by CI is installed separately into
    authorized_keys with a forced command, and is not managed here.
  EOT
  type        = list(string)

  validation {
    condition     = length(var.ssh_public_keys) > 0
    error_message = "At least one SSH public key is required; password auth is disabled."
  }
}

variable "ssh_source_address_prefix" {
  description = <<-EOT
    Source allowed to reach port 22. Defaults to "*" because that is what the
    hand-built NSG currently allows and CI deploys over SSH from GitHub-hosted
    runners, whose addresses are not fixed. Narrow it to your own address if you
    move deploys onto a self-hosted runner or a jump host.
  EOT
  type        = string
  default     = "*"
}

variable "os_disk_name" {
  description = <<-EOT
    Name of the existing OS disk. Azure generated this name when the VM was built
    by hand; pinning it here keeps `terraform plan` from proposing to replace the
    disk — and with it the VM — on the first run after import.
  EOT
  type        = string
  default     = "dcc-prod-01_OsDisk_1_3ec02c632fcb4982a3f1e41b4a80c4c8"
}

variable "os_disk_size_gb" {
  description = "OS disk size in GiB."
  type        = number
  default     = 64
}

variable "tags" {
  description = "Tags applied to every resource."
  type        = map(string)
  default = {
    project     = "devops-control-center"
    environment = "production"
    managed_by  = "terraform"
  }
}
