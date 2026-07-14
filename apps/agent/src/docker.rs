use axum::{
    extract::Path,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse,
    },
    http::StatusCode,
    Json,
};
use bollard::container::{ListContainersOptions, LogOutput, LogsOptions, StartContainerOptions, StopContainerOptions, RestartContainerOptions, StatsOptions};
use bollard::Docker;
use futures::StreamExt;
use std::convert::Infallible;
use tracing::{info, error, warn};

use crate::models::{DockerContainerDto, DockerContainerStatsDto};

pub async fn list_containers() -> Result<Json<Vec<DockerContainerDto>>, StatusCode> {
    let docker = Docker::connect_with_unix_defaults().map_err(|e| {
        error!("Failed to connect to Docker socket: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let options = Some(ListContainersOptions::<String> {
        all: true,
        ..Default::default()
    });

    let containers = docker.list_containers(options).await.map_err(|e| {
        error!("Failed to list Docker containers: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let dtos = containers
        .into_iter()
        .map(|c| {
            let id = c.id.unwrap_or_default();
            let short_id = if id.len() > 12 { &id[0..12] } else { &id };
            
            let name = c.names
                .unwrap_or_default()
                .first()
                .map(|n| n.trim_start_matches('/').to_string())
                .unwrap_or_else(|| "unknown".to_string());

            let ports = c.ports
                .unwrap_or_default()
                .into_iter()
                .filter_map(|p| {
                    let private = p.private_port;
                    p.public_port.map(|public| format!("{}:{}", public, private))
                })
                .collect::<Vec<String>>()
                .join(", ");

            DockerContainerDto {
                id: short_id.to_string(),
                name,
                image: c.image.unwrap_or_default(),
                state: c.state.unwrap_or_default(),
                status: c.status.unwrap_or_default(),
                ports,
                created_at: c.created.map(|t| {
                    chrono::DateTime::<chrono::Utc>::from_timestamp(t, 0)
                        .map(|dt| dt.to_rfc3339())
                        .unwrap_or_default()
                }),
            }
        })
        .collect();

    Ok(Json(dtos))
}

pub async fn container_action(
    Path((id, action)): Path<(String, String)>,
) -> Result<StatusCode, StatusCode> {
    let docker = Docker::connect_with_unix_defaults().map_err(|e| {
        error!("Failed to connect to Docker socket: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    match action.as_str() {
        "start" => {
            docker.start_container(&id, None::<StartContainerOptions<String>>).await.map_err(|e| {
                error!("Failed to start container {}: {}", id, e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
            info!("Successfully started container {}", id);
            Ok(StatusCode::OK)
        }
        "stop" => {
            let options = Some(StopContainerOptions { t: 10 });
            docker.stop_container(&id, options).await.map_err(|e| {
                error!("Failed to stop container {}: {}", id, e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
            info!("Successfully stopped container {}", id);
            Ok(StatusCode::OK)
        }
        "restart" => {
            let options = Some(RestartContainerOptions { t: 10 });
            docker.restart_container(&id, options).await.map_err(|e| {
                error!("Failed to restart container {}: {}", id, e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
            info!("Successfully restarted container {}", id);
            Ok(StatusCode::OK)
        }
        _ => {
            warn!("Unsupported action {} requested for container {}", action, id);
            Err(StatusCode::BAD_REQUEST)
        }
    }
}

pub async fn container_stats(
    Path(id): Path<String>,
) -> Result<Json<DockerContainerStatsDto>, StatusCode> {
    let docker = Docker::connect_with_unix_defaults().map_err(|e| {
        error!("Failed to connect to Docker socket: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut stream = docker.stats(&id, Some(StatsOptions { stream: false, one_shot: true }));

    if let Some(stats_res) = stream.next().await {
        match stats_res {
            Ok(stats) => {
                let memory_usage = stats.memory_stats.usage.unwrap_or(0);
                let memory_limit = stats.memory_stats.limit.unwrap_or(0);
                let memory_percent = if memory_limit > 0 {
                    (memory_usage as f64 / memory_limit as f64) * 100.0
                } else {
                    0.0
                };

                let cpu_stats = stats.cpu_stats;
                let precpu_stats = stats.precpu_stats;
                let cpu_delta = cpu_stats.cpu_usage.total_usage - precpu_stats.cpu_usage.total_usage;
                let system_delta = cpu_stats.system_cpu_usage.unwrap_or(0) - precpu_stats.system_cpu_usage.unwrap_or(0);
                let number_cpus = cpu_stats.online_cpus.unwrap_or(precpu_stats.online_cpus.unwrap_or(1));

                let cpu_percent = if system_delta > 0 && cpu_delta > 0 {
                    (cpu_delta as f64 / system_delta as f64) * number_cpus as f64 * 100.0
                } else {
                    0.0
                };

                Ok(Json(DockerContainerStatsDto {
                    cpu_percent,
                    memory_percent,
                    memory_usage_bytes: memory_usage,
                    memory_limit_bytes: memory_limit,
                }))
            }
            Err(e) => {
                error!("Failed to fetch stats for container {}: {}", id, e);
                Err(StatusCode::INTERNAL_SERVER_ERROR)
            }
        }
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

pub async fn container_logs(
    Path(id): Path<String>,
) -> impl IntoResponse {
    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Event, Infallible>>(500);

    tokio::spawn(async move {
        let docker = match Docker::connect_with_unix_defaults() {
            Ok(d) => d,
            Err(e) => {
                let _ = tx.send(Ok(Event::default().data(format!("Error: Failed to connect to Docker socket: {}", e)))).await;
                return;
            }
        };

        let options = Some(LogsOptions::<String> {
            follow: true,
            stdout: true,
            stderr: true,
            tail: "100".to_string(),
            ..Default::default()
        });

        let mut stream = docker.logs(&id, options);

        while let Some(log_res) = stream.next().await {
            match log_res {
                Ok(log_output) => {
                    let log_str = match log_output {
                        LogOutput::StdOut { message } => String::from_utf8_lossy(&message).to_string(),
                        LogOutput::StdErr { message } => String::from_utf8_lossy(&message).to_string(),
                        LogOutput::Console { message } => String::from_utf8_lossy(&message).to_string(),
                        _ => continue,
                    };

                    let clean_log = log_str.trim_end().to_string();
                    if tx.send(Ok(Event::default().data(clean_log))).await.is_err() {
                        break;
                    }
                }
                Err(e) => {
                    let _ = tx.send(Ok(Event::default().data(format!("Error: Log stream read failed: {}", e)))).await;
                    break;
                }
            }
        }
    });

    Sse::new(tokio_stream::wrappers::ReceiverStream::new(rx))
        .keep_alive(KeepAlive::new())
}
