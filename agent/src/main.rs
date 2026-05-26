use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path,
    },
    http::{Request, StatusCode},
    middleware::{self, Next},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::{get, post},
    Json, Router,
};
use chrono;
use serde::{Deserialize, Serialize};
use std::{
    convert::Infallible,
    io::{Read, Write},
    net::SocketAddr,
    process::Command,
};
use sysinfo::System;
use futures::{SinkExt, StreamExt};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};

// Kubernetes imports
use k8s_openapi::api::apps::v1::Deployment;
use k8s_openapi::api::core::v1::Pod;
use kube::{
    api::{ListParams, Patch, PatchParams, LogParams},
    Api, Client,
};
use serde_json::json;

// --- Models ---
#[derive(Serialize)]
struct SystemInfo {
    os_name: String,
    os_version: String,
    uptime_seconds: u64,
}

#[derive(Deserialize)]
struct ExecuteRequest {
    command: String,
    args: Vec<String>,
}

#[derive(Serialize)]
struct ExecuteResponse {
    stdout: String,
    stderr: String,
    exit_code: i32,
}

#[derive(Serialize)]
struct DeploymentDto {
    id: String,
    name: String,
    image: String,
    state: String,
    status: String,
}

// --- Middleware ---
async fn auth_middleware(
    req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let secret_key = std::env::var("AGENT_SECRET_KEY")
        .unwrap_or_else(|_| "devops-secret-key-123".to_string());
    if let Some(auth_header) = req.headers().get("X-Agent-Key") {
        if let Ok(auth_str) = auth_header.to_str() {
            if auth_str == secret_key {
                return Ok(next.run(req).await);
            }
        }
    }
    println!("⚠️ Blocked unauthorized request!");
    Err(StatusCode::UNAUTHORIZED)
}

// --- Handlers ---
async fn ping() -> impl IntoResponse {
    let mut sys = System::new_all();
    sys.refresh_all();
    Json(SystemInfo {
        os_name: System::name().unwrap_or_else(|| "Unknown".to_string()),
        os_version: System::os_version().unwrap_or_else(|| "Unknown".to_string()),
        uptime_seconds: System::uptime(),
    })
}

async fn execute_command(
    Json(payload): Json<ExecuteRequest>,
) -> Result<Json<ExecuteResponse>, StatusCode> {
    let allowed_commands = ["ls", "pwd", "whoami", "echo", "uptime", "date", "terraform"];
    if !allowed_commands.contains(&payload.command.as_str()) {
        return Err(StatusCode::FORBIDDEN);
    }

    let output = Command::new(&payload.command)
        .args(&payload.args)
        .output()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(ExecuteResponse {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    }))
}

#[derive(Deserialize)]
struct LogParamsQuery {
    id: Option<String>,
}

async fn find_pods_for_deployment(
    client: Client,
    namespace: &str,
    dep_name: &str,
) -> Result<Vec<String>, kube::Error> {
    let pods_api: Api<Pod> = Api::namespaced(client, namespace);
    
    // Attempt 1: app=dep_name
    let lp = ListParams {
        label_selector: Some(format!("app={}", dep_name)),
        ..Default::default()
    };
    let pod_list = pods_api.list(&lp).await?;
    let mut pod_names: Vec<String> = pod_list.items.into_iter().filter_map(|p| p.metadata.name).collect();
    
    if pod_names.is_empty() {
        // Attempt 2: app.kubernetes.io/name=dep_name
        let lp = ListParams {
            label_selector: Some(format!("app.kubernetes.io/name={}", dep_name)),
            ..Default::default()
        };
        let pod_list = pods_api.list(&lp).await?;
        pod_names = pod_list.items.into_iter().filter_map(|p| p.metadata.name).collect();
    }
    
    if pod_names.is_empty() {
        // Attempt 3: match prefix dep_name-
        let pod_list = pods_api.list(&ListParams::default()).await?;
        pod_names = pod_list.items.into_iter()
            .filter_map(|p| p.metadata.name)
            .filter(|name| name.starts_with(&format!("{}-", dep_name)))
            .collect();
    }
    
    Ok(pod_names)
}

