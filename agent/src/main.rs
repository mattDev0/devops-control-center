use axum::{routing::get, Json, Router};
use serde::Serialize;
use sysinfo::System;

// We use Serialize so Axum can automatically convert this struct into JSON
#[derive(Serialize)]
struct HealthResponse {
    status: String,
    os_name: String,
    os_version: String,
    uptime_seconds: u64,
}

async fn health_check() -> Json<HealthResponse> {
    // Initialize the system info gatherer
    let mut sys = System::new_all();
    // Refresh to get the absolute latest data
    sys.refresh_all();

    // Populate our response struct with real system data
    let response = HealthResponse {
        status: "healthy".to_string(),
        os_name: System::name().unwrap_or_else(|| "Unknown OS".to_string()),
        os_version: System::os_version().unwrap_or_else(|| "Unknown Version".to_string()),
        uptime_seconds: System::uptime(),
    };

    // Return the JSON response
    Json(response)
}

#[tokio::main]
async fn main() {
    println!("🚀 Starting DevOps Control Center Agent on port 3001...");
    println!("➡️  Listening for Orchestrator connections...");

    // Build our application with a single route
    let app = Router::new()
        .route("/ping", get(health_check));

    // Bind the server to all network interfaces on port 3001
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3001").await.unwrap();
    
    // Start serving
    axum::serve(listener, app).await.unwrap();
}