#!/usr/bin/env bash
# 构建 macOS 分发包：tauri build -> ad-hoc 重签 -> 签名校验 -> zip
# 用法：pnpm dist:macos（或 bash scripts/dist-macos.sh）
set -euo pipefail

cd "$(dirname "$0")/.."

APP_NAME="SysServiceHelper"
VERSION=$(node -p "require('./package.json').version")
ARCH=$(uname -m)
APP_PATH="src-tauri/target/release/bundle/macos/${APP_NAME}.app"
OUT_DIR="dist-app"

# 只打 .app bundle（DMG 用不上，跳过以加快构建）
pnpm tauri build --bundles app

# Tauri 打包后的 bundle 签名不完整（缺 _CodeSignature），复制到其他机器会被
# Gatekeeper 判为"已损坏"；这里统一 ad-hoc 重签
codesign --force --deep --sign - "$APP_PATH"

codesign --verify --deep --strict "$APP_PATH"
echo "✔ 签名校验通过: $APP_PATH"

mkdir -p "$OUT_DIR"
ZIP_PATH="${OUT_DIR}/${APP_NAME}_${VERSION}_${ARCH}.zip"
rm -f "$ZIP_PATH"
ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"

echo "✔ 分发包已生成: $ZIP_PATH"
echo "目标机安装：解压到「应用程序」后执行一次 xattr -cr /Applications/${APP_NAME}.app"
