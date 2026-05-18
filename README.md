# 🚀 DevOps Control Center

A custom, end-to-end DevOps orchestration and observability platform built from scratch. This project unifies server monitoring, remote terminal execution, Docker container management, CI/CD pipeline tracking, and Infrastructure-as-Code (IaC) provisioning into a single, sleek React dashboard.

---

# 🏗️ Architecture

The platform is built on a modern, secure three-tier architecture:

## Frontend — React + Vite + Tailwind CSS

A responsive single-page dashboard featuring:

* Embedded `xterm.js` terminals
* Live Server-Sent Events (SSE) log streaming
* Embedded Grafana metric dashboards
* Real-time infrastructure visibility

## Orchestrator — Java Spring Boot

The central coordination layer responsible for:

* Securely proxying commands to agents
* Integrating with external APIs (e.g. GitHub)
* Managing backend API communication
* Serving as the primary backend for the React frontend

## Agent — Rust + Axum

A lightweight, high-performance system agent running on the target machine or WSL environment.

Responsibilities include:

* Executing allowlisted system commands
* Interacting with the local Docker daemon using `bollard`
* Streaming telemetry and logs
* Performing Terraform operations securely

---

# ✨ Key Features

## 🔒 Secure Remote Execution

A fully interactive terminal directly in the browser.

Features:

* Allowlisted command execution
* API key middleware protection
* Live command output streaming

## 🐳 Docker Management

Manage Docker containers directly from the dashboard.

Capabilities:

* View running/stopped containers
* Start containers
* Stop containers
* Restart containers

## 🔄 CI/CD Pipeline Monitoring

Integrated GitHub Actions monitoring.

Includes:

* Workflow status tracking
* Commit and branch visibility
* Manual deployment triggers

## 🏗️ Infrastructure-as-Code Provisioning

Execute Terraform workflows remotely through the Rust agent.

Supported operations:

* `terraform init`
* `terraform apply`
* `terraform destroy`

All logs stream instantly to the UI.

## 📈 Deep Observability

Integrated monitoring stack powered by Prometheus and Grafana.

Features:

* `node-exporter` system metrics
* Prometheus metric scraping
* Embedded Grafana dashboards
* Real-time host monitoring

---

# 📂 Project Structure

```text
devops-control-center/
├── agent/                      # Rust Agent 🦀
│   ├── src/main.rs
│   ├── Cargo.toml
│   └── main.tf
│
├── orchestrator/               # Spring Boot Backend ☕
│   ├── src/main/java/.../
│   │   ├── AgentController.java
│   │   ├── AgentService.java
│   │   ├── GithubController.java
│   │   └── GithubService.java
│   └── pom.xml
│
├── frontend/                   # React Dashboard ⚛️
│   ├── src/App.jsx
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
│
├── docker-compose.yml
├── prometheus.yml
└── README.md
```

---

# 🛠️ Prerequisites

Ensure the following are installed locally:

* Node.js & npm
* Java 21 & Maven
* Rust & Cargo
* Docker Desktop
* Terraform CLI

---

# 🚀 Getting Started

To run the full platform locally, open **4 separate terminal windows**.

---

## 1️⃣ Start the Rust Agent

```bash
cd agent
cargo run
```

Runs on:

```text
http://localhost:3001
```

---

## 2️⃣ Start the Java Orchestrator

```bash
cd orchestrator
mvn spring-boot:run
```

Runs on:

```text
http://localhost:8080
```

---

## 3️⃣ Start the React Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on:

```text
http://localhost:5173
```

---

## 4️⃣ Start the Monitoring Stack

From the project root directory:

```bash
docker-compose up -d
```

Grafana runs on:

```text
http://localhost:3000
```

Default credentials:

```text
admin / admin
```

---

# 📊 Grafana Setup

Import Grafana Dashboard:

```text
1860
```

Then copy the generated panel embed links into `App.jsx` to display live infrastructure metrics directly in the dashboard.

---

# 🔮 Future Enhancements

* Role-Based Access Control (RBAC) via Spring Security
* Comprehensive audit logging
* Webhook-triggered deployments
* Kubernetes cluster integration
* Multi-agent support
* WebSocket-based terminal sessions
* JWT authentication & refresh tokens

---

# 🤝 Tech Stack

| Layer                | Technology                |
| -------------------- | ------------------------- |
| Frontend             | React, Vite, Tailwind CSS |
| Backend              | Spring Boot               |
| Agent                | Rust, Axum                |
| Container Management | Docker, Bollard           |
| Infrastructure       | Terraform                 |
| Monitoring           | Prometheus, Grafana       |
| Streaming            | SSE                       |
| Terminal             | xterm.js                  |

---

# 📜 License

This project is open-source and available under the MIT License.
