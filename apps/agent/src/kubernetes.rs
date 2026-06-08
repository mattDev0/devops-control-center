use axum::{
    extract::{Path, Query},
    http::StatusCode,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse,
    },
    Json,
};
use futures::StreamExt;
use k8s_openapi::api::apps::v1::Deployment;
use k8s_openapi::api::core::v1::Pod;
use kube::{
    api::{ListParams, LogParams, Patch, PatchParams},
    Api, Client,
};
use serde_json::json;
use std::convert::Infallible;
use crate::models::{DeploymentDto, LogParamsQuery};

async fn find_pods_for_deployment(
    client: Client,
    namespace: &str,
    dep_name: &str,
) -> Result<Vec<String>, kube::Error> {
    let pods_api: Api<Pod> = Api::namespaced(client, namespace);
    
    // Attempt 1: app=dep_name
    let lp = ListParams {
        label_selector: Some(format!("app={}", dep_name)),
        ..Default::default()
    };
    let pod_list = pods_api.list(&lp).await?;
    let mut pod_names: Vec<String> = pod_list.items.into_iter().filter_map(|p| p.metadata.name).collect();
    
    if pod_names.is_empty() {
        // Attempt 2: app.kubernetes.io/name=dep_name
        let lp = ListParams {
            label_selector: Some(format!("app.kubernetes.io/name={}", dep_name)),
            ..Default::default()
        };
        let pod_list = pods_api.list(&lp).await?;
        pod_names = pod_list.items.into_iter().filter_map(|p| p.metadata.name).collect();
    }
    
    if pod_names.is_empty() {
        // Attempt 3: match prefix dep_name-
        let pod_list = pods_api.list(&ListParams::default()).await?;
        pod_names = pod_list.items.into_iter()
            .filter_map(|p| p.metadata.name)
            .filter(|name| name.starts_with(&format!("{}-", dep_name)))
            .collect();
    }
    
    Ok(pod_names)
}

