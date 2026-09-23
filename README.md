<div align="center">

# LaunchDeck

**A lightweight macOS launchd service manager — scan, inspect, and control LaunchDaemons / LaunchAgents from a clean, fast native GUI.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/CobyLee66/LaunchDeck)](https://github.com/CobyLee66/LaunchDeck/releases)
![Platform](https://img.shields.io/badge/platform-macOS%2011%2B%20Apple%20Silicon-lightgrey)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB?logo=tauri)](https://tauri.app)

English | [简体中文](README.zh-CN.md)

</div>

---

macOS has no built-in GUI for managing launchd services — `launchctl` is powerful but unfriendly, and third-party services scattered across LaunchDaemons / LaunchAgents directories are hard to keep track of. LaunchDeck gives you a single window to see every service on your Mac, what's running, what auto-starts, and full control to start / stop / restart / safely delete them.

Built with **Tauri 2 + React + Rust**: a tiny bundle, near-zero idle footprint, and all platform logic behind a Rust-side backend.

## Features

- **Full service scan** — statically scans 5 plist directories (`/System/Library/LaunchDaemons`, `/System/Library/LaunchAgents`, `/Library/LaunchDaemons`, `/Library/LaunchAgents`, `~/Library/LaunchAgents`) and merges in live runtime state parsed from `launchctl print` (system / gui / user domains), including PID and last exit code
- **Search & filter** — search by label; filter by source (system / third-party), status (running / stopped), and auto-start behavior (RunAtLoad / KeepAlive)
- **Favorites** — star frequently-used services, pinned to the top of the list
- **Start / Stop / Restart** — the app waits for launchctl to *actually converge* to the new state before refreshing, so the UI never shows a stale status right after an operation
- **Delete with backup** — deleting a service unloads it, backs up its plist (plus metadata) to a local backup store, and only then removes the original file. A built-in backup manager lets you restore, delete, or clear backups at any time
- **SIP-aware safety** — system-critical services under `/System/Library` cannot be deleted (disabled in the UI and rejected in the backend)
- **Service details** — label, domain, status + PID, last exit code, RunAtLoad / KeepAlive, plist path, program, the full plist key/value table, and the raw `launchctl print` output
- **Bilingual UI** — Simplified Chinese and English, auto-detected from your system language, switchable in the toolbar
- **Dark theme**

## How It Works

- Service status is **always queried live** via `launchctl print <domain>` — there is no local state cache, so what you see is what launchd sees.
- Because `launchctl` write operations are asynchronous (the command returns before the state changes), the backend polls until the service converges to the expected state (or times out) before reporting success.
- All platform logic lives behind a Rust-side `ServiceBackend` trait; the front end only calls Tauri commands and never touches platform APIs.

## Permissions & Safety

- The app runs as a normal user application. Operations on your own user domain need no elevation.
- Writing to the **system domain** (services in `/Library/LaunchDaemons`) triggers the standard macOS administrator authorization dialog (via `osascript`); authorization is cached by the system for a few minutes.
- **Delete is backup-first**: the plist is copied to `~/Library/Application Support/LaunchDeck/backups/<timestamp>-<label>/` together with a `meta.json`; only after the copy succeeds is the original file removed. Incomplete backups are rolled back automatically.
- Restoring a backup to `/Library` uses an elevated copy to preserve root ownership, and refuses to overwrite the plist of a currently loaded service.
- Backup IDs are validated against path traversal; everything stays on your machine — no network, no telemetry.

## Requirements

- macOS 11 (Big Sur) or later
- Apple Silicon (arm64). For Intel Macs, build a universal binary yourself (see below).

## Install

1. Download `LaunchDeck_<version>_arm64.zip` from the [latest release](https://github.com/CobyLee66/LaunchDeck/releases).
2. Unzip and drag `LaunchDeck.app` into **Applications**.
3. First launch — the app is ad-hoc signed and not notarized (no paid Apple Developer account), so macOS blocks it once. Either run:

   ```bash
   xattr -cr /Applications/LaunchDeck.app
   ```

   or double-click the app and click **Open Anyway** in *System Settings → Privacy & Security*.
4. Launch and enjoy. This step is only needed once.

## Build from Source

Prerequisites: [Node.js](https://nodejs.org) ≥ 18, [pnpm](https://pnpm.io), and the Rust toolchain via [rustup](https://rustup.rs) (macOS target included by default). See [Tauri's prerequisites](https://tauri.app/start/prerequisites/) for details.

```bash
# install dependencies
pnpm install

# run in development (frontend + Rust hot reload)
pnpm tauri dev

# frontend type-check + production build
pnpm build

# build the macOS distribution package:
# tauri build (.app) → ad-hoc re-sign → codesign verify → zip in dist-app/
pnpm dist:macos
```

> The release build targets **arm64 only**. To support Intel Macs, build with `pnpm tauri build --target universal-apple-darwin` (run `rustup target add aarch64-apple-darwin x86_64-apple-darwin` first).
>
> If you have a paid Apple Developer account, you can set `bundle.macOS.signingIdentity` in `src-tauri/tauri.conf.json` to a Developer ID certificate and notarize the app, eliminating the Gatekeeper bypass step for end users.

## Tech Stack

| Layer | Choice |
|-------|--------|
| App shell | Tauri 2 (Rust backend, minimal capabilities: `core` + `store`) |
| Front end | React 18 + TypeScript + Vite, i18next (zh-CN / en) |
| Back end | Rust: `launchctl` process parsing, `plist` decoding, `sys-locale`, tauri-plugin-store |
| Architecture | `ServiceBackend` trait isolating platform logic; stateless real-time queries |

## License

This project is licensed under the [MIT License](LICENSE).
