use axum::{
    extract::Path,
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
use futures::stream::Stream;
use serde::{Deserialize, Serialize};
use std::{convert::Infallible, net::SocketAddr, process::Command, time::Duration};
use sysinfo::System;
use tokio_stream::wrappers::IntervalStream;
use tokio_stream::StreamExt;

// Kubernetes imports
use k8s_openapi::api::apps::v1::Deployment;
use kube::{
    api::{ListParams, Patch, PatchParams},
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
struct ContainerDto {
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
    let secret_key = "devops-secret-key-123";
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

async fn stream_logs() -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let interval = tokio::time::interval(Duration::from_secs(2));
    let stream = IntervalStream::new(interval).map(|_| {
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
        let msg = format!(
            "[{}] INFO: Agent operational. K8s controller active.",
            timestamp
        );
        Ok(Event::default().data(msg))
    });
    Sse::new(stream).keep_alive(KeepAlive::new())
}

// Adapted: List Deployments in portfolio & devops namespaces as "Containers"
async fn list_containers() -> Result<Json<Vec<ContainerDto>>, StatusCode> {
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

            result.push(ContainerDto {
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
async fn container_action(
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

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/ping", get(ping))
        .route("/execute", post(execute_command))
        .route("/logs", get(stream_logs))
        .route("/containers", get(list_containers))
        .route("/containers/:id/:action", post(container_action))
        .route_layer(middleware::from_fn(auth_middleware));

    let addr = SocketAddr::from(([0, 0, 0, 0], 3001));
    println!("🛡️ Secure K8s-Native Rust Agent running on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}