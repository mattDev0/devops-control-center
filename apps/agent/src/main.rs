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
mod k8s;
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
    tracing::warn!("⚠️ Blocked unauthorized request!");
    Err(StatusCode::UNAUTHORIZED)
}

#[tokio::main]
async fn main() {
    // Initialize tracing subscriber
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    k8s::start_deployment_monitor();

    let state = AppState {
        secret_key: std::env::var("AGENT_SECRET_KEY")
            .unwrap_or_else(|_| "devops-secret-key-123".to_string()),
    };

    let app = Router::new()
        .route("/ping", get(system::ping))
        .route("/logs", get(k8s::stream_logs))
        .route("/deployments", get(k8s::list_deployments))
        .route("/deployments/:id/:action", post(k8s::deployment_action))
        .route("/pods/health", get(k8s::pod_health))
        .route_layer(middleware::from_fn_with_state(state.clone(), auth_middleware))
        .route("/health", get(system::health))
        .route("/livez", get(system::liveness))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3001));
    tracing::info!("🛡️ Secure K8s-Native Rust Agent running on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
        routing::get,
        Router,
    };
    use tower::ServiceExt;

    #[tokio::test]
    async fn test_auth_middleware_authorized() {
        let state = AppState {
            secret_key: "secret-123".to_string(),
        };
        let app = Router::new()
            .route("/test", get(|| async { "ok" }))
            .route_layer(middleware::from_fn_with_state(state.clone(), auth_middleware))
            .with_state(state);

        let req = Request::builder()
            .uri("/test")
            .header("X-Agent-Key", "secret-123")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_auth_middleware_unauthorized() {
        let state = AppState {
            secret_key: "secret-123".to_string(),
        };
        let app = Router::new()
            .route("/test", get(|| async { "ok" }))
            .route_layer(middleware::from_fn_with_state(state.clone(), auth_middleware))
            .with_state(state);

        let req = Request::builder()
            .uri("/test")
            .header("X-Agent-Key", "wrong-key")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
}