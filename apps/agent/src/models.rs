use serde::{Deserialize, Serialize};

#[derive(Serialize, Debug)]
pub struct SystemInfo {
    pub os_name: String,
    pub os_version: String,
    pub uptime_seconds: u64,
}

#[derive(Serialize, Debug)]
pub struct DeploymentDto {
    pub id: String,
    pub name: String,
    pub image: String,
    pub state: String,
    pub status: String,
    pub error_message: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct LogParamsQuery {
    pub id: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct PodHealthSummary {
    pub namespace: String,
    pub running: u32,
    pub pending: u32,
    pub failed: u32,
    pub crash_loop: u32,
    pub total: u32,
}
