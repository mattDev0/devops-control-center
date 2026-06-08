use axum::{
    http::{Request, StatusCode},
    middleware::{self, Next},
    response::Response,
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;

mod models;
mod kubernetes;
mod pty_handler;
mod system;

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

#[tokio::main]
async fn main() {
    kubernetes::start_deployment_monitor();

    let app = Router::new()
        .route("/ping", get(system::ping))
        .route("/execute", post(system::execute_command))
        .route("/logs", get(kubernetes::stream_logs))
        .route("/deployments", get(kubernetes::list_deployments))
        .route("/deployments/:id/:action", post(kubernetes::deployment_action))
        .route("/ws/terminal", get(pty_handler::ws_terminal_handler))
        .route_layer(middleware::from_fn(auth_middleware));

    let addr = SocketAddr::from(([0, 0, 0, 0], 3001));
    println!("🛡️ Secure K8s-Native Rust Agent running on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}