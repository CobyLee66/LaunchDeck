use crate::i18n::{self, Lang};
use crate::models::{BackupInfo, ServiceDetail, ServiceInfo};
use crate::service::{default_backend, ServiceBackend};
use std::sync::OnceLock;

fn backend() -> &'static dyn ServiceBackend {
    static BACKEND: OnceLock<Box<dyn ServiceBackend>> = OnceLock::new();
    BACKEND.get_or_init(default_backend).as_ref()
}

/// 系统原始 locale（如 "zh-CN" / "en-US"），探测失败返回 null。
#[tauri::command]
pub fn get_system_locale() -> Option<String> {
    sys_locale::get_locale()
}

/// 前端在启动与切换语言时同步后端，使错误文案语言跟随 UI。
#[tauri::command]
pub fn set_language(language: String) {
    i18n::set_lang(Lang::from_code(&language));
}

#[tauri::command]
pub fn list_services() -> Result<Vec<ServiceInfo>, String> {
    backend().list()
}

#[tauri::command]
pub fn service_detail(domain: String, label: String) -> Result<ServiceDetail, String> {
    backend().detail(&domain, &label)
}

#[tauri::command]
pub fn start_service(
    domain: String,
    label: String,
    plist_path: Option<String>,
) -> Result<(), String> {
    backend().start(&domain, &label, plist_path.as_deref())
}

#[tauri::command]
pub fn stop_service(domain: String, label: String) -> Result<(), String> {
    backend().stop(&domain, &label)
}

#[tauri::command]
pub fn restart_service(
    domain: String,
    label: String,
    plist_path: Option<String>,
) -> Result<(), String> {
    backend().restart(&domain, &label, plist_path.as_deref())
}

#[tauri::command]
pub fn delete_service(domain: String, label: String, plist_path: String) -> Result<(), String> {
    backend().delete_service(&domain, &label, &plist_path)
}

#[tauri::command]
pub fn list_backups() -> Result<Vec<BackupInfo>, String> {
    backend().list_backups()
}

#[tauri::command]
pub fn restore_backup(backup_id: String) -> Result<(), String> {
    backend().restore_backup(&backup_id)
}

#[tauri::command]
pub fn delete_backup(backup_id: String) -> Result<(), String> {
    backend().delete_backup(&backup_id)
}

#[tauri::command]
pub fn clear_backups() -> Result<(), String> {
    backend().clear_backups()
}
