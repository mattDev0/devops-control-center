terraform {
  required_providers {
    local = {
      source = "hashicorp/local"
      version = "2.4.0"
    }
  }
}

resource "local_file" "hello_world" {
  content  = "Hello from Terraform orchestrated by the DevOps Control Center!"
  filename = "${path.module}/hello_terraform.txt"
}