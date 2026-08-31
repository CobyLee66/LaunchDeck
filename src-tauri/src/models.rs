use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ServiceInfo {
    pub label: String,
    /// "system" | "gui" | "user"
    pub domain: String,
    pub plist_path: Option<String>,
    pub running: bool,
    pub pid: Option<u64>,
    pub last_exit_code: Option<i64>,
    pub run_at_load: bool,
    pub keep_alive: bool,
    /// true 表示 Apple 自带系统服务（/System/Library 前缀）
    pub is_system: bool,
    pub program: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ServiceDetail {
    pub info: ServiceInfo,
    pub plist_keys: Vec<(String, String)>,
    pub raw_print: String,
}
