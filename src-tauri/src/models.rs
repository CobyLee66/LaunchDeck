use serde::{Deserialize, Serialize};

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

/// 一条删除服务的备份。同时用作备份目录内 meta.json 的存储格式。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInfo {
    /// 备份子目录名，同时作为恢复/删除操作的 id
    pub id: String,
    pub label: String,
    /// "system" | "gui" | "user"
    pub domain: String,
    /// 删除时的 plist 原路径，恢复时的目标位置
    pub original_path: String,
    /// 删除时间（epoch 毫秒）
    pub deleted_at_ms: u64,
    /// 备份目录内的 plist 文件名
    pub file_name: String,
}