pub async fn stream_logs(
    Query(query): Query<LogParamsQuery>,
) -> impl IntoResponse {
    let client = match Client::try_default().await {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to initialize K8s client for logs: {:?}", e);
            return Sse::new(futures::stream::once(async {
                Ok::<Event, Infallible>(Event::default().data("Error: Failed to initialize Kubernetes client"))
            })).keep_alive(KeepAlive::new()).into_response();
        }
    };

    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Event, Infallible>>(1000);

    if let Some(id) = query.id {
        // Stream logs for a specific deployment
        let parts: Vec<&str> = id.split(':').collect();
        if parts.len() != 2 {
            let _ = tx.try_send(Ok(Event::default().data("Error: Invalid container ID format")));
            return Sse::new(tokio_stream::wrappers::ReceiverStream::new(rx)).keep_alive(KeepAlive::new()).into_response();
        }
        let namespace = parts[0].to_string();
        let dep_name = parts[1].to_string();

        let tx_clone = tx.clone();
        tokio::spawn(async move {
            match find_pods_for_deployment(client.clone(), &namespace, &dep_name).await {
                Ok(pods) => {
                    if pods.is_empty() {
                        let _ = tx_clone.send(Ok(Event::default().data(format!("No active pods found for deployment: {}", dep_name)))).await;
                        return;
                    }
                    
                    let mut tasks = vec![];
                    for pod_name in pods {
                        let pods_api: Api<Pod> = Api::namespaced(client.clone(), &namespace);
                        let tx_pod = tx_clone.clone();
                        let task = tokio::spawn(async move {
                            let lp = LogParams {
                                follow: true,
                                tail_lines: Some(100),
                                ..LogParams::default()
                            };
                            if let Ok(stream) = pods_api.log_stream(&pod_name, &lp).await {
                                use futures::AsyncBufReadExt;
                                let mut lines = stream.lines();
                                while let Some(Ok(line)) = lines.next().await {
                                    let msg = format!("[{}] {}", pod_name, line);
                                    if tx_pod.send(Ok(Event::default().data(msg))).await.is_err() {
                                        break;
                                    }
                                }
                            } else {
                                let _ = tx_pod.send(Ok(Event::default().data(format!("Failed to stream logs from pod: {}", pod_name)))).await;
                            }
                        });
                        tasks.push(task);
                    }
                    for t in tasks {
                        let _ = t.await;
                    }
                }
                Err(e) => {
                    let _ = tx_clone.send(Ok(Event::default().data(format!("Error listing pods: {:?}", e)))).await;
                }
            }
        });
    } else {
        // Global live logs: stream from all running pods in devops and portfolio namespaces
        let tx_clone = tx.clone();
        tokio::spawn(async move {
            let namespaces = vec!["portfolio", "devops"];
            let mut tasks = vec![];
            for ns in namespaces {
                let pods_api: Api<Pod> = Api::namespaced(client.clone(), ns);
                match pods_api.list(&ListParams::default()).await {
                    Ok(pod_list) => {
                        for p in pod_list.items {
                            if let Some(pod_name) = p.metadata.name {
                                // Only stream from running pods
                                let is_running = p.status.as_ref()
                                    .and_then(|s| s.phase.as_ref())
                                    .map(|phase| phase == "Running")
                                    .unwrap_or(false);
                                if !is_running {
                                    continue;
                                }

                                let pods_api_clone = pods_api.clone();
                                let tx_pod = tx_clone.clone();
                                let ns_str = ns.to_string();
                                let task = tokio::spawn(async move {
                                    let lp = LogParams {
                                        follow: true,
                                        tail_lines: Some(10), // only tail a few lines for global logs to prevent flood
                                        ..LogParams::default()
                                    };
                                    match pods_api_clone.log_stream(&pod_name, &lp).await {
                                        Ok(stream) => {
                                            use futures::AsyncBufReadExt;
                                            let mut lines = stream.lines();
                                            while let Some(Ok(line)) = lines.next().await {
                                                let msg = format!("{}/[{}] {}", ns_str, pod_name, line);
                                                if tx_pod.send(Ok(Event::default().data(msg))).await.is_err() {
                                                    break;
                                                }
                                            }
                                        }
                                        Err(e) => {
                                            eprintln!("Error streaming logs for pod {}: {:?}", pod_name, e);
                                            let _ = tx_pod.send(Ok(Event::default().data(format!("Error streaming logs for pod {}: {:?}", pod_name, e)))).await;
                                        }
                                    }
                                });
                                tasks.push(task);
                            }
                        }
                    }
                    Err(e) => {
                        let _ = tx_clone.send(Ok(Event::default().data(format!("Error listing pods in {}: {:?}", ns, e)))).await;
                    }
                }
            }
            if tasks.is_empty() {
                let _ = tx_clone.send(Ok(Event::default().data("No running pods found in portfolio or devops namespaces"))).await;
                return;
            }
            for t in tasks {
                let _ = t.await;
            }
        });
    }

    let stream = tokio_stream::wrappers::ReceiverStream::new(rx);
    Sse::new(stream).keep_alive(KeepAlive::new()).into_response()
}

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
    let client = Client::try_default()
        .await
        .map_err(|e| {
            eprintln!("Failed to initialize K8s client: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    let result = get_all_deployments_internal(client).await.map_err(|e| {
        eprintln!("Failed to fetch deployments: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(Json(result))
}

async fn send_discord_notification(webhook_url: &str, content: &str) -> Result<(), reqwest::Error> {
    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "content": content
    });
    client.post(webhook_url)
        .json(&payload)
        .send()
        .await?;
    Ok(())
}

pub fn start_deployment_monitor() {
    tokio::spawn(async move {
        let client = match Client::try_default().await {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Failed to initialize K8s client for background monitoring: {:?}", e);
                return;
            }
        };

        let webhook_url = std::env::var("DISCORD_WEBHOOK_URL").ok();
        if webhook_url.is_none() {
            println!("📢 DISCORD_WEBHOOK_URL environment variable is not set. Discord notifications are disabled.");
        }

        // Cache for storing the last seen state of deployments.
        // Key: id (namespace:name), Value: (state, updated_at)
        let mut last_known_states = std::collections::HashMap::<String, (String, Option<String>)>::new();
        
        // Populate the initial states to avoid spamming alerts on startup
        if let Ok(initial_deps) = get_all_deployments_internal(client.clone()).await {
            for dep in initial_deps {
                last_known_states.insert(dep.id, (dep.state, dep.updated_at));
            }
        }

        println!("🚀 Background Deployment Monitor started.");

        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
            
            let current_deps = match get_all_deployments_internal(client.clone()).await {
                Ok(deps) => deps,
                Err(e) => {
                    eprintln!("Background monitor: error fetching deployments: {:?}", e);
                    continue;
                }
            };

            for dep in current_deps {
                let id = dep.id.clone();
                let new_state = dep.state.clone();
                let new_time = dep.updated_at.clone();

                if let Some((old_state, _old_time)) = last_known_states.get(&id) {
                    if old_state != &new_state {
                        // State transition!
                        println!("📢 Deployment {} transitioned from {} to {}", id, old_state, new_state);
                        
                        // Notify on success (transition to running) or failure (transition to failed)
                        if new_state == "running" || new_state == "failed" {
                            if let Some(url) = &webhook_url {
                                let status_icon = if new_state == "running" { "🟢" } else { "🔴" };
                                let error_text = if new_state == "failed" {
                                    format!("\n**Error:** `{}`", dep.error_message.as_deref().unwrap_or("Unknown error"))
                                } else {
                                    "\nDeployment completed successfully!".to_string()
                                };
                                let msg = format!(
                                    "{} **Deployment Alert**\n**Service:** `{}`\n**Status:** `{}`\n**Time:** `{}`{}",
                                    status_icon,
                                    id,
                                    new_state.to_uppercase(),
                                    new_time.as_deref().unwrap_or("N/A"),
                                    error_text
                                );
                                if let Err(e) = send_discord_notification(url, &msg).await {
                                    eprintln!("Failed to send Discord notification: {:?}", e);
                                }
                            }
                        }
                    }
                }
                last_known_states.insert(id, (new_state, new_time));
            }
        }
    });
}

pub async fn deployment_action(
    Path((id, action)): Path<(String, String)>,
) -> Result<StatusCode, StatusCode> {
    let client = Client::try_default()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Parse the id: namespace:deployment_name
    let parts: Vec<&str> = id.split(':').collect();
    if parts.len() != 2 {
        return Err(StatusCode::BAD_REQUEST);
    }
    let namespace = parts[0];
    let dep_name = parts[1];

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
                eprintln!("Failed to patch deployment start: {:?}", e);
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
                eprintln!("Failed to patch deployment stop: {:?}", e);
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
                eprintln!("Failed to patch deployment restart: {:?}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
        }
        _ => return Err(StatusCode::BAD_REQUEST),
    };

    Ok(StatusCode::OK)
}
