use axum::{http::StatusCode, Json, response::IntoResponse};
use std::process::Command;
use sysinfo::System;
use crate::models::{SystemInfo, ExecuteRequest, ExecuteResponse};
use serde_json::json;

pub async fn ping() -> impl IntoResponse {
    let mut sys = System::new_all();
    sys.refresh_all();
    Json(SystemInfo {
        os_name: System::name().unwrap_or_else(|| "Unknown".to_string()),
        os_version: System::os_version().unwrap_or_else(|| "Unknown".to_string()),
        uptime_seconds: System::uptime(),
    })
}

pub async fn health() -> impl IntoResponse {
    match kube::Client::try_default().await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({
                "status": "healthy",
                "k8s": true
            })),
        ),
        Err(e) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "status": "degraded",
                "k8s": false,
                "error": e.to_string()
            })),
        ),
    }
}

pub async fn execute_command(
    Json(payload): Json<ExecuteRequest>,
) -> Result<Json<ExecuteResponse>, StatusCode> {
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
