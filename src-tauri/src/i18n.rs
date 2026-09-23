//! 极简双语查表：后端返回给前端的用户可见文案（主要是错误信息）按当前语言输出。
//! 当前语言默认跟随系统（detect_lang），前端在启动与切换语言时经 set_language 命令覆盖。
//! launchctl / osascript 的原始输出是外部工具结果，保持原文不翻译。

use std::fmt::Display;
use std::sync::{OnceLock, RwLock};
use sys_locale::get_locale;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Lang {
    ZhCn,
    En,
}

impl Lang {
    /// 前端传来的语言代码（"zh-CN" / "en"），未知值回退英文。
    pub fn from_code(code: &str) -> Lang {
        if code.eq_ignore_ascii_case("zh-CN") {
            Lang::ZhCn
        } else {
            Lang::En
        }
    }
}

fn current() -> &'static RwLock<Lang> {
    static CURRENT: OnceLock<RwLock<Lang>> = OnceLock::new();
    CURRENT.get_or_init(|| RwLock::new(detect_lang()))
}

pub fn lang() -> Lang {
    current().read().map(|l| *l).unwrap_or(Lang::En)
}

pub fn set_lang(l: Lang) {
    if let Ok(mut guard) = current().write() {
        *guard = l;
    }
}

/// 系统语言映射：仅简体中文（zh-Hans*/zh-CN/zh-SG）识别为中文，其它语言一律英文。
pub fn detect_lang() -> Lang {
    get_locale().map(|l| normalize(&l)).unwrap_or(Lang::En)
}

fn normalize(locale: &str) -> Lang {
    // 不同来源的 locale 分隔符可能是 `_`（如 zh_Hans_CN），统一为 `-` 再匹配
    let l = locale.to_ascii_lowercase().replace('_', "-");
    if l.starts_with("zh-hans") || l.starts_with("zh-cn") || l.starts_with("zh-sg") {
        Lang::ZhCn
    } else {
        Lang::En
    }
}

pub fn run_cmd_failed(program: &str, err: impl Display) -> String {
    match lang() {
        Lang::ZhCn => format!("执行 {} 失败: {}", program, err),
        Lang::En => format!("Failed to run {}: {}", program, err),
    }
}

pub fn home_not_found() -> &'static str {
    match lang() {
        Lang::ZhCn => "无法获取 HOME 目录",
        Lang::En => "Unable to determine the HOME directory",
    }
}

pub fn invalid_backup_id(id: &str) -> String {
    match lang() {
        Lang::ZhCn => format!("非法的备份 id: {}", id),
        Lang::En => format!("Invalid backup id: {}", id),
    }
}

pub fn serialize_meta_failed(err: impl Display) -> String {
    match lang() {
        Lang::ZhCn => format!("序列化备份信息失败: {}", err),
        Lang::En => format!("Failed to serialize backup info: {}", err),
    }
}

pub fn write_meta_failed(err: impl Display) -> String {
    match lang() {
        Lang::ZhCn => format!("写入备份信息失败: {}", err),
        Lang::En => format!("Failed to write backup info: {}", err),
    }
}

pub fn plist_not_found(path: &str) -> String {
    match lang() {
        Lang::ZhCn => format!("plist 文件不存在: {}", path),
        Lang::En => format!("plist file not found: {}", path),
    }
}

pub fn create_backup_dir_failed(err: impl Display) -> String {
    match lang() {
        Lang::ZhCn => format!("创建备份目录失败: {}", err),
        Lang::En => format!("Failed to create backup directory: {}", err),
    }
}

pub fn backup_plist_failed(err: impl Display) -> String {
    match lang() {
        Lang::ZhCn => format!("备份 plist 失败: {}", err),
        Lang::En => format!("Failed to back up plist: {}", err),
    }
}

pub fn backup_not_found(id: &str) -> String {
    match lang() {
        Lang::ZhCn => format!("备份 {} 不存在或已损坏", id),
        Lang::En => format!("Backup {} does not exist or is corrupted", id),
    }
}

pub fn delete_backup_failed(err: impl Display) -> String {
    match lang() {
        Lang::ZhCn => format!("删除备份失败: {}", err),
        Lang::En => format!("Failed to delete backup: {}", err),
    }
}