async fn stream_logs(
    axum::extract::Query(query): axum::extract::Query<LogParamsQuery>,
) -> impl IntoResponse {
    let client = match Client::try_default().await {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to initialize K8s client for logs: {:?}", e);
            return Sse::new(futures::stream::once(async {
                Ok::<Event, Infallible>(Event::default().data("Error: Failed to initialize Kubernetes client"))
            })).keep_alive(KeepAlive::new()).into_response();
        }
    };

    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Event, Infallible>>(1000);

    if let Some(id) = query.id {
        // Stream logs for a specific deployment
        let parts: Vec<&str> = id.split(':').collect();
        if parts.len() != 2 {
            let _ = tx.try_send(Ok(Event::default().data("Error: Invalid container ID format")));
            return Sse::new(tokio_stream::wrappers::ReceiverStream::new(rx)).keep_alive(KeepAlive::new()).into_response();
        }
        let namespace = parts[0].to_string();
        let dep_name = parts[1].to_string();

        let tx_clone = tx.clone();
        tokio::spawn(async move {
            match find_pods_for_deployment(client.clone(), &namespace, &dep_name).await {
                Ok(pods) => {
                    if pods.is_empty() {
                        let _ = tx_clone.send(Ok(Event::default().data(format!("No active pods found for deployment: {}", dep_name)))).await;
                        return;
                    }
                    
                    let mut tasks = vec![];
                    for pod_name in pods {
                        let pods_api: Api<Pod> = Api::namespaced(client.clone(), &namespace);
                        let tx_pod = tx_clone.clone();
                        let task = tokio::spawn(async move {
                            let lp = LogParams {
                                follow: true,
                                tail_lines: Some(100),
                                ..LogParams::default()
                            };
                            if let Ok(stream) = pods_api.log_stream(&pod_name, &lp).await {
                                use futures::AsyncBufReadExt;
                                let mut lines = stream.lines();
                                while let Some(Ok(line)) = lines.next().await {
                                    let msg = format!("[{}] {}", pod_name, line);
                                    if tx_pod.send(Ok(Event::default().data(msg))).await.is_err() {
                                        break;
                                    }
                                }
                            } else {
                                let _ = tx_pod.send(Ok(Event::default().data(format!("Failed to stream logs from pod: {}", pod_name)))).await;
                            }
                        });
                        tasks.push(task);
                    }
                    for t in tasks {
                        let _ = t.await;
                    }
                }
                Err(e) => {
                    let _ = tx_clone.send(Ok(Event::default().data(format!("Error listing pods: {:?}", e)))).await;
                }
            }
        });
    } else {
        // Global live logs: stream from all running pods in devops and portfolio namespaces
        let tx_clone = tx.clone();
        tokio::spawn(async move {
            let namespaces = vec!["portfolio", "devops"];
            let mut tasks = vec![];
            for ns in namespaces {
                let pods_api: Api<Pod> = Api::namespaced(client.clone(), ns);
                match pods_api.list(&ListParams::default()).await {
                    Ok(pod_list) => {
                        for p in pod_list.items {
                            if let Some(pod_name) = p.metadata.name {
                                // Only stream from running pods
                                let is_running = p.status.as_ref()
                                    .and_then(|s| s.phase.as_ref())
                                    .map(|phase| phase == "Running")
                                    .unwrap_or(false);
                                if !is_running {
                                    continue;
                                }

                                let pods_api_clone = pods_api.clone();
                                let tx_pod = tx_clone.clone();
                                let ns_str = ns.to_string();
                                let task = tokio::spawn(async move {
                                    let lp = LogParams {
                                        follow: true,
                                        tail_lines: Some(10), // only tail a few lines for global logs to prevent flood
                                        ..LogParams::default()
                                    };
                                    match pods_api_clone.log_stream(&pod_name, &lp).await {
                                        Ok(stream) => {
                                            use futures::AsyncBufReadExt;
                                            let mut lines = stream.lines();
                                            while let Some(Ok(line)) = lines.next().await {
                                                let msg = format!("{}/[{}] {}", ns_str, pod_name, line);
                                                if tx_pod.send(Ok(Event::default().data(msg))).await.is_err() {
                                                    break;
                                                }
                                            }
                                        }
                                        Err(e) => {
                                            eprintln!("Error streaming logs for pod {}: {:?}", pod_name, e);
                                            let _ = tx_pod.send(Ok(Event::default().data(format!("Error streaming logs for pod {}: {:?}", pod_name, e)))).await;
                                        }
                                    }
                                });
                                tasks.push(task);
                            }
                        }
                    }
                    Err(e) => {
                        let _ = tx_clone.send(Ok(Event::default().data(format!("Error listing pods in {}: {:?}", ns, e)))).await;
                    }
                }
            }
            if tasks.is_empty() {
                let _ = tx_clone.send(Ok(Event::default().data("No running pods found in portfolio or devops namespaces"))).await;
                return;
            }
            for t in tasks {
                let _ = t.await;
            }
        });
    }

    let stream = tokio_stream::wrappers::ReceiverStream::new(rx);
    Sse::new(stream).keep_alive(KeepAlive::new()).into_response()
}

