use crate::models::{ServiceDetail, ServiceInfo};
use crate::service::ServiceBackend;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;

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
            // 转义反斜杠与双引号，嵌入 do shell script "..."
            let escaped = cmd.replace('\\', "\\\\").replace('"', "\\\"");
            let script = format!("do shell script \"{}\" with administrator privileges", escaped);
            run_cmd("osascript", &["-e", &script])?;
            Ok(())
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
            self.run_write(domain, &["kickstart".into(), "-k".into(), target])
        } else if let Some(path) = plist_path {
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
        self.run_write(domain, &["bootout".into(), target])
    }

    fn restart(&self, domain: &str, label: &str, plist_path: Option<&str>) -> Result<(), String> {
        if self.is_loaded(domain, label) {
            let target = expand_target(&format!("{}/{}", domain, label));
            return self.run_write(domain, &["kickstart".into(), "-k".into(), target]);
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
}
