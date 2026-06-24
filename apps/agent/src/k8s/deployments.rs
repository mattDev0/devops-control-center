use axum::{extract::Path, http::StatusCode, Json};
use k8s_openapi::api::apps::v1::Deployment;
use kube::{
    api::{ListParams, Patch, PatchParams},
    Api, Client,
};
use serde_json::json;

use crate::models::DeploymentDto;
use super::client::get_k8s_client;

pub async fn get_all_deployments_internal(client: Client) -> Result<Vec<DeploymentDto>, kube::Error> {
    let namespaces = vec!["portfolio", "devops"];
    let mut result = Vec::new();

    for ns in namespaces {
        let api: Api<Deployment> = Api::namespaced(client.clone(), ns);
        let deps = api.list(&ListParams::default()).await?;

        for d in deps {
            let name = d.metadata.name.clone().unwrap_or_default();
            let id = format!("{}:{}", ns, name);

            // Get image of the first container in the template spec
            let image = d
                .spec
                .as_ref()
                .and_then(|spec| spec.template.spec.as_ref())
                .and_then(|pod_spec| pod_spec.containers.first())
                .and_then(|c| c.image.clone())
                .unwrap_or_else(|| "Unknown".to_string());

            // Get replica status
            let replicas = d.spec.as_ref().and_then(|s| s.replicas).unwrap_or(0);
            let ready_replicas = d.status.as_ref().and_then(|s| s.ready_replicas).unwrap_or(0);
            let status = format!("Ready: {}/{}", ready_replicas, replicas);

            let mut error_message = None;
            let mut updated_at = None;
            let mut is_failed = false;

            if let Some(status_obj) = &d.status {
                if let Some(conditions) = &status_obj.conditions {
                    for cond in conditions {
                        if let Some(time) = &cond.last_update_time {
                            let time_str = time.0.to_rfc3339();
                            if updated_at.is_none() || updated_at.as_ref() < Some(&time_str) {
                                updated_at = Some(time_str);
                            }
                        } else if let Some(time) = &cond.last_transition_time {
                            let time_str = time.0.to_rfc3339();
                            if updated_at.is_none() || updated_at.as_ref() < Some(&time_str) {
                                updated_at = Some(time_str);
                            }
                        }

                        // Check for failure conditions:
                        // 1. ReplicaFailure: status == "True"
                        if cond.type_ == "ReplicaFailure" && cond.status == "True" {
                            is_failed = true;
                            error_message = cond.message.clone();
                        }
                        // 2. Progressing: status == "False" and reason == "ProgressDeadlineExceeded"
                        if cond.type_ == "Progressing" && cond.status == "False" && cond.reason.as_deref() == Some("ProgressDeadlineExceeded") {
                            is_failed = true;
                            error_message = cond.message.clone();
                        }
                    }
                }
            }

            if updated_at.is_none() {
                if let Some(time) = &d.metadata.creation_timestamp {
                    updated_at = Some(time.0.to_rfc3339());
                }
            }

            // Determine State
            let state = if replicas == 0 {
                "stopped".to_string()
            } else if is_failed {
                "failed".to_string()
            } else if ready_replicas == replicas {
                "running".to_string()
            } else {
                "pending".to_string()
            };

            result.push(DeploymentDto {
                id,
                name,
                image,
                state,
                status,
                error_message,
                updated_at,
            });
        }
    }
    Ok(result)
}

pub async fn list_deployments() -> Result<Json<Vec<DeploymentDto>>, StatusCode> {
    let client = get_k8s_client().await.map_err(|e| {
        tracing::error!("Failed to initialize K8s client for deployment listing: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let result = get_all_deployments_internal(client).await.map_err(|e| {
        tracing::error!("Failed to fetch deployments: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(Json(result))
}

pub async fn deployment_action(
    Path((id, action)): Path<(String, String)>,
) -> Result<StatusCode, StatusCode> {
    let client = get_k8s_client().await.map_err(|e| {
        tracing::error!("Failed to initialize K8s client for deployment action: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Parse the id: namespace:deployment_name
    let parts: Vec<&str> = id.split(':').collect();
    if parts.len() != 2 {
        return Err(StatusCode::BAD_REQUEST);
    }
    let namespace = parts[0];
    let dep_name = parts[1];

    if namespace != "devops" && namespace != "portfolio" {
        tracing::warn!("Blocked unauthorized namespace target in deployment action: {}", namespace);
        return Err(StatusCode::FORBIDDEN);
    }

    let api: Api<Deployment> = Api::namespaced(client, namespace);

    match action.as_str() {
        "start" => {
            let patch = json!({
                "spec": {
                    "replicas": 1
                }
            });
            api.patch(
                dep_name,
                &PatchParams::default(),
                &Patch::Merge(&patch),
            )
            .await
            .map_err(|e| {
                tracing::error!("Failed to patch deployment start for {}: {:?}", dep_name, e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
        }
        "stop" => {
            let patch = json!({
                "spec": {
                    "replicas": 0
                }
            });
            api.patch(
                dep_name,
                &PatchParams::default(),
                &Patch::Merge(&patch),
            )
            .await
            .map_err(|e| {
                tracing::error!("Failed to patch deployment stop for {}: {:?}", dep_name, e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
        }
        "restart" => {
            let now = chrono::Utc::now().to_rfc3339();
            let patch = json!({
                "spec": {
                    "template": {
                        "metadata": {
                            "annotations": {
                                "kubectl.kubernetes.io/restartedAt": now
                            }
                        }
                    }
                }
            });
            api.patch(
                dep_name,
                &PatchParams::default(),
                &Patch::Merge(&patch),
            )
            .await
            .map_err(|e| {
                tracing::error!("Failed to patch deployment restart for {}: {:?}", dep_name, e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
        }
        _ => return Err(StatusCode::BAD_REQUEST),
    };

    Ok(StatusCode::OK)
}
