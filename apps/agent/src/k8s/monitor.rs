use std::collections::HashMap;
use std::time::Duration;

use super::client::get_k8s_client_with_backoff;
use super::deployments::get_all_deployments_internal;

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
        // Initialize client with backoff retry
        let client = get_k8s_client_with_backoff().await;

        let webhook_url = std::env::var("DISCORD_WEBHOOK_URL").ok();
        if webhook_url.is_none() {
            tracing::info!("📢 DISCORD_WEBHOOK_URL environment variable is not set. Discord notifications are disabled.");
        }

        // Cache for storing the last seen state of deployments.
        // Key: id (namespace:name), Value: (state, updated_at)
        let mut last_known_states = HashMap::<String, (String, Option<String>)>::new();
        
        // Populate the initial states to avoid spamming alerts on startup
        if let Ok(initial_deps) = get_all_deployments_internal(client.clone()).await {
            for dep in initial_deps {
                last_known_states.insert(dep.id, (dep.state, dep.updated_at));
            }
        }

        tracing::info!("🚀 Background Deployment Monitor started.");

        loop {
            tokio::time::sleep(Duration::from_secs(10)).await;
            
            let current_deps = match get_all_deployments_internal(client.clone()).await {
                Ok(deps) => deps,
                Err(e) => {
                    tracing::error!("Background monitor: error fetching deployments: {:?}", e);
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
                        tracing::info!("📢 Deployment {} transitioned from {} to {}", id, old_state, new_state);
                        
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
                                    tracing::error!("Failed to send Discord notification: {:?}", e);
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
