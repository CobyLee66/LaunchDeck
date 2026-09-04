# DECISIONS.md — 决策日志

> 记录影响架构、技术选型、设计取舍的关键决策。只记「为什么」，不复述「是什么」（实现细节在代码里）。
> 维护规则（记录时机/格式/修订与归档）见 AGENTS.md「Decision Recording」段；引用 `D0XX` 编号即可定位。

---

## 活跃决策

| ID | 决策 | 不可让步 | 日期 |
|----|------|---------|------|
| D001 | Tauri 2 + React + TypeScript 技术栈（轻量本地系统工具，无后端服务、无云依赖） | 不引重量级框架/运行时 | 2026-09-01 |
| D002 | 平台差异收敛在 Rust 侧 `ServiceBackend` trait（list/detail/start/stop/restart），前端只经 Tauri commands 调用 | 前端不直接接触平台 API；新增平台只加后端实现（trait 注释明示为 Windows 等平台预留） | 2026-09-01 |
| D003 | 服务运行态一律实时经 `launchctl print <domain>` 获取并解析，不维护本地状态缓存 | plist 目录只做静态扫描；运行状态以 launchctl 输出为准 | 2026-09-01 |
| D004 | 分发链路：tauri build 后 ad-hoc 重签（`--force --deep --sign -`）+ `codesign --verify` 自检 + `ditto` 打 zip，目标机 `xattr -cr` 放行 | 不做公证（无付费开发者账号）；分发脚本必须自带签名校验，失败即退出 | 2026-09-01 |
| D005 | 只出 Apple Silicon（arm64）单架构包，不做 universal | 支持 Intel 时再显式加 `--target universal-apple-darwin`（需先 rustup 加 target） | 2026-09-01 |
