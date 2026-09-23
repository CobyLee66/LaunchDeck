use crate::models::{BackupInfo, ServiceDetail, ServiceInfo};
use crate::service::ServiceBackend;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub struct LaunchctlBackend;

/// (目录, domain 短名)
fn plist_dirs() -> Vec<(PathBuf, &'static str)> {
    let mut dirs = vec![
        (PathBuf::from("/Library/LaunchDaemons"), "system"),
        (PathBuf::from("/Library/LaunchAgents"), "gui"),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        dirs.push((Path::new(&home).join("Library/LaunchAgents"), "gui"));
    }
    dirs.push((PathBuf::from("/System/Library/LaunchDaemons"), "system"));
    dirs.push((PathBuf::from("/System/Library/LaunchAgents"), "gui"));
    dirs
}

fn run_cmd(program: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new(program)
        .args(args)
        .output()
        .map_err(|e| format!("执行 {} 失败: {}", program, e))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// 路径等参数嵌入 do shell script 前的单引号包裹
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// /Library 下的文件删除/复制等需要 root 的操作，通过 osascript 提权执行
/// （会弹出 macOS 管理员授权；系统对同一应用的授权有约 5 分钟缓存）。
fn privileged_shell(cmd: &str) -> Result<(), String> {
    // 转义反斜杠与双引号，嵌入 do shell script "..."
    let escaped = cmd.replace('\\', "\\\\").replace('"', "\\\"");
    let script = format!("do shell script \"{}\" with administrator privileges", escaped);
    run_cmd("osascript", &["-e", &script])?;
    Ok(())
}

/// 解析 `launchctl print <domain>` 输出里的 services 段。
/// 行形如 `\t\t   553\t    -\tcom.example.label`（pid、上次退出码、label）。
fn parse_print_services(output: &str) -> Vec<(String, Option<u64>, Option<i64>)> {
    let mut result = Vec::new();
    let mut in_services = false;
    for line in output.lines() {
        let trimmed = line.trim();
        if !in_services {
            if trimmed.starts_with("services = {") || trimmed == "services = {" {
                in_services = true;
            }
            continue;
        }
        if trimmed == "}" {
            break;
        }
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() < 3 {
            continue;
        }
        let pid = parts[0].parse::<u64>().ok().filter(|p| *p > 0);
        let last_exit = parts[1].parse::<i64>().ok();
        let label = parts[2].to_string();
        result.push((label, pid, last_exit));
    }
    result
}

struct PlistMeta {
    run_at_load: bool,
    keep_alive: bool,
    program: Option<String>,
}

fn read_plist_meta(path: &Path) -> Option<PlistMeta> {
    let value = plist::Value::from_file(path).ok()?;
    let dict = value.as_dictionary()?;
    let run_at_load = dict
        .get("RunAtLoad")
        .and_then(|v| v.as_boolean())
        .unwrap_or(false);
    let keep_alive = match dict.get("KeepAlive") {
        Some(v) => v.as_boolean().unwrap_or(true), // 非布尔形式（字典条件）视为 true
        None => false,
    };
    let program = dict
        .get("Program")
        .and_then(|v| v.as_string())
        .map(|s| s.to_string())
        .or_else(|| {
            dict.get("ProgramArguments")
                .and_then(|v| v.as_array())
                .and_then(|a| a.first())
                .and_then(|v| v.as_string())
                .map(|s| s.to_string())
        });
    Some(PlistMeta {
        run_at_load,
        keep_alive,
        program,
    })
}

fn uid() -> Result<String, String> {
    Ok(run_cmd("id", &["-u"])?.trim().to_string())
}

/// 服务级 `launchctl print <target>` 里的 pid；未加载（print 失败）或未运行（无 pid 行）返回 None。
fn service_pid(target: &str) -> Option<u64> {
    let out = run_cmd("launchctl", &["print", target]).ok()?;
    for line in out.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("pid = ") {
            if let Ok(pid) = rest.trim().parse::<u64>() {
                return (pid > 0).then_some(pid);
            }
        }
    }
    None
}

