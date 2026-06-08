use axum::{
    extract::State,
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

#[derive(Clone)]
struct AppState {
    secret_key: String,
}

// --- Middleware ---
async fn auth_middleware(
    State(state): State<AppState>,
    req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    if let Some(auth_header) = req.headers().get("X-Agent-Key") {
        if let Ok(auth_str) = auth_header.to_str() {
            if auth_str == state.secret_key {
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

    let state = AppState {
        secret_key: std::env::var("AGENT_SECRET_KEY")
            .unwrap_or_else(|_| "devops-secret-key-123".to_string()),
    };

    let app = Router::new()
        .route("/ping", get(system::ping))
        .route("/execute", post(system::execute_command))
        .route("/logs", get(kubernetes::stream_logs))
        .route("/deployments", get(kubernetes::list_deployments))
        .route("/deployments/:id/:action", post(kubernetes::deployment_action))
        .route("/ws/terminal", get(pty_handler::ws_terminal_handler))
        .route_layer(middleware::from_fn_with_state(state.clone(), auth_middleware))
        .route("/health", get(system::health))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3001));
    println!("🛡️ Secure K8s-Native Rust Agent running on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}