# SysServiceHelper 项目规范

## 项目

基于 Tauri 2 + React + TypeScript 的 macOS 系统服务（launchd）管理工具：扫描 LaunchDaemons/LaunchAgents，查看服务详情，执行 start/stop/restart。Rust 后端经 `ServiceBackend` trait 抽象，平台差异收敛在后端实现。

## 构建与验证

- 包管理用 pnpm，不要混用 npm/yarn。
- 前端/TS 改动：`pnpm build`（含 tsc 类型检查）；整应用开发调试：`pnpm tauri dev`（Rust 改动也用它编译验证）。
- 发布构建：`pnpm dist:macos`（tauri build + ad-hoc 重签 + `codesign --verify` 自检 + 产出 `dist-app/` 分发 zip）。

## 代码约定

- UI 文案经 i18n 维护：组件里只写 `t()` 键，新增文案必须同步补 `src/i18n/locales/zh-CN.json` 与 `en.json` 两份字典；后端用户可见文案在 `src-tauri/src/i18n.rs` 查表。语言只支持简体中文与英文，其它系统语言回退英文。代码注释仍用中文。
- 平台相关逻辑只写在 Rust 侧后端实现里（`src-tauri/src/`）；前端不直接接触平台 API。
- 发版递增版本号时，`src-tauri/tauri.conf.json` 与 `package.json` 两处 `version` 必须同步改。

## 进度与决策文档

- **`PROGRESS.md` / `DECISIONS.md` 是跨会话上下文的唯一落盘处**：稳定约束必须写入文件（AGENTS.md / DECISIONS.md / README.md），禁止依赖会话记忆——自动摘要会丢早期指令。
- **新会话启动必读 `PROGRESS.md`**（了解当前进度与待办）；涉及架构/技术选型的工作再读 `DECISIONS.md`。
- **进度更新时机**：每完成一个功能单元（一个界面、一个模块、一个 bugfix）立即更新 `PROGRESS.md`，不攒到会话结束。
- **上下文降级协议**：当用户反复纠正「我之前说过」时，说明上下文已降级，应主动建议开新会话，并从 AGENTS.md + PROGRESS.md + DECISIONS.md 重建上下文。

### Decision Recording

涉及技术选型、架构取舍、方案否决时，必须记入 `DECISIONS.md`。

- **格式**：表格条目——ID（D0XX 顺序编号）+ 决策 + 不可让步点 + 日期；只记「为什么」，不复述「是什么」（实现细节在代码里）。
- **修订/推翻**：用新 ID 引用旧 ID（如「修订 D004：…」），旧条目保留不删，保持可追溯。
- **归档触发（按内容量）**：活跃决策 > 50 条或文件 > 15KB 时，把已修订/已推翻/纯调研结论类移入 `DECISIONS_ARCHIVE.md`；保留仍构成当前代码约束的决策。归档 ≠ 删除，`D0XX` 编号是稳定锚点，其他文档引用编号即可定位。

### PROGRESS.md 维护

- **结构**：当前状态（进行中 / 最近完成 / 待办下一步）；版本锚点用 `tauri.conf.json` 的 `version`。
- **条目要素**：`[x]` 标题（功能名 + 日期 + 版本 + 关联决策 ID）+ 一句话结果 + **⚠ 踩坑**（跨会话最有价值的部分，必须写）。
- **归档触发**：已完成条目 > 25 条或文件 > 20KB 时，压缩为一行摘要（功能名 + 日期 + 一句话 + 关键踩坑）移入 `PROGRESS_ARCHIVE.md`。

## 参考文档维护

| 文档 | 内容 | 读取时机 |
|------|------|---------|
| `README.md` | 构建、分发、目标机安装（Gatekeeper 放行）步骤 | 构建/分发/装机时 |

**【强制】**改构建/分发流程或安装要求后，同步更新 `README.md`。

## 会话收尾检查清单

- [ ] `PROGRESS.md` 已更新（完成 / 进行中 / 待办下一步）
- [ ] `DECISIONS.md` 已更新（如有架构/选型决策）
- [ ] `README.md` 已同步（如构建/分发/安装流程变更）