pub fn clear_backup_failed(name: &str, err: impl Display) -> String {
    match lang() {
        Lang::ZhCn => format!("清空备份失败（{}）: {}", name, err),
        Lang::En => format!("Failed to clear backup ({}): {}", name, err),
    }
}

pub fn create_dir_failed(err: impl Display) -> String {
    match lang() {
        Lang::ZhCn => format!("创建目录失败: {}", err),
        Lang::En => format!("Failed to create directory: {}", err),
    }
}

pub fn restore_plist_failed(err: impl Display) -> String {
    match lang() {
        Lang::ZhCn => format!("恢复 plist 失败: {}", err),
        Lang::En => format!("Failed to restore plist: {}", err),
    }
}

pub fn print_failed(err: impl Display) -> String {
    match lang() {
        Lang::ZhCn => format!("（launchctl print 失败: {}）", err),
        Lang::En => format!("(launchctl print failed: {})", err),
    }
}

pub fn service_not_found(label: &str) -> String {
    match lang() {
        Lang::ZhCn => format!("服务 {} 不存在", label),
        Lang::En => format!("Service {} does not exist", label),
    }
}

pub fn start_not_loaded(label: &str) -> String {
    match lang() {
        Lang::ZhCn => format!("服务 {} 未加载且无 plist 路径，无法启动", label),
        Lang::En => format!(
            "Service {} is not loaded and has no plist path, cannot start",
            label
        ),
    }
}

pub fn restart_not_loaded(label: &str) -> String {
    match lang() {
        Lang::ZhCn => format!("服务 {} 未加载且无 plist 路径，无法重启", label),
        Lang::En => format!(
            "Service {} is not loaded and has no plist path, cannot restart",
            label
        ),
    }
}

pub fn sip_protected() -> &'static str {
    match lang() {
        Lang::ZhCn => "系统自带服务受 SIP 保护，无法删除",
        Lang::En => "Built-in system services are protected by SIP and cannot be deleted",
    }
}

pub fn delete_plist_failed(err: impl Display) -> String {
    match lang() {
        Lang::ZhCn => format!("删除 plist 失败: {}", err),
        Lang::En => format!("Failed to delete plist: {}", err),
    }
}

pub fn backup_but_delete_failed(id: &str, err: impl Display) -> String {
    match lang() {
        Lang::ZhCn => format!("已备份到 {}，但删除原文件失败: {}", id, err),
        Lang::En => format!(
            "Backed up to {}, but failed to delete the original file: {}",
            id, err
        ),
    }
}

pub fn backup_file_missing(path: &str) -> String {
    match lang() {
        Lang::ZhCn => format!("备份文件缺失: {}", path),
        Lang::En => format!("Backup file is missing: {}", path),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_maps_simplified_chinese_only() {
        assert_eq!(normalize("zh-CN"), Lang::ZhCn);
        assert_eq!(normalize("zh_Hans_CN"), Lang::ZhCn);
        assert_eq!(normalize("zh-sg"), Lang::ZhCn);
        assert_eq!(normalize("zh-TW"), Lang::En);
        assert_eq!(normalize("zh-HK"), Lang::En);
        assert_eq!(normalize("en-US"), Lang::En);
        assert_eq!(normalize("fr"), Lang::En);
    }

    #[test]
    fn from_code_falls_back_to_english() {
        assert_eq!(Lang::from_code("zh-CN"), Lang::ZhCn);
        assert_eq!(Lang::from_code("ZH-cn"), Lang::ZhCn);
        assert_eq!(Lang::from_code("en"), Lang::En);
        assert_eq!(Lang::from_code("fr-FR"), Lang::En);
    }

    #[test]
    fn messages_switch_with_lang() {
        set_lang(Lang::ZhCn);
        assert_eq!(sip_protected(), "系统自带服务受 SIP 保护，无法删除");
        assert!(service_not_found("com.a.b").contains("com.a.b"));

        set_lang(Lang::En);
        assert_eq!(
            sip_protected(),
            "Built-in system services are protected by SIP and cannot be deleted"
        );
        assert!(service_not_found("com.a.b").starts_with("Service "));
    }
}
