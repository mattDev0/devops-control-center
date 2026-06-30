use axum::{http::StatusCode, Json, response::IntoResponse};
use sysinfo::System;
use crate::models::SystemInfo;
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

pub async fn liveness() -> impl IntoResponse {
    let mut sys = System::new_all();
    sys.refresh_all();
    let os_name = System::name().unwrap_or_else(|| "Unknown".to_string());
    let os_version = System::os_version().unwrap_or_else(|| "Unknown".to_string());
    let uptime_seconds = System::uptime();

    (
        StatusCode::OK,
        Json(json!({
            "status": "alive",
            "os_name": os_name,
            "os_version": os_version,
            "uptime_seconds": uptime_seconds
        })),
    )
}

pub async fn health() -> impl IntoResponse {
    let mut sys = System::new_all();
    sys.refresh_all();
    let os_name = System::name().unwrap_or_else(|| "Unknown".to_string());
    let os_version = System::os_version().unwrap_or_else(|| "Unknown".to_string());
    let uptime_seconds = System::uptime();

    match kube::Client::try_default().await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({
                "status": "healthy",
                "k8s": true,
                "os_name": os_name,
                "os_version": os_version,
                "uptime_seconds": uptime_seconds
            })),
        ),
        Err(e) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "status": "degraded",
                "k8s": false,
                "error": e.to_string(),
                "os_name": os_name,
                "os_version": os_version,
                "uptime_seconds": uptime_seconds
            })),
        ),
    }
}

