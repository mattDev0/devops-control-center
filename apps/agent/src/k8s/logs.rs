use axum::{
    extract::{Query, State},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse,
    },
};
use futures::StreamExt;
use k8s_openapi::api::core::v1::Pod;
use kube::{
    api::{ListParams, LogParams},
    Api, Client,
};
use std::convert::Infallible;

use crate::models::LogParamsQuery;
use crate::AppState;

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
    State(state): State<AppState>,
    Query(query): Query<LogParamsQuery>,
) -> impl IntoResponse {
    let client = state.kube_client.clone();

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

        if namespace != "devops" && namespace != "portfolio" {
            tracing::warn!("Blocked unauthorized namespace target in log stream: {}", namespace);
            let _ = tx.try_send(Ok(Event::default().data("Error: Access denied to target namespace")));
            return Sse::new(tokio_stream::wrappers::ReceiverStream::new(rx)).keep_alive(KeepAlive::new()).into_response();
        }

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
                                loop {
                                    tokio::select! {
                                        line_res = lines.next() => {
                                            match line_res {
                                                Some(Ok(line)) => {
                                                    let msg = format!("[{}] {}", pod_name, line);
                                                    if tx_pod.send(Ok(Event::default().data(msg))).await.is_err() {
                                                        break;
                                                    }
                                                }
                                                _ => break,
                                            }
                                        }
                                        _ = tx_pod.closed() => {
                                            break;
                                        }
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
                                            loop {
                                                tokio::select! {
                                                    line_res = lines.next() => {
                                                        match line_res {
                                                            Some(Ok(line)) => {
                                                                let msg = format!("{}/[{}] {}", ns_str, pod_name, line);
                                                                if tx_pod.send(Ok(Event::default().data(msg))).await.is_err() {
                                                                    break;
                                                                }
                                                            }
                                                            _ => break,
                                                        }
                                                    }
                                                    _ = tx_pod.closed() => {
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                        Err(e) => {
                                            tracing::error!("Error streaming logs for pod {}: {:?}", pod_name, e);
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