/// bootout/kickstart 返回时 launchd 侧状态可能尚未收敛（进程退出有延迟，
/// 忽略 SIGTERM 的进程会滞留数秒才被 SIGKILL），此时立即刷新列表会拿到旧状态。
/// 轮询服务级 print 直到达到期望状态或超时；超时不视为操作失败（launchd 已受理）。
fn wait_until_state(target: &str, want_running: bool, timeout: Duration) {
    let deadline = Instant::now() + timeout;
    while service_pid(target).is_some() != want_running {
        if Instant::now() >= deadline {
            return;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

impl LaunchctlBackend {
    /// domain 短名 + 完整 target（如 gui/501）。
    fn domains() -> Vec<(&'static str, String)> {
        let mut v = vec![("system", "system".to_string())];
        if let Ok(u) = uid() {
            v.push(("gui", format!("gui/{}", u)));
            v.push(("user", format!("user/{}", u)));
        }
        v
    }

    fn collect(&self) -> Result<Vec<ServiceInfo>, String> {
        let mut map: HashMap<String, ServiceInfo> = HashMap::new();

        for (short, target) in Self::domains() {
            let out = match run_cmd("launchctl", &["print", &target]) {
                Ok(o) => o,
                Err(_) => continue, // 失败的 domain 跳过
            };
            for (label, pid, last_exit) in parse_print_services(&out) {
                map.insert(
                    label.clone(),
                    ServiceInfo {
                        label,
                        domain: short.to_string(),
                        plist_path: None,
                        running: pid.is_some(),
                        pid,
                        last_exit_code: last_exit,
                        run_at_load: false,
                        keep_alive: false,
                        is_system: false,
                        program: None,
                    },
                );
            }
        }

        // 扫描 plist 目录：补充 print 结果中没有的服务，并为已有服务回填 plist 信息
        for (dir, domain) in plist_dirs() {
            let entries = match std::fs::read_dir(&dir) {
                Ok(e) => e,
                Err(_) => continue,
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) != Some("plist") {
                    continue;
                }
                let label = match path.file_stem().and_then(|s| s.to_str()) {
                    Some(l) => l.to_string(),
                    None => continue,
                };
                let path_str = path.to_string_lossy().to_string();
                // 已存在的服务只在还没有 plist 路径时回填
                let info = match map.get_mut(&label) {
                    Some(i) if i.plist_path.is_some() => continue,
                    Some(i) => i,
                    _ => {
                        map.insert(
                            label.clone(),
                            ServiceInfo {
                                label: label.clone(),
                                domain: domain.to_string(),
                                plist_path: None,
                                running: false,
                                pid: None,
                                last_exit_code: None,
                                run_at_load: false,
                                keep_alive: false,
                                is_system: false,
                                program: None,
                            },
                        );
                        map.get_mut(&label).unwrap()
                    }
                };
                info.plist_path = Some(path_str.clone());
                if let Some(meta) = read_plist_meta(&path) {
                    info.run_at_load = meta.run_at_load;
                    info.keep_alive = meta.keep_alive;
                    info.program = meta.program;
                }
            }
        }

        for info in map.values_mut() {
            info.is_system = match &info.plist_path {
                Some(p) => p.starts_with("/System/Library"),
                None => info.label.starts_with("com.apple."),
            };
        }

        let mut list: Vec<ServiceInfo> = map.into_values().collect();
        list.sort_by(|a, b| a.label.cmp(&b.label));
        Ok(list)
    }

    fn is_loaded(&self, domain: &str, label: &str) -> bool {
        let target = format!("{}/{}", domain, label);
        // domain 短名需要扩展为完整 target
        let target = expand_target(&target);
        run_cmd("launchctl", &["print", &target]).is_ok()
    }

    /// system domain 的写操作通过 osascript 提权。
    fn run_write(&self, domain: &str, args: &[String]) -> Result<(), String> {
        if domain == "system" {
            let mut cmd = String::from("launchctl");
            for a in args {
                cmd.push(' ');
                cmd.push_str(a);
            }
            privileged_shell(&cmd)
        } else {
            let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
            run_cmd("launchctl", &refs)?;
            Ok(())
        }
    }
}

/// "system/com.x" → "system/com.x"；"gui/com.x" → "gui/501/com.x"
fn expand_target(target: &str) -> String {
    let (domain, rest) = match target.split_once('/') {
        Some(t) => t,
        None => return target.to_string(),
    };
    match domain {
        "gui" | "user" => match uid() {
            Ok(u) => format!("{}/{}/{}", domain, u, rest),
            Err(_) => target.to_string(),
        },
        _ => target.to_string(),
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 备份根目录：~/Library/Application Support/SysServiceHelper/backups
fn backup_root() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "无法获取 HOME 目录".to_string())?;
    Ok(Path::new(&home).join("Library/Application Support/SysServiceHelper/backups"))
}

/// 备份目录名里的 label 消毒：launchd label 通常为反向域名（字母数字点），
/// 其余字符（含路径分隔符）替换为下划线
fn sanitize_label(label: &str) -> String {
    label
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// id 是备份子目录名，拒绝路径分隔符与 .. 防止路径穿越
fn validate_backup_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id == "." || id == ".." || id.contains('/') || id.contains('\\') {
        return Err(format!("非法的备份 id: {}", id));
    }
    Ok(())
}

/// 同一毫秒删除同一 label 时目录名冲突，追加 -N 后缀
fn unique_dir_name(root: &Path, base: &str) -> String {
    let mut name = base.to_string();
    let mut n = 1;
    while root.join(&name).exists() {
        n += 1;
        name = format!("{}-{}", base, n);
    }
    name
}

fn read_backup(dir: &Path) -> Option<BackupInfo> {
    let raw = std::fs::read_to_string(dir.join("meta.json")).ok()?;
    let mut info: BackupInfo = serde_json::from_str(&raw).ok()?;
    info.id = dir.file_name()?.to_str()?.to_string();
    Some(info)
}

fn write_meta(dir: &Path, info: &BackupInfo) -> Result<(), String> {
    let json = serde_json::to_string_pretty(info).map_err(|e| format!("序列化备份信息失败: {}", e))?;
    std::fs::write(dir.join("meta.json"), json).map_err(|e| format!("写入备份信息失败: {}", e))
}

/// 以下 *_at(root, …) 自由函数接受显式备份根目录，便于单元测试指向临时目录。

/// 备份 plist 到 root 下的新子目录：先复制成功、meta 写完整，调用方才可删原文件。
/// 返回备份信息；任一步失败都会清掉半成品目录。
fn backup_create_at(
    root: &Path,
    domain: &str,
    label: &str,
    plist_path: &str,
    deleted_at_ms: u64,
) -> Result<BackupInfo, String> {
    let src = Path::new(plist_path);
    if !src.is_file() {
        return Err(format!("plist 文件不存在: {}", plist_path));
    }
    std::fs::create_dir_all(root).map_err(|e| format!("创建备份目录失败: {}", e))?;

    let dir_name = unique_dir_name(root, &format!("{}-{}", deleted_at_ms, sanitize_label(label)));
    let dir = root.join(&dir_name);
    std::fs::create_dir(&dir).map_err(|e| format!("创建备份目录失败: {}", e))?;

    let cleanup = |e: String| -> String {
        let _ = std::fs::remove_dir_all(&dir);
        e
    };
    let file_name = "service.plist".to_string();
    std::fs::copy(src, dir.join(&file_name)).map_err(|e| {
        cleanup(format!("备份 plist 失败: {}", e))
    })?;
    let info = BackupInfo {
        id: dir_name,
        label: label.to_string(),
        domain: domain.to_string(),
        original_path: plist_path.to_string(),
        deleted_at_ms,
        file_name,
    };
    write_meta(&dir, &info).map_err(cleanup)?;
    Ok(info)
}

fn backup_list_at(root: &Path) -> Result<Vec<BackupInfo>, String> {
    let entries = match std::fs::read_dir(root) {
        Ok(e) => e,
        // 备份目录不存在视为无备份
        Err(_) => return Ok(vec![]),
    };
    let mut list: Vec<BackupInfo> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .filter_map(|p| read_backup(&p))
        .collect();
    list.sort_by(|a, b| b.deleted_at_ms.cmp(&a.deleted_at_ms).then(a.label.cmp(&b.label)));
    Ok(list)
}

/// 返回 (备份目录, 备份信息)
fn backup_read_at(root: &Path, backup_id: &str) -> Result<(PathBuf, BackupInfo), String> {
    validate_backup_id(backup_id)?;
    let dir = root.join(backup_id);
    let info = read_backup(&dir).ok_or_else(|| format!("备份 {} 不存在或已损坏", backup_id))?;
    Ok((dir, info))
}

fn backup_delete_at(root: &Path, backup_id: &str) -> Result<(), String> {
    let (dir, _) = backup_read_at(root, backup_id)?;
    std::fs::remove_dir_all(&dir).map_err(|e| format!("删除备份失败: {}", e))
}

fn backup_clear_at(root: &Path) -> Result<(), String> {
    let entries = match std::fs::read_dir(root) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            std::fs::remove_dir_all(&path)
                .map_err(|e| format!("清空备份失败（{}）: {}", name, e))?;
        }
    }
    Ok(())
}

