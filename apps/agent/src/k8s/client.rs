use kube::Client;
use std::time::Duration;


/// Attempt to load the Kubernetes client with exponential backoff retry.
/// Useful for background workers that must start up even if the K8s API is temporarily unavailable.
pub async fn get_k8s_client_with_backoff() -> Client {
    let mut delay = Duration::from_secs(1);
    let max_delay = Duration::from_secs(60);
    loop {
        match Client::try_default().await {
            Ok(client) => {
                tracing::info!("Successfully initialized Kubernetes client.");
                return client;
            }
            Err(e) => {
                tracing::error!(
                    "Failed to initialize Kubernetes client: {:?}. Retrying in {} seconds...",
                    e,
                    delay.as_secs()
                );
                tokio::time::sleep(delay).await;
                delay = std::cmp::min(delay * 2, max_delay);
            }
        }
    }
}
