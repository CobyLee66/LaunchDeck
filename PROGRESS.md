# PROGRESS.md — 项目进度（当前状态）

> 记录跨会话的开发进度，确保新会话能快速接续。维护规则见 AGENTS.md「进度与决策文档」段。
> 版本锚点用 `src-tauri/tauri.conf.json` 的 `version`（与 `package.json` 同步改）；已完成条目 > 25 条或本文件 > 20KB 时，压缩为一行摘要移入 `PROGRESS_ARCHIVE.md`。

---

## 当前状态（截至 2026-09-23，version 0.2.0）

### 进行中

- （当前无进行中事项）

### 最近完成

- [x] 服务删除 + 备份恢复 + 备份管理页（2026-09-23，v0.2.0，D006）— 列表页/详情页新增「删除」：已加载服务先 bootout + `wait_until_state` 收敛，复制 plist + meta.json 到 `~/Library/Application Support/SysServiceHelper/backups/<epoch_ms>-<label>/`，再删原文件（/Library 走 osascript 提权 `rm -f`，~/Library 直接 `fs::remove_file`）；新增「备份管理」页（`BackupManager`，列表页右上入口）支持恢复/单条删除/一键清空，全部走确认弹窗；新增自研 `ConfirmModal` 组件（项目首个弹窗组件）。⚠ 踩坑：(1) /System/Library 服务受 SIP 保护，连 root 也删不掉，必须前端禁用 + 后端拦截双重防护；(2) 备份必须「先复制成功才允许删原文件」，备份半成品（复制/meta 写入失败）要回滚删掉子目录；(3) 恢复到 /Library 的 plist 必须提权 `cp`（保持 root 属主与常规 LaunchDaemon 一致），恢复前若同名服务已加载要先 bootout，否则覆盖运行中服务的 plist；(4) 备份 id 即子目录名，读写前必须校验拒绝 `/`、`..`（路径穿越）

- [x] bugfix：停止服务后列表状态不刷新为「已停止」（2026-09-05，v0.1.1）— 根因：`launchctl bootout` 立即返回（launchd 已受理），但进程退出有延迟，忽略 SIGTERM 的进程会滞留约 6~9 秒才被 SIGKILL，期间 `launchctl print` 仍显示带 pid 的运行中；前端 bootout 返回后立即刷新拿到的就是旧状态。修复：Rust 侧新增 `service_pid()`（服务级 print 解析 pid）+ `wait_until_state()` 轮询，stop/start(已加载)/restart 返回前等待状态收敛（stop 15s、start/restart 8s 超时，超时不报错）；前端操作成功后 3 秒再补偿刷新一次。⚠ 踩坑：launchctl 写操作是异步语义——命令成功 ≠ 状态已生效，任何「操作后立即读状态」的逻辑都必须轮询收敛，实测普通脚本进程 bootout 后立即消失、stubborn（trap TERM）进程滞留 6~9 秒

- [x] 项目初版 v0.1.0（2026-09-01，D001~D003）— Tauri 2 + React + TS：服务列表/筛选/详情（FilterBar/ServiceList/ServiceDetail 三个组件），start/stop/restart；Rust 侧 `LaunchctlBackend` 扫描 /System/Library、/Library、~/Library 下的 LaunchDaemons/LaunchAgents 五个目录，运行态经 `launchctl print <domain>` 解析 services 段（pid/上次退出码）
- [x] 分发链路 `scripts/dist-macos.sh`（2026-09-01，D004/D005）— 修复「App 复制到另一台 Mac 打不开（报已损坏）」：根因是 Tauri 打包产物只有 linker 的 ad-hoc 签名、bundle 缺 `_CodeSignature`，传输带上 quarantine 标记后 Gatekeeper 校验失败；脚本在 tauri build 后 `codesign --force --deep --sign -` 重签 + `codesign --verify --deep --strict` 自检（失败即退出）+ `ditto -c -k` 打 zip（保留权限元数据，比 Finder 压缩可靠）；README 记录目标机 `xattr -cr` 放行步骤。⚠ 踩坑：未公证（无付费开发者账号）时 `spctl` 显示「未公证」属正常，不影响 xattr 放行后使用
- [x] minimumSystemVersion 设 10.15 + 应用图标（2026-09-01）— Tauri 默认 10.13 与 arm64 实际要求不符。⚠ 注意：arm64 产物实际只能跑 macOS 11+，10.15 仅是 bundle 声明下限

### 待办 / 下一步

- [ ] （候选，均未启动）Intel/universal 构建（README 已记录 `--target universal-apple-darwin` 方法）；接入 Developer ID 证书 + 公证（需 Apple Developer Program）；Windows 等其他平台后端（`ServiceBackend` trait 已预留）
