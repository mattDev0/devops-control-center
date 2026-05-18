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
use bollard::{container::ListContainersOptions, Docker};
use futures::stream::Stream;
use serde::{Deserialize, Serialize};
use std::{convert::Infallible, net::SocketAddr, process::Command, time::Duration};
use sysinfo::System;
use tokio_stream::wrappers::IntervalStream;
use tokio_stream::StreamExt;

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

async fn execute_command(Json(payload): Json<ExecuteRequest>) -> Result<Json<ExecuteResponse>, StatusCode> {
    let allowed_commands = ["ls", "pwd", "whoami", "echo", "uptime", "date"];
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
        let msg = format!("[{}] INFO: Agent operational. CPU load normal.", timestamp);
        Ok(Event::default().data(msg))
    });
    Sse::new(stream).keep_alive(KeepAlive::new())
}

// NEW: Docker Handlers
async fn list_containers() -> Result<Json<Vec<ContainerDto>>, StatusCode> {
    let docker = Docker::connect_with_local_defaults().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let options = Some(ListContainersOptions::<String> {
        all: true,
        ..Default::default()
    });
    
    let containers = docker.list_containers(options).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut result = Vec::new();
    
    for c in containers {
        result.push(ContainerDto {
            id: c.id.unwrap_or_default().chars().take(12).collect(),
            name: c.names.unwrap_or_default().first().unwrap_or(&String::new()).replace("/", ""),
            image: c.image.unwrap_or_default(),
            state: c.state.unwrap_or_default(),
            status: c.status.unwrap_or_default(),
        });
    }
    Ok(Json(result))
}

async fn container_action(Path((id, action)): Path<(String, String)>) -> Result<StatusCode, StatusCode> {
    let docker = Docker::connect_with_local_defaults().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    match action.as_str() {
        "start" => docker.start_container::<String>(&id, None).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
        "stop" => docker.stop_container(&id, None).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
        "restart" => docker.restart_container(&id, None).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
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
        .route("/containers", get(list_containers)) // NEW
        .route("/containers/:id/:action", post(container_action)) // NEW
        .route_layer(middleware::from_fn(auth_middleware));

    let addr = SocketAddr::from(([0, 0, 0, 0], 3001));
    println!("🛡️ Secure Rust Agent running on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}