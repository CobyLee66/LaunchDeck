use crate::models::{BackupInfo, ServiceDetail, ServiceInfo};

/// 服务后端抽象，为将来 Windows 等平台的实现预留。
pub trait ServiceBackend: Send + Sync {
    fn list(&self) -> Result<Vec<ServiceInfo>, String>;
    fn detail(&self, domain: &str, label: &str) -> Result<ServiceDetail, String>;
    fn start(&self, domain: &str, label: &str, plist_path: Option<&str>) -> Result<(), String>;
    fn stop(&self, domain: &str, label: &str) -> Result<(), String>;
    fn restart(&self, domain: &str, label: &str, plist_path: Option<&str>) -> Result<(), String>;
    /// 卸载服务（若已加载）、备份 plist 后删除原文件。
    fn delete_service(&self, domain: &str, label: &str, plist_path: &str) -> Result<(), String>;
    fn list_backups(&self) -> Result<Vec<BackupInfo>, String>;
    /// 把备份的 plist 还原到删除时的原路径（不自动加载）。
    fn restore_backup(&self, backup_id: &str) -> Result<(), String>;
    fn delete_backup(&self, backup_id: &str) -> Result<(), String>;
    fn clear_backups(&self) -> Result<(), String>;
}

/// 按平台选择后端实现。
pub fn default_backend() -> Box<dyn ServiceBackend> {
    if cfg!(target_os = "macos") {
        Box::new(crate::launchctl::LaunchctlBackend)
    } else {
        unimplemented!("仅支持 macOS (launchctl) 后端")
    }
}
