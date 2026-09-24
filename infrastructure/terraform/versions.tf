terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }

  # State is local by default. The stack is a single VM and a handful of network
  # resources, so a remote backend is not required to collaborate — but the state
  # file records the public IP and resource ids, so it stays out of git. To move
  # it into Azure Storage later, uncomment and run `terraform init -migrate-state`.
  #
  # backend "azurerm" {
  #   resource_group_name  = "dcc-prod-rg"
  #   storage_account_name = "dccprodtfstate"
  #   container_name       = "tfstate"
  #   key                  = "prod.tfstate"
  # }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}