// Adapted: List Deployments in portfolio & devops namespaces
async fn list_deployments() -> Result<Json<Vec<DeploymentDto>>, StatusCode> {
    let client = Client::try_default()
        .await
        .map_err(|e| {
            eprintln!("Failed to initialize K8s client: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
        
    let namespaces = vec!["portfolio", "devops"];
    let mut result = Vec::new();

    for ns in namespaces {
        let api: Api<Deployment> = Api::namespaced(client.clone(), ns);
        let deps = api
            .list(&ListParams::default())
            .await
            .map_err(|e| {
                eprintln!("Failed to list deployments in namespace {}: {:?}", ns, e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

        for d in deps {
            let name = d.metadata.name.clone().unwrap_or_default();
            let id = format!("{}:{}", ns, name);

            // Get image of the first container in the template spec
            let image = d
                .spec
                .as_ref()
                .and_then(|spec| spec.template.spec.as_ref())
                .and_then(|pod_spec| pod_spec.containers.first())
                .and_then(|c| c.image.clone())
                .unwrap_or_else(|| "Unknown".to_string());

            // Get replica status
            let replicas = d.spec.as_ref().and_then(|s| s.replicas).unwrap_or(0);
            let ready_replicas = d.status.as_ref().and_then(|s| s.ready_replicas).unwrap_or(0);
            let status = format!("Ready: {}/{}", ready_replicas, replicas);

            // Determine State
            let state = if replicas == 0 {
                "stopped".to_string()
            } else if ready_replicas == replicas {
                "running".to_string()
            } else {
                "pending".to_string()
            };

            result.push(DeploymentDto {
                id,
                name,
                image,
                state,
                status,
            });
        }
    }
    Ok(Json(result))
}

// Adapted: Scale Deployments or trigger a rolling restart
async fn deployment_action(
    Path((id, action)): Path<(String, String)>,
) -> Result<StatusCode, StatusCode> {
    let client = Client::try_default()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Parse the id: namespace:deployment_name
    let parts: Vec<&str> = id.split(':').collect();
    if parts.len() != 2 {
        return Err(StatusCode::BAD_REQUEST);
    }
    let namespace = parts[0];
    let dep_name = parts[1];

    let api: Api<Deployment> = Api::namespaced(client, namespace);

    match action.as_str() {
        "start" => {
            let patch = json!({
                "spec": {
                    "replicas": 1
                }
            });
            api.patch(
                dep_name,
                &PatchParams::default(),
                &Patch::Merge(&patch),
            )
            .await
            .map_err(|e| {
                eprintln!("Failed to patch deployment start: {:?}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
        }
        "stop" => {
            let patch = json!({
                "spec": {
                    "replicas": 0
                }
            });
            api.patch(
                dep_name,
                &PatchParams::default(),
                &Patch::Merge(&patch),
            )
            .await
            .map_err(|e| {
                eprintln!("Failed to patch deployment stop: {:?}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
        }
        "restart" => {
            let now = chrono::Utc::now().to_rfc3339();
            let patch = json!({
                "spec": {
                    "template": {
                        "metadata": {
                            "annotations": {
                                "kubectl.kubernetes.io/restartedAt": now
                            }
                        }
                    }
                }
            });
            api.patch(
                dep_name,
                &PatchParams::default(),
                &Patch::Merge(&patch),
            )
            .await
            .map_err(|e| {
                eprintln!("Failed to patch deployment restart: {:?}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
        }
        _ => return Err(StatusCode::BAD_REQUEST),
    };

    Ok(StatusCode::OK)
}

async fn ws_terminal_handler(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(handle_socket)
}

async fn handle_socket(socket: WebSocket) {
    let pty_system = native_pty_system();
    let pair_res = pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    });

    let pair = match pair_res {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Failed to open PTY: {:?}", e);
            return;
        }
    };

    let shell = if std::path::Path::new("/bin/bash").exists() {
        "/bin/bash"
    } else {
        "/bin/sh"
    };

    let mut cmd = CommandBuilder::new(shell);
    // Set some common env vars for PTY rendering
    cmd.env("TERM", "xterm-256color");
    
    let child_res = pair.slave.spawn_command(cmd);
    let _child = match child_res {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to spawn shell in PTY: {:?}", e);
            return;
        }
    };

    let mut pty_reader = match pair.master.try_clone_reader() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Failed to clone PTY reader: {:?}", e);
            return;
        }
    };

    let mut pty_writer = match pair.master.take_writer() {
        Ok(w) => w,
        Err(e) => {
            eprintln!("Failed to get PTY writer: {:?}", e);
            return;
        }
    };

    let (tx, mut rx) = tokio::sync::mpsc::channel::<Vec<u8>>(1024);

    // Read PTY stdout/stderr in a blocking thread, send to tx channel
    tokio::task::spawn_blocking(move || {
        let mut buffer = [0u8; 4096];
        loop {
            match pty_reader.read(&mut buffer) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    if tx.blocking_send(buffer[..n].to_vec()).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Read from tx channel (rx) and send to WebSocket
    let mut send_task = tokio::spawn(async move {
        while let Some(bytes) = rx.recv().await {
            if let Ok(text) = String::from_utf8(bytes) {
                if ws_sender.send(Message::Text(text)).await.is_err() {
                    break;
                }
            }
        }
    });

    // Read from WebSocket and write to PTY stdin or handle resize
    let master_pty = pair.master;
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_receiver.next().await {
            match msg {
                Message::Text(text) => {
                    if text.starts_with("{\"event\":") {
                        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                            if value["event"] == "resize" {
                                if let (Some(cols), Some(rows)) = (value["cols"].as_u64(), value["rows"].as_u64()) {
                                    let _ = master_pty.resize(PtySize {
                                        rows: rows as u16,
                                        cols: cols as u16,
                                        pixel_width: 0,
                                        pixel_height: 0,
                                    });
                                }
                            }
                        }
                    } else {
                        let _ = pty_writer.write_all(text.as_bytes());
                        let _ = pty_writer.flush();
                    }
                }
                Message::Binary(bin) => {
                    let _ = pty_writer.write_all(&bin);
                    let _ = pty_writer.flush();
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    // Terminate tasks once either side closes
    tokio::select! {
        _ = &mut send_task => {
            recv_task.abort();
        }
        _ = &mut recv_task => {
            send_task.abort();
        }
    }
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/ping", get(ping))
        .route("/execute", post(execute_command))
        .route("/logs", get(stream_logs))
        .route("/deployments", get(list_deployments))
        .route("/deployments/:id/:action", post(deployment_action))
        .route("/ws/terminal", get(ws_terminal_handler))
        .route_layer(middleware::from_fn(auth_middleware));

    let addr = SocketAddr::from(([0, 0, 0, 0], 3001));
    println!("🛡️ Secure K8s-Native Rust Agent running on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}