use axum::{extract::State, http::StatusCode, Json, response::IntoResponse};
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

pub async fn health(State(state): State<crate::AppState>) -> impl IntoResponse {
    let mut sys = System::new_all();
    sys.refresh_all();
    let os_name = System::name().unwrap_or_else(|| "Unknown".to_string());
    let os_version = System::os_version().unwrap_or_else(|| "Unknown".to_string());
    let uptime_seconds = System::uptime();

    // Running without a cluster is a supported configuration, not a fault, so
    // this reports 200 with k8s=false rather than 503. Callers use the flag to
    // decide whether cluster features are offered at all.
    let (k8s, k8s_error) = match &state.kube_client {
        Some(client) => match crate::k8s::client::verify(client).await {
            Ok(_) => (true, None),
            Err(e) => (false, Some(e)),
        },
        None => (
            false,
            Some("Kubernetes is not configured for this deployment".to_string()),
        ),
    };

    (
        StatusCode::OK,
        Json(json!({
            "status": if k8s { "healthy" } else { "degraded" },
            "k8s": k8s,
            "error": k8s_error,
            "os_name": os_name,
            "os_version": os_version,
            "uptime_seconds": uptime_seconds
        })),
    )
}
