use axum::{
    http::{Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde::Serialize;
use std::net::SocketAddr;
use sysinfo::System;

// Our payload structure
#[derive(Serialize)]
struct SystemInfo {
    os_name: String,
    os_version: String,
    uptime_seconds: u64,
}

// --------------------------------------------------------
// SECURITY MIDDLEWARE
// --------------------------------------------------------
async fn auth_middleware(
    req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    // 1. Hardcode our secret for now (we'll use env vars later)
    let secret_key = "devops-secret-key-123";

    // 2. Check if the "X-Agent-Key" header exists in the request
    if let Some(auth_header) = req.headers().get("X-Agent-Key") {
        // 3. Convert the header value to a string and compare it to our secret
        if let Ok(auth_str) = auth_header.to_str() {
            if auth_str == secret_key {
                // The key matches! Let the request continue to the handler
                return Ok(next.run(req).await);
            }
        }
    }

    // If the header is missing or the key is wrong, reject immediately
    println!("⚠️ Blocked unauthorized request!");
    Err(StatusCode::UNAUTHORIZED)
}

// --------------------------------------------------------
// ROUTE HANDLERS
// --------------------------------------------------------
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

// --------------------------------------------------------
// MAIN APPLICATION
// --------------------------------------------------------
#[tokio::main]
async fn main() {
    // Build our application with a route and apply our security middleware
    let app = Router::new()
        .route("/ping", get(ping))
        // The middleware wraps all routes added BEFORE it
        .route_layer(middleware::from_fn(auth_middleware));

    let addr = SocketAddr::from(([0, 0, 0, 0], 3001));
    println!("🛡️ Secure Rust Agent running on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}