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
| D006 | 服务删除 = 先备份后删除：备份存 `~/Library/Application Support/SysServiceHelper/backups/<epoch_ms>-<label>/`（plist 副本 + meta.json），恢复只还原 plist 文件不自动加载启动，备份完全手动管理（恢复/单删/清空），不自动清理 | 先复制备份成功才允许删原文件；/System/Library 服务受 SIP 保护一律拒绝删除（前端禁用 + 后端拦截）；system 域文件操作沿用 osascript 提权路径 | 2026-09-23 |
| D007 | i18n：前端用 i18next + react-i18next（资源 JSON 内联打包）；语言偏好存 plugin-store `settings.json` 的 `language` 键（auto/zh-CN/en，默认 auto=经 `get_system_locale` 命令探测系统语言）；列表页提供手动切换。系统 locale 仅简体中文（zh-Hans*/zh-CN/zh-SG）映射中文，其余一律英文 | 两份字典（zh-CN/en）必须同步维护；缺失键回退英文；检测/偏好持久化失败都不阻塞 UI（回退 auto→英文） | 2026-09-23 |
| D008 | 后端用户可见错误文案（约 23 条）在 Rust 侧查表翻译（`src-tauri/src/i18n.rs`，模块级语言由前端启动/切换时调 `set_language` 命令同步），不引入错误码协议、不改 `ServiceBackend` trait 签名 | launchctl/osascript 的原始 stderr 与 `raw_print` 输出是外部工具结果，保持原文不翻译；该规模下错误码改造成本不成比例 | 2026-09-23 |
| D009 | 项目以 MIT License 开源（GitHub 仓库 public）；提交作者邮箱保留现状不重写历史；README 采用英文主文档 + `README.zh-CN.md` 双语结构 | 开源不可无 LICENSE（默认保留所有权利）；不为隐私顾虑改写 git 历史（哈希全变、协作成本不成比例） | 2026-09-23 |
| D010 | 更名 SysServiceHelper → LaunchDeck：原名太泛、与 launchd 服务管理功能不搭；新名「控制甲板」隐喻直指功能，搜索无冲突（避开 LaunchControl/Lingon），且利于品牌化（图标/周边） | 名称须一眼关联 launchd 服务管理；不与该领域现有工具（LaunchControl、Lingon X）撞名 | 2026-09-23 |
