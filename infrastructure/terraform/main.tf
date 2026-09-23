resource "azurerm_resource_group" "dcc" {
  name     = var.resource_group_name
  location = var.resource_group_location
  tags     = var.tags

  lifecycle {
    # Replacing the group destroys everything inside it. Its location differs
    # from the resources' location by history, not by mistake — see the variable.
    prevent_destroy = true
  }
}

resource "azurerm_virtual_network" "dcc" {
  name                = "${var.vm_name}VNET"
  address_space       = ["10.0.0.0/16"]
  location            = var.location
  resource_group_name = azurerm_resource_group.dcc.name
  tags                = var.tags
}

resource "azurerm_subnet" "dcc" {
  name                 = "${var.vm_name}Subnet"
  resource_group_name  = azurerm_resource_group.dcc.name
  virtual_network_name = azurerm_virtual_network.dcc.name
  address_prefixes     = ["10.0.0.0/24"]
}

# Only 22, 80 and 443 are reachable from outside. Every other service — the agent,
# Prometheus, node-exporter, Grafana — is published to the host loopback or reached
# through Caddy, so it must never appear here.
resource "azurerm_network_security_group" "dcc" {
  name                = "${var.vm_name}NSG"
  location            = var.location
  resource_group_name = azurerm_resource_group.dcc.name
  tags                = var.tags

  security_rule {
    name                       = "AllowSSH"
    priority                   = 300
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = var.ssh_source_address_prefix
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "AllowHTTP"
    priority                   = 1000
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "80"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "AllowHTTPS"
    priority                   = 1010
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}

# Static: the A records for mattdev0.tech point here, and a dynamic address would
# break DNS on every deallocation.
resource "azurerm_public_ip" "dcc" {
  name                = "${var.vm_name}PublicIP"
  location            = var.location
  resource_group_name = azurerm_resource_group.dcc.name
  allocation_method   = "Static"
  sku                 = "Standard"
  ip_version          = "IPv4"
  tags                = var.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_network_interface" "dcc" {
  name                = "${var.vm_name}VMNic"
  location            = var.location
  resource_group_name = azurerm_resource_group.dcc.name
  tags                = var.tags

  ip_configuration {
    name                          = "ipconfig${var.vm_name}"
    subnet_id                     = azurerm_subnet.dcc.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.dcc.id
  }
}

resource "azurerm_network_interface_security_group_association" "dcc" {
  network_interface_id      = azurerm_network_interface.dcc.id
  network_security_group_id = azurerm_network_security_group.dcc.id
}

resource "azurerm_linux_virtual_machine" "dcc" {
  name                            = var.vm_name
  location                        = var.location
  resource_group_name             = azurerm_resource_group.dcc.name
  size                            = var.vm_size
  admin_username                  = var.admin_username
  disable_password_authentication = true
  network_interface_ids           = [azurerm_network_interface.dcc.id]
  tags                            = var.tags

  dynamic "admin_ssh_key" {
    for_each = var.ssh_public_keys
    content {
      username   = var.admin_username
      public_key = admin_ssh_key.value
    }
  }

  os_disk {
    name                 = var.os_disk_name
    caching              = "ReadWrite"
    storage_account_type = "StandardSSD_LRS"
    disk_size_gb         = var.os_disk_size_gb
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts-gen2"
    version   = "latest"
  }

  lifecycle {
    # This VM carries production. Every attribute below forces replacement when it
    # drifts, which would destroy the running host and its disk.
    #
    # - source_image_reference: "latest" resolves to a new image version whenever
    #   Canonical publishes one. The running VM was built from 22.04.202608060.
    # - admin_ssh_key / admin_username / custom_data: boot-time only. The live
    #   authorized_keys file — including the CI deploy key with its forced command —
    #   is managed on the host, not here.
    prevent_destroy = true

    ignore_changes = [
      source_image_reference,
      admin_ssh_key,
      admin_username,
      custom_data,
    ]
  }
}
