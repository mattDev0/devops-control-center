use kube::Client;
use std::time::Duration;

const CONNECT_ATTEMPTS: u32 = 3;
const VERIFY_TIMEOUT: Duration = Duration::from_secs(5);

/// Confirm the API server actually answers.
///
/// `Client::try_default()` only parses configuration - it never contacts the
/// cluster - so a stale or placeholder kubeconfig looks identical to a working
/// connection until the first real request fails.
pub async fn verify(client: &Client) -> Result<String, String> {
    match tokio::time::timeout(VERIFY_TIMEOUT, client.apiserver_version()).await {
        Err(_) => Err("timed out contacting the Kubernetes API".to_string()),
        Ok(Err(e)) => Err(e.to_string()),
        Ok(Ok(info)) => Ok(format!("{}.{}", info.major, info.minor)),
    }
}

/// Build a verified Kubernetes client, or `None` if no cluster is available.
///
/// The agent is expected to run in two shapes: inside a cluster, where the
/// service account provides credentials, and under Docker Compose, where there
/// is no cluster at all. Returning `None` rather than blocking lets the Docker
/// and system features serve normally in the second case.
pub async fn try_connect() -> Option<Client> {
    let mut delay = Duration::from_secs(1);

    for attempt in 1..=CONNECT_ATTEMPTS {
        match Client::try_default().await {
            Ok(client) => match verify(&client).await {
                Ok(version) => {
                    tracing::info!(version = %version, "Kubernetes API reachable");
                    return Some(client);
                }
                Err(e) => {
                    tracing::warn!(attempt, error = %e, "Kubernetes is configured but unreachable")
                }
            },
            Err(e) => tracing::warn!(attempt, error = %e, "No usable Kubernetes configuration"),
        }

        if attempt < CONNECT_ATTEMPTS {
            tokio::time::sleep(delay).await;
            delay *= 2;
        }
    }

    tracing::info!(
        "Starting without Kubernetes. Cluster features are disabled and will be \
         reported as unavailable; Docker and system features are unaffected."
    );
    None
}
