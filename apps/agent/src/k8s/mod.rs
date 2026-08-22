pub mod client;
pub mod deployments;
pub mod logs;
pub mod monitor;
pub mod pod_health;

pub use deployments::{deployment_action, list_deployments};
pub use logs::stream_logs;
pub use monitor::start_deployment_monitor;
pub use pod_health::pod_health;

use crate::AppState;
use axum::http::StatusCode;

/// Cluster-backed handlers call this so an absent cluster surfaces as an
/// explicit 503 rather than a 500 that reads like a bug.
pub fn require_cluster(state: &AppState) -> Result<kube::Client, StatusCode> {
    state
        .kube_client
        .clone()
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)
}
