<div align="center">

# SysServiceHelper

**轻量级 macOS launchd 服务管理工具 —— 用一个干净、快速的本地图形界面，扫描、查看并管理 LaunchDaemons / LaunchAgents。**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/CobyLee66/SysServiceHelper)](https://github.com/CobyLee66/SysServiceHelper/releases)
![Platform](https://img.shields.io/badge/platform-macOS%2011%2B%20Apple%20Silicon-lightgrey)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB?logo=tauri)](https://tauri.app)

[English](README.md) | 简体中文

</div>

---

macOS 没有自带 launchd 服务的管理界面——`launchctl` 功能强大但对普通用户不友好，散落在 LaunchDaemons / LaunchAgents 各目录里的第三方服务更是难以追踪。SysServiceHelper 把这些装进一个窗口：看清 Mac 上的每一个服务、谁在运行、谁会自启动，并可以直接启动 / 停止 / 重启 / 安全删除。

基于 **Tauri 2 + React + Rust** 构建：安装包小、常驻资源占用近乎为零，所有平台逻辑收敛在 Rust 后端。

## 功能特性

- **全量服务扫描** —— 静态扫描 5 个 plist 目录（`/System/Library/LaunchDaemons`、`/System/Library/LaunchAgents`、`/Library/LaunchDaemons`、`/Library/LaunchAgents`、`~/Library/LaunchAgents`），并与 `launchctl print` 实时解析的运行态（system / gui / user 三个 domain）合并，含 PID 与上次退出码
- **搜索与筛选** —— 按标签搜索；按来源（系统 / 第三方）、状态（运行中 / 已停止）、自启动行为（RunAtLoad / KeepAlive）筛选
- **收藏** —— 星标常用服务并置顶显示
- **启动 / 停止 / 重启** —— 操作后等待 launchd 状态真正收敛再刷新界面，不会出现「刚停止却还显示运行中」的假状态
- **删除前自动备份** —— 删除服务时先卸载，把 plist（连同元数据）备份到本地备份区，确认备份成功后才删除原文件；内置备份管理页可随时恢复 / 删除 / 清空备份
- **SIP 防护** —— `/System/Library` 下的系统关键服务禁止删除（前端禁用 + 后端拦截双重防护）
- **服务详情** —— 标签、domain、状态与 PID、上次退出码、RunAtLoad / KeepAlive、plist 路径、程序路径、完整 plist 键值表，以及原始 `launchctl print` 输出
- **中英双语界面** —— 自动跟随系统语言，也可在工具栏手动切换（简体中文 / English）
- **深色主题**

## 工作原理

- 服务状态**始终实时**经 `launchctl print <domain>` 查询解析，不维护本地缓存——你看到的就是 launchd 眼中的状态。
- `launchctl` 写操作是异步语义（命令返回时状态尚未生效），因此后端会轮询等待服务收敛到目标状态（或超时）后才报告操作结果。
- 所有平台逻辑收敛在 Rust 侧的 `ServiceBackend` trait 之后，前端只调用 Tauri commands，不接触任何平台 API。

## 权限与安全

- 应用以普通用户身份运行，用户域操作无需提权。
- 写入 **system 域**（`/Library/LaunchDaemons` 下的服务）时会弹出标准的 macOS 管理员授权对话框（经 `osascript`），系统对同一应用的授权有几分钟缓存。
- **删除必先备份**：plist 被复制到 `~/Library/Application Support/SysServiceHelper/backups/<时间戳>-<标签>/`（附 `meta.json`），复制成功才删除原文件；备份不完整会自动回滚。
- 恢复备份到 `/Library` 时走提权复制以保留 root 属主，且拒绝覆盖当前已加载服务的 plist。
- 备份 ID 做路径穿越校验；一切都在本机完成——不联网、无遥测。

## 系统要求

- macOS 11（Big Sur）或更高版本
- Apple Silicon（arm64）。Intel Mac 请自行构建 universal 包（见下文）。

## 安装

1. 从 [最新 Release](https://github.com/CobyLee66/SysServiceHelper/releases) 下载 `SysServiceHelper_<版本>_aarch64.zip`；
2. 解压，把 `SysServiceHelper.app` 拖入「应用程序」；
3. 首次打开——应用为 ad-hoc 签名、未做 Apple 公证（无付费开发者账号），macOS 会拦截一次。在终端执行：

   ```bash
   xattr -cr /Applications/SysServiceHelper.app
   ```

   或者双击打开后，在「系统设置 → 隐私与安全性」里点「仍要打开」；
4. 之后即可正常使用，此步骤只需一次。

## 从源码构建

前置要求：[Node.js](https://nodejs.org) ≥ 18、[pnpm](https://pnpm.io)、[rustup](https://rustup.rs) 安装的 Rust 工具链（默认含 macOS target）。详见 [Tauri 官方前置条件](https://tauri.app/start/prerequisites/)。

```bash
# 安装依赖
pnpm install

# 开发模式运行（前端 + Rust 热重载）
pnpm tauri dev

# 前端类型检查 + 生产构建
pnpm build

# 构建 macOS 分发包：
# tauri build（仅 .app）→ ad-hoc 重签 → 签名校验 → 在 dist-app/ 生成 zip
pnpm dist:macos
```

> 发布产物为 **arm64 单架构**。如需支持 Intel Mac，用 `pnpm tauri build --target universal-apple-darwin` 构建（先执行 `rustup target add aarch64-apple-darwin x86_64-apple-darwin`）。
>
> 若你有付费 Apple Developer 账号，可在 `src-tauri/tauri.conf.json` 的 `bundle.macOS.signingIdentity` 配置 Developer ID 证书并公证，目标机即可双击直接打开，无需 Gatekeeper 放行步骤。

## 技术栈

| 层 | 选型 |
|----|------|
| 应用框架 | Tauri 2（Rust 后端，最小权限 capabilities：`core` + `store`） |
| 前端 | React 18 + TypeScript + Vite，i18next（简体中文 / English） |
| 后端 | Rust：`launchctl` 进程解析、`plist` 解码、`sys-locale`、tauri-plugin-store |
| 架构 | `ServiceBackend` trait 隔离平台逻辑；无状态实时查询 |

## 许可证

本项目基于 [MIT License](LICENSE) 开源。