/// 把备份的 plist 复制回原路径。/Library 下需 root 提权，其余按当前用户权限复制。
fn backup_copy_back(src: &Path, original_path: &str) -> Result<(), String> {
    if let Some(parent) = Path::new(original_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    if original_path.starts_with("/Library/") {
        // 提权复制，文件归属 root，与常规 LaunchDaemon/LaunchAgent 的属主一致
        privileged_shell(&format!(
            "cp -f {} {}",
            shell_quote(&src.to_string_lossy()),
            shell_quote(original_path)
        ))
    } else {
        std::fs::copy(src, original_path)
            .map_err(|e| format!("恢复 plist 失败: {}", e))?;
        Ok(())
    }
}

impl ServiceBackend for LaunchctlBackend {
    fn list(&self) -> Result<Vec<ServiceInfo>, String> {
        self.collect()
    }

    fn detail(&self, domain: &str, label: &str) -> Result<ServiceDetail, String> {
        let target = expand_target(&format!("{}/{}", domain, label));
        let raw_print = run_cmd("launchctl", &["print", &target])
            .unwrap_or_else(|e| format!("（launchctl print 失败: {}）", e));

        let info = self
            .collect()?
            .into_iter()
            .find(|s| s.domain == domain && s.label == label)
            .ok_or_else(|| format!("服务 {} 不存在", label))?;

        let plist_keys = match &info.plist_path {
            Some(p) => match plist::Value::from_file(p) {
                Ok(plist::Value::Dictionary(dict)) => dict
                    .into_iter()
                    .map(|(k, v)| (k, format!("{:?}", v)))
                    .collect(),
                _ => vec![],
            },
            None => vec![],
        };

        Ok(ServiceDetail {
            info,
            plist_keys,
            raw_print,
        })
    }

    fn start(&self, domain: &str, label: &str, plist_path: Option<&str>) -> Result<(), String> {
        if self.is_loaded(domain, label) {
            // 已加载：kickstart 启动
            let target = expand_target(&format!("{}/{}", domain, label));
            self.run_write(domain, &["kickstart".into(), "-k".into(), target.clone()])?;
            wait_until_state(&target, true, Duration::from_secs(8));
            Ok(())
        } else if let Some(path) = plist_path {
            // bootstrap 仅加载；RunAtLoad=false 的服务本就不会立即运行，不等待
            let full_domain = match domain {
                "gui" | "user" => format!("{}/{}", domain, uid()?),
                _ => domain.to_string(),
            };
            self.run_write(domain, &["bootstrap".into(), full_domain, path.to_string()])
        } else {
            Err(format!("服务 {} 未加载且无 plist 路径，无法启动", label))
        }
    }

    fn stop(&self, domain: &str, label: &str) -> Result<(), String> {
        let target = expand_target(&format!("{}/{}", domain, label));
        self.run_write(domain, &["bootout".into(), target.clone()])?;
        // 忽略 SIGTERM 的进程可能滞留约 10 秒才被 SIGKILL，超时放宽到 15 秒
        wait_until_state(&target, false, Duration::from_secs(15));
        Ok(())
    }

    fn restart(&self, domain: &str, label: &str, plist_path: Option<&str>) -> Result<(), String> {
        if self.is_loaded(domain, label) {
            let target = expand_target(&format!("{}/{}", domain, label));
            self.run_write(domain, &["kickstart".into(), "-k".into(), target.clone()])?;
            wait_until_state(&target, true, Duration::from_secs(8));
            return Ok(());
        }
        // 未加载：bootout 忽略失败后 bootstrap
        let _ = self.stop(domain, label);
        if let Some(path) = plist_path {
            let full_domain = match domain {
                "gui" | "user" => format!("{}/{}", domain, uid()?),
                _ => domain.to_string(),
            };
            self.run_write(domain, &["bootstrap".into(), full_domain, path.to_string()])
        } else {
            Err(format!("服务 {} 未加载且无 plist 路径，无法重启", label))
        }
    }

    fn delete_service(&self, domain: &str, label: &str, plist_path: &str) -> Result<(), String> {
        if plist_path.starts_with("/System/Library") {
            return Err("系统自带服务受 SIP 保护，无法删除".to_string());
        }

        // 已加载的服务先卸载并等待状态收敛；卸载失败（如取消管理员授权）则中止
        if self.is_loaded(domain, label) {
            self.stop(domain, label)?;
        }

        // 先备份：备份不完整则不删原文件
        let root = backup_root()?;
        let info = backup_create_at(&root, domain, label, plist_path, now_ms())?;

        // 删除原文件：/Library 下需 root
        let result = if plist_path.starts_with("/Library/") {
            privileged_shell(&format!("rm -f {}", shell_quote(plist_path)))
        } else {
            std::fs::remove_file(plist_path).map_err(|e| format!("删除 plist 失败: {}", e))
        };
        result.map_err(|e| {
            format!(
                "已备份到 {}，但删除原文件失败: {}",
                info.id, e
            )
        })
    }

    fn list_backups(&self) -> Result<Vec<BackupInfo>, String> {
        backup_list_at(&backup_root()?)
    }

    fn restore_backup(&self, backup_id: &str) -> Result<(), String> {
        let root = backup_root()?;
        let (dir, info) = backup_read_at(&root, backup_id)?;
        let src = dir.join(&info.file_name);
        if !src.is_file() {
            return Err(format!("备份文件缺失: {}", src.display()));
        }

        // 同名服务已加载则先卸载，避免覆盖运行中服务的 plist
        if self.is_loaded(&info.domain, &info.label) {
            self.stop(&info.domain, &info.label)?;
        }

        backup_copy_back(&src, &info.original_path)
    }

    fn delete_backup(&self, backup_id: &str) -> Result<(), String> {
        backup_delete_at(&backup_root()?, backup_id)
    }

    fn clear_backups(&self) -> Result<(), String> {
        backup_clear_at(&backup_root()?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 唯一临时目录（不引入 tempfile 依赖）
    fn temp_base(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ssh-backup-test-{}-{}-{}",
            tag,
            std::process::id(),
            now_ms()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn create_list_restore_roundtrip() {
        let base = temp_base("roundtrip");
        let root = base.join("backups");
        let plist = base.join("com.test.foo.plist");
        std::fs::write(&plist, "<plist><key>Label</key></plist>").unwrap();

        let info =
            backup_create_at(&root, "gui", "com.test.foo", &plist.to_string_lossy(), 1234).unwrap();
        assert_eq!(info.label, "com.test.foo");
        assert_eq!(info.original_path, plist.to_string_lossy());
        assert!(root.join(&info.id).join("service.plist").is_file());

        let list = backup_list_at(&root).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, info.id);

        // 删除原文件后从备份还原，内容一致
        std::fs::remove_file(&plist).unwrap();
        let (dir, meta) = backup_read_at(&root, &info.id).unwrap();
        assert_eq!(meta.label, "com.test.foo");
        backup_copy_back(&dir.join(&meta.file_name), &meta.original_path).unwrap();
        assert_eq!(
            std::fs::read_to_string(&plist).unwrap(),
            "<plist><key>Label</key></plist>"
        );

        backup_delete_at(&root, &info.id).unwrap();
        assert!(backup_list_at(&root).unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn sip_guard_rejects_system_path() {
        let err = LaunchctlBackend
            .delete_service(
                "system",
                "com.apple.test",
                "/System/Library/LaunchDaemons/com.apple.test.plist",
            )
            .unwrap_err();
        assert!(err.contains("SIP"));
    }

    #[test]
    fn missing_or_broken_meta_is_skipped() {
        let base = temp_base("badmeta");
        let root = base.join("backups");
        std::fs::create_dir_all(root.join("junk-dir")).unwrap();
        std::fs::write(root.join("junk-dir").join("meta.json"), "not json").unwrap();
        std::fs::create_dir_all(root.join("no-meta-dir")).unwrap();
        assert!(backup_list_at(&root).unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn traversal_id_rejected() {
        let base = temp_base("traversal");
        let root = base.join("backups");
        std::fs::create_dir_all(&root).unwrap();
        assert!(backup_read_at(&root, "../escape").is_err());
        assert!(backup_read_at(&root, "a/b").is_err());
        assert!(backup_read_at(&root, "..").is_err());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn dir_name_collision_gets_suffix() {
        let base = temp_base("collision");
        let root = base.join("backups");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(root.join("1000-com.test.foo")).unwrap();
        assert_eq!(unique_dir_name(&root, "1000-com.test.foo"), "1000-com.test.foo-2");
        let _ = std::fs::remove_dir_all(&base);
    }
}
