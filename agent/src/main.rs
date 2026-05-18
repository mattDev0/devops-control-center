use axum::{
    http::{Request, StatusCode},
    middleware::{self, Next},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::{get, post},
    Json, Router,
};
use futures::stream::Stream;
use serde::{Deserialize, Serialize};
use std::{convert::Infallible, net::SocketAddr, process::Command, time::Duration};
use sysinfo::System;
use tokio_stream::wrappers::IntervalStream;
use tokio_stream::StreamExt;

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

async fn ping() -> impl IntoResponse {
    let mut sys = System::new_all();
    sys.refresh_all();

    let info = SystemInfo {
        os_name: System::name().unwrap_or_else(|| "Unknown".to_string()),
        os_version: System::os_version().unwrap_or_else(|| "Unknown".to_string()),
        uptime_seconds: System::uptime(),
    };

    Json(info)
}

async fn execute_command(
    Json(payload): Json<ExecuteRequest>,
) -> Result<Json<ExecuteResponse>, StatusCode> {
    let allowed_commands = ["ls", "pwd", "whoami", "echo", "uptime", "date"];
    
    if !allowed_commands.contains(&payload.command.as_str()) {
        println!("⚠️ Blocked forbidden command: {}", payload.command);
        return Err(StatusCode::FORBIDDEN);
    }

    println!("⚙️ Executing: {} {:?}", payload.command, payload.args);

    let output = Command::new(&payload.command)
        .args(&payload.args)
        .output()
        .map_err(|e| {
            println!("Failed to execute process: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(ExecuteResponse {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    }))
}

// NEW: Server-Sent Events (SSE) Log Stream
async fn stream_logs() -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    println!("📡 Client connected to log stream");
    
    // Create an interval that ticks every 2 seconds
    let interval = tokio::time::interval(Duration::from_secs(2));
    
    // Map the ticks to simulated log events
    let stream = IntervalStream::new(interval).map(|_| {
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
        let msg = format!("[{}] INFO: Agent operational. CPU load normal.", timestamp);
        Ok(Event::default().data(msg))
    });

    Sse::new(stream).keep_alive(KeepAlive::new())
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/ping", get(ping))
        .route("/execute", post(execute_command))
        .route("/logs", get(stream_logs)) // Added the logs route
        .route_layer(middleware::from_fn(auth_middleware));

    let addr = SocketAddr::from(([0, 0, 0, 0], 3001));
    println!("🛡️ Secure Rust Agent running on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}