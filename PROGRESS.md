# PROGRESS.md — 项目进度（当前状态）

> 记录跨会话的开发进度，确保新会话能快速接续。维护规则见 AGENTS.md「进度与决策文档」段。
> 版本锚点用 `src-tauri/tauri.conf.json` 的 `version`（与 `package.json` 同步改）；已完成条目 > 25 条或本文件 > 20KB 时，压缩为一行摘要移入 `PROGRESS_ARCHIVE.md`。

---

## 当前状态（截至 2026-09-05，version 0.1.0）

### 进行中

- （当前无进行中事项；v0.1.0 已可用，分发链路已验证）

### 最近完成

- [x] 项目初版 v0.1.0（2026-09-01，D001~D003）— Tauri 2 + React + TS：服务列表/筛选/详情（FilterBar/ServiceList/ServiceDetail 三个组件），start/stop/restart；Rust 侧 `LaunchctlBackend` 扫描 /System/Library、/Library、~/Library 下的 LaunchDaemons/LaunchAgents 五个目录，运行态经 `launchctl print <domain>` 解析 services 段（pid/上次退出码）
- [x] 分发链路 `scripts/dist-macos.sh`（2026-09-01，D004/D005）— 修复「App 复制到另一台 Mac 打不开（报已损坏）」：根因是 Tauri 打包产物只有 linker 的 ad-hoc 签名、bundle 缺 `_CodeSignature`，传输带上 quarantine 标记后 Gatekeeper 校验失败；脚本在 tauri build 后 `codesign --force --deep --sign -` 重签 + `codesign --verify --deep --strict` 自检（失败即退出）+ `ditto -c -k` 打 zip（保留权限元数据，比 Finder 压缩可靠）；README 记录目标机 `xattr -cr` 放行步骤。⚠ 踩坑：未公证（无付费开发者账号）时 `spctl` 显示「未公证」属正常，不影响 xattr 放行后使用
- [x] minimumSystemVersion 设 10.15 + 应用图标（2026-09-01）— Tauri 默认 10.13 与 arm64 实际要求不符。⚠ 注意：arm64 产物实际只能跑 macOS 11+，10.15 仅是 bundle 声明下限

### 待办 / 下一步

- [ ] （候选，均未启动）Intel/universal 构建（README 已记录 `--target universal-apple-darwin` 方法）；接入 Developer ID 证书 + 公证（需 Apple Developer Program）；Windows 等其他平台后端（`ServiceBackend` trait 已预留）
