use axum::{http::StatusCode, Json};
use k8s_openapi::api::core::v1::Pod;
use kube::{api::ListParams, Api};
use crate::models::PodHealthSummary;
use super::client::get_k8s_client;

pub async fn pod_health() -> Result<Json<Vec<PodHealthSummary>>, StatusCode> {
    let client = get_k8s_client().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let namespaces = vec!["portfolio", "devops"];
    let mut summaries = Vec::new();

    for ns in namespaces {
        let api: Api<Pod> = Api::namespaced(client.clone(), ns);
        let pods = match api.list(&ListParams::default()).await {
            Ok(p) => p,
            Err(e) => {
                tracing::error!("Failed to list pods in namespace {}: {:?}", ns, e);
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }
        };

        let mut running = 0;
        let mut pending = 0;
        let mut failed = 0;
        let mut crash_loop = 0;
        let mut total = 0;

        for pod in pods {
            total += 1;
            let mut is_crash_loop = false;
            if let Some(status) = &pod.status {
                if let Some(container_statuses) = &status.container_statuses {
                    for cs in container_statuses {
                        if let Some(state) = &cs.state {
                            if let Some(waiting) = &state.waiting {
                                if let Some(reason) = &waiting.reason {
                                    if reason == "CrashLoopBackOff" || reason == "Error" {
                                        is_crash_loop = true;
                                    }
                                }
                            }
                        }
                    }
                }

                if is_crash_loop {
                    crash_loop += 1;
                }

                let phase = status.phase.as_deref().unwrap_or("Unknown");
                match phase {
                    "Running" => running += 1,
                    "Pending" => pending += 1,
                    "Failed" => failed += 1,
                    _ => {}
                }
            }
        }

        summaries.push(PodHealthSummary {
            namespace: ns.to_string(),
            running,
            pending,
            failed,
            crash_loop,
            total,
        });
    }

    Ok(Json(summaries))
}
