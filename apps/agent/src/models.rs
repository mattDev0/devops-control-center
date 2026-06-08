use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct SystemInfo {
    pub os_name: String,
    pub os_version: String,
    pub uptime_seconds: u64,
}

#[derive(Deserialize)]
pub struct ExecuteRequest {
    pub command: String,
    pub args: Vec<String>,
}

#[derive(Serialize)]
pub struct ExecuteResponse {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

#[derive(Serialize)]
pub struct DeploymentDto {
    pub id: String,
    pub name: String,
    pub image: String,
    pub state: String,
    pub status: String,
    pub error_message: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Deserialize)]
pub struct LogParamsQuery {
    pub id: Option<String>,
}
