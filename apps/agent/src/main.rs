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
mod docker;

#[derive(Clone)]
pub struct AppState {
    secret_key: String,
    /// `None` when the agent runs without a cluster (the Docker Compose
    /// deployment). Cluster-backed routes return 503 in that case.
    kube_client: Option<kube::Client>,
}

// --- Middleware ---
async fn auth_middleware(
    State(state): State<AppState>,
    req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    use subtle::ConstantTimeEq;

    if let Some(auth_header) = req.headers().get("X-Agent-Key") {
        if let Ok(auth_str) = auth_header.to_str() {
            if auth_str.as_bytes().ct_eq(state.secret_key.as_bytes()).into() {
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

    let kube_client = k8s::client::try_connect().await;

    match kube_client.clone() {
        Some(client) => k8s::start_deployment_monitor(client),
        None => tracing::info!("Deployment monitor not started: no Kubernetes cluster available."),
    }

    let state = AppState {
        secret_key: std::env::var("AGENT_SECRET_KEY")
            .expect("AGENT_SECRET_KEY environment variable must be set"),
        kube_client,
    };

    let app = Router::new()
        .route("/ping", get(system::ping))
        .route("/logs", get(k8s::stream_logs))
        .route("/deployments", get(k8s::list_deployments))
        .route("/deployments/:id/:action", post(k8s::deployment_action))
        .route("/pods/health", get(k8s::pod_health))
        .route("/docker/containers", get(docker::list_containers))
        .route("/docker/containers/:id/stats", get(docker::container_stats))
        .route("/docker/containers/:id/logs", get(docker::container_logs))
        .route("/docker/containers/:id/:action", post(docker::container_action))
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

    fn dummy_client() -> kube::Client {
        let config = kube::Config::new("https://127.0.0.1:8080".parse().unwrap());
        kube::Client::try_from(config).unwrap()
    }

    #[tokio::test]
    async fn test_auth_middleware_authorized() {
        let state = AppState {
            secret_key: "secret-123".to_string(),
            kube_client: Some(dummy_client()),
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
            kube_client: Some(dummy_client()),
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

    // Without a cluster these routes must say so explicitly. A 500 here would
    // read as a bug in the agent rather than an absent dependency.
    #[tokio::test]
    async fn test_cluster_routes_report_unavailable_without_kubernetes() {
        let state = AppState {
            secret_key: "secret-123".to_string(),
            kube_client: None,
        };
        let app = Router::new()
            .route("/deployments", get(k8s::list_deployments))
            .route("/pods/health", get(k8s::pod_health))
            .with_state(state);

        for path in ["/deployments", "/pods/health"] {
            let req = Request::builder().uri(path).body(Body::empty()).unwrap();
            let response = app.clone().oneshot(req).await.unwrap();
            assert_eq!(
                response.status(),
                StatusCode::SERVICE_UNAVAILABLE,
                "{path} should report 503 when no cluster is configured"
            );
        }
    }

    // The agent is healthy without a cluster - Docker and system features work
    // - so /health must stay 200 and simply report k8s=false.
    #[tokio::test]
    async fn test_health_is_ok_and_honest_without_kubernetes() {
        let state = AppState {
            secret_key: "secret-123".to_string(),
            kube_client: None,
        };
        let app = Router::new()
            .route("/health", get(system::health))
            .with_state(state);

        let req = Request::builder().uri("/health").body(Body::empty()).unwrap();
        let response = app.oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["k8s"], serde_json::Value::Bool(false));
        assert_eq!(json["status"], "degraded");
    }
}
