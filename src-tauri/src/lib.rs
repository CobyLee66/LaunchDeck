mod commands;
mod launchctl;
mod models;
mod service;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::list_services,
            commands::service_detail,
            commands::start_service,
            commands::stop_service,
            commands::restart_service,
            commands::delete_service,
            commands::list_backups,
            commands::restore_backup,
            commands::delete_backup,
            commands::clear_backups,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
