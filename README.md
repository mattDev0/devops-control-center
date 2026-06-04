# 🚀 DevOps Control Center

A custom, end-to-end DevOps orchestration and observability platform built from scratch. This project unifies server monitoring, remote terminal execution, Kubernetes deployment management, and CI/CD pipeline tracking into a single, sleek React dashboard.

---

## 🌐 Live Preview
**Check out the live dashboard here:**  
👉 **[https://mattdev0.tech/devops/](https://mattdev0.tech/devops/)**

> ⚠️ **IMPORTANT WARNING FOR VISITORS** ⚠️
> 
> This is a live demonstration connected to real infrastructure. 
> **Please DO NOT stop, restart, or modify any running deployments or pods** via the dashboard unless you know what you are doing. Disrupting the deployments will bring down the services on the host server.

---

# 🏗️ Architecture

The platform is built on a modern, secure microservices architecture deployed via Kubernetes (K3s) inside the `devops` namespace:

```mermaid
graph TD
    Client[Client Browser] -->|HTTPS 443| Nginx[Host Nginx Reverse Proxy]
    
    subgraph "Azure Virtual Machine (Host)"
        Nginx -->|Proxy to Port 30085| K8sDevOpsFE[Service: devops-frontend NodePort]
        Nginx -->|Proxy to Port 30010| K8sGrafana[Service: devops-grafana NodePort]

        subgraph "Namespace: devops"
            K8sDevOpsFE --> DevOpsFE[devops-frontend Pod]
            DevOpsFE --> Orchestrator[devops-orchestrator Pod]
            Orchestrator --> Agent[devops-agent Pod]
            Agent -->|kube-rs API Calls| K8sAPI[K3s API Server]
            
            K8sGrafana --> Grafana[devops-grafana Pod]
            Grafana -->|Query Metrics| Prom[devops-prometheus Pod]
            Prom -->|Scrape Telemetry| NodeExp[node-exporter DaemonSet]
        end

        subgraph "Namespace: portfolio"
            Blackbox[blackbox-exporter Pod]
        end
    end

    Orchestrator -->|GitHub Actions API| GitHub[GitHub API]
    Prom -->|Scrapes ICMP Probes| Blackbox
    Blackbox -->|Pings ICMP| Internet[External Internet: Google / Cloudflare / Riot Games]

    classDef devops fill:#0f172a,stroke:#8b5cf6,stroke-width:2px,color:#f8fafc;
    class DevOpsFE,Orchestrator,Agent,Grafana,Prom,NodeExp devops;
```

## 1. Frontend — React + Vite + Tailwind CSS + Nginx
A responsive single-page dashboard featuring:
* **Interactive PTY Terminal:** Embedded `xterm.js` terminal connected to a backend WebSocket stream.
* **Role-Based UI Control:** Displays custom action controls based on the logged-in user's role (Admin vs. Guest).
* **Live SSE Log Viewer:** Seamlessly pulls logs via Server-Sent Events, complete with auto-scrolling and pod color headers in a premium glassmorphic modal.
* **Observability Dashboards:** Embedded real-time Grafana system metrics.
* **Robust Session Management:** Enforces automatic frontend logout if the authentication token expires or gets rejected with `401`/`403`.

## 2. Orchestrator — Java Spring Boot
The central gateway and security dispatcher responsible for:
* **Authentication Provider:** Issues signed JWT tokens for authenticating login requests (`/api/auth/login`) and guest access.
* **Spring Security & RBAC:** Enforces strict path authorization (e.g. restricting deployment scaling, CI/CD dispatch, and terminal execution to `ROLE_ADMIN`).
* **WebSocket Bidirectional Proxy:** Validates JWT authorization during handshakes and forwards raw terminal traffic directly to the Rust agent.
* **Async Log Proxying:** Handles long-running SSE log queries with Spring Security async dispatches configured to prevent context-clearance.
* **GitHub API Client:** Connects to GitHub Actions to list and trigger repository workflows.

## 3. Agent — Rust + Axum + kube-rs
A lightweight, high-performance system agent running as a Kubernetes pod.
Responsibilities include:
* **PTY Bridge (WebSockets):** Spawns `/bin/bash` or `/bin/sh` shell sessions inside a pseudo-terminal (`portable-pty` crate) and streams stdout/stdin bidirectionally over WebSockets. Handles JSON-based terminal resize payloads.
* **Merged Kubernetes Logs:** Streams logs from pods in `portfolio` and `devops` namespaces using the `kube-rs` API. Concurrently merges and logs multi-pod deployments using async `tokio::sync::mpsc::channel` streams.
* **Deployment Orchestrator:** Interacts directly with the local K3s API server via `kube-rs` to fetch deployment lists, scale replica sizes (start/stop), or patch timestamps to trigger zero-downtime rolling updates (restart).

## 4. Observability Stack — Prometheus & Grafana
* **Node Exporter:** Gathers host telemetry as a DaemonSet inside the cluster.
* **Prometheus:** Pulls metrics from the exporter, Java Spring Boot actuator endpoints, and external network pings (via Blackbox Exporter in the `portfolio` namespace). Backed by a PersistentVolumeClaim (PVC) for persistent metrics data retention.
* **Grafana:** Displays visual CPU and Memory dashboard panels embedded as iframes in the UI (configured with persistent volumes for metrics retention).

---

# ✨ Key Features

### 🔒 Secure JWT Authentication & RBAC
Enforces role-based permissions to protect platform modifications:
* **User Authentication:** Sign in using credentials or enter as a guest with one click.
* **Access Controls:** Read-only access for guests (monitoring only), with mutating actions (executing commands, scaling deployments, running pipelines) restricted strictly to `ROLE_ADMIN` users. Terminal stdin is explicitly disabled for guest users to prevent remote keystroke transmission.
* **Automatic Expiration Handling:** The frontend automatically cleans up cookies and forces user logouts upon receiving API authentication failures.

### 🐚 Real-Time Interactive PTY Terminal
A fully functional remote terminal directly in your web browser.
* **Pseudo-Terminal (PTY):** Runs a live shell bridge via the Rust agent, allowing you to run interactive commands (e.g. `top`, `nano`, CLI prompts) and capture standard signals (e.g. `Ctrl+C`).
* **Bidirectional WebSockets:** Sends keystrokes and streams terminal outputs in real-time, proxied securely through the Spring Boot orchestrator.
* **Dynamic Grid Resizing:** Automatically synchronizes local viewport width and height to resize the remote shell's dimension.

### 🪵 Real-Time Pod Log Streaming
Stream logs dynamically from Kubernetes deployments inside the cluster.
* **Kube-rs Integration:** Directly queries pod logs from Kubernetes namespaces, replacing dummy simulated logs with real-time system logs.
* **Multi-Pod Aggregation:** Automatically merges log streams from all running replicas within a deployment.
* **Glassmorphic Viewer:** Displays log streams in a styled window, color-coding and labeling lines by pod name with auto-scrolling features.

### ☸️ Kubernetes Deployment Management
Manage Kubernetes deployments directly from the dashboard.
* **Live Status List:** Checks replication readiness and runtime states across all namespaces.
* **Scaling Controls:** Spin up deployments (start) or scale them down to zero (stop).
* **Rolling Updates:** Trigger clean rolling restarts of your deployments with a single click.

### 🔄 CI/CD Pipeline Monitoring
Integrated GitHub Actions monitoring fetching real data.
* **Workflow Run Tracking:** View run logs, branches, and commit messages.
* **Manual Dispatch Triggers:** Trigger workflows manually from the dashboard.

### 📈 Deep Observability
Integrated monitoring stack powered by Prometheus and Grafana.
* **Live Resource Telemetry:** Displays CPU and Memory metrics of the Azure host.
* **Synthetic Network Monitoring:** Prometheus scrapes ICMP pings to Google DNS, Cloudflare DNS, and Riot Games NA via Blackbox Exporter to track network latency, packet loss, and connection availability.
* **Secure Embeds:** Serves dashboards via Nginx proxy subpaths to prevent cross-origin blockages.

---

# 🛠️ Configuration & Deployment

This project uses a flexible runtime configuration strategy allowing it to run easily both locally and in production.

## Local Development
Clone the repo and run:
```bash
docker compose up --build
```
It will automatically default to `localhost` configurations, bypassing secure cookie requirements for easy development.
* Dashboard: `http://localhost:8085`

## Production Deployment
To deploy to a live server, create a `.env` file on the VM from the provided example:
```bash
cp .env.example .env
nano .env
```
Provide your GitHub token and public domain. The deployment steps on the VM will convert this `.env` file into a Kubernetes Secret (`devops-secrets`) automatically.

```mermaid
sequenceDiagram
    actor Developer
    participant GitHub as GitHub Repository (devops-control-center)
    participant Runner as GitHub Actions Runner
    participant GHCR as GitHub Container Registry (ghcr.io)
    participant VM as Azure VM Host
    participant K3s as K3s Cluster

    Developer->>GitHub: git push origin main
    GitHub->>Runner: Trigger Production Deployment Workflow
    Runner->>Runner: Build Docker images using Buildx & GHA Cache
    Runner->>GHCR: Push built images: devops-agent, devops-orchestrator, devops-frontend
    Runner->>VM: SSH Connection (using AZURE_SSH_KEY)
    Note over VM: Pulls latest commits<br/>git reset --hard origin/main
    VM->>K3s: Apply environment Secrets (devops-secrets)
    VM->>K3s: Apply manifests in k8s/ folder (pulls from GHCR)
    VM->>K3s: Trigger zero-downtime rolling update (rollout restart)
    K3s-->>VM: Pull new images & Rollout Complete
    VM-->>Runner: Pipeline Complete
    Runner-->>GitHub: Update Status to Green
```

The automated GitHub Action runs:
1. Builds the Docker images on the GitHub Actions runner using Docker Buildx and GHA caching.
2. Pushes the built images to GitHub Container Registry (GHCR) at `ghcr.io/mattdev0/devops-control-center/...`.
3. Connects to the Azure VM via SSH.
4. Pulls the latest code changes (specifically updating the Kubernetes manifests).
5. Generates/applies the Kubernetes Secret from the local `.env` file on the VM.
6. Applies the Kubernetes manifests in the `k8s/` folder, instructing K3s to pull the pre-built images from GHCR.
7. Restarts the pods to load the updated images.

---

# 📂 Project Structure

```text
devops-control-center/
├── agent/                      # Rust Agent 🦀
│   ├── src/main.rs
│   ├── Dockerfile
│   └── Cargo.toml
├── orchestrator/               # Spring Boot Backend ☕
│   ├── src/main/java/.../
│   ├── Dockerfile
│   └── pom.xml
├── frontend/                   # React Dashboard ⚛️
│   ├── src/App.jsx
│   ├── Dockerfile
│   ├── nginx.conf              # Subpath proxy configuration
│   └── vite.config.js
├── k8s/                        # Kubernetes Manifests ☸️
│   ├── namespace.yaml
│   ├── agent.yaml
│   ├── orchestrator.yaml
│   ├── frontend.yaml
│   ├── prometheus.yaml
│   ├── grafana.yaml
│   └── node-exporter.yaml
├── grafana/                    # Local Provisioning & Dashboards 📊
├── docker-compose.yml          # Local stack orchestration
├── .env.example                # Production environment template
└── prometheus.yml
```

---

# 🤝 Tech Stack

| Layer                | Technology / Key Libraries |
| -------------------- | -------------------------- |
| **Frontend**         | React, Vite, Tailwind CSS, `xterm.js`, `lucide-react` |
| **Backend**          | Java Spring Boot, Spring Security, JWT (io.jsonwebtoken), WebSockets |
| **Agent**            | Rust, Axum, `kube-rs`, `tokio`, `portable-pty` |
| **Orchestration**    | Kubernetes (K3s), Docker Compose (Local Dev) |
| **Web Server / Proxy**| Nginx (with WebSocket & SSE upgrades) |
| **Observability**    | Prometheus, Grafana, Node Exporter, Blackbox Exporter |

---

# 📜 License

This project is open-source and available under the MIT License.