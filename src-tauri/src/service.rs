use crate::models::{ServiceDetail, ServiceInfo};

/// 服务后端抽象，为将来 Windows 等平台的实现预留。
pub trait ServiceBackend: Send + Sync {
    fn list(&self) -> Result<Vec<ServiceInfo>, String>;
    fn detail(&self, domain: &str, label: &str) -> Result<ServiceDetail, String>;
    fn start(&self, domain: &str, label: &str, plist_path: Option<&str>) -> Result<(), String>;
    fn stop(&self, domain: &str, label: &str) -> Result<(), String>;
    fn restart(&self, domain: &str, label: &str, plist_path: Option<&str>) -> Result<(), String>;
}

/// 按平台选择后端实现。
pub fn default_backend() -> Box<dyn ServiceBackend> {
    if cfg!(target_os = "macos") {
        Box::new(crate::launchctl::LaunchctlBackend)
    } else {
        unimplemented!("仅支持 macOS (launchctl) 后端")
    }
}
