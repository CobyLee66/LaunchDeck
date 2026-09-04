# SysServiceHelper

基于 Tauri 2 + React 的 macOS 系统服务管理工具。

## 开发

```bash
pnpm install
pnpm tauri dev
```

## 构建 macOS 分发包

```bash
pnpm dist:macos
```

脚本会执行 `tauri build`（仅 .app bundle）、对产物做 ad-hoc 重签（修复 Tauri 打包后 bundle 签名不完整的问题）、校验签名，并在 `dist-app/` 下生成 zip 分发包。

> 产物为 ad-hoc 签名、未做 Apple 公证（无付费开发者账号），复制到其他电脑首次打开需要放行一次，见下文。

## 在另一台 Mac 上安装

1. 把 `dist-app/SysServiceHelper_<版本>_<架构>.zip` 传到目标机（AirDrop / 微信 / 网盘均可）；
2. 解压，把 `SysServiceHelper.app` 拖入「应用程序」；
3. 终端执行一次（放行 Gatekeeper）：

   ```bash
   xattr -cr /Applications/SysServiceHelper.app
   ```

   不想用命令行也可以：双击打开，然后在「系统设置 → 隐私与安全性」里点「仍要打开」；
4. 之后即可正常打开使用。

## 说明

- 当前产物为 Apple Silicon（arm64）单架构，适用于 M 系列芯片的 Mac；如需支持 Intel Mac，用 `pnpm tauri build --target universal-apple-darwin` 构建（需先 `rustup target add aarch64-apple-darwin x86_64-apple-darwin`）。
- 若未来加入 Apple Developer Program，可在 `src-tauri/tauri.conf.json` 的 `bundle.macOS.signingIdentity` 配置 Developer ID 证书并公证，届时目标机双击即可直接打开，无需第 3 步。
