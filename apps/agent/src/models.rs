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
