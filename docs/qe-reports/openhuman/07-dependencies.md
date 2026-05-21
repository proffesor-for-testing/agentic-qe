# OpenHuman — Dependency Surface Map

**Scope:** `/tmp/openhuman` @ working copy (project version `0.54.3`, Rust toolchain pinned at `1.93.0`)
**Method:** static manifest + lockfile inspection. No `cargo build` / `pnpm install` run.
**Sources of truth:** 2 `Cargo.toml`, 2 `Cargo.lock`, 4 `package.json`, 2 `pnpm-lock.yaml`.

---

## 1. Workspace structure overview

OpenHuman is **NOT a Cargo workspace**. The root `Cargo.toml` has no `[workspace]` table — it is a single crate (`openhuman` v0.54.3) that exposes `lib.rs` + 5 binaries, with `app/src-tauri/Cargo.toml` declaring a **separate, non-member crate** (`OpenHuman` v0.54.3) that depends on the core via `openhuman_core = { path = "../..", package = "openhuman" }`. The two crates therefore have **two independent `Cargo.lock` files** (914 packages in root, 988 in tauri, 786 unique combined).

The pnpm side **is** a workspace, but a trivially small one — `pnpm-workspace.yaml` lists only `"app"`. There are 4 `package.json` files but only 2 are workspace members (`./` and `./app`). `remotion/` and `packages/npm/` are unmanaged and not picked up by pnpm.

### Members at a glance

| Manifest | Kind | Version | Direct deps (runtime / dev) | Role |
|---|---|---|---|---|
| `Cargo.toml` | crate `openhuman` | 0.54.3 | 98 + 2 = **100** declared (105 resolved in lock) | Core sidecar: RPC server, agents, memory, integrations, embedded HTTP/JSON-RPC, audio (whisper), wallet (ethers), email (lettre+imap), Matrix, WhatsApp |
| `app/src-tauri/Cargo.toml` | crate `OpenHuman` | 0.54.3 | 33 + 2 = **35** | Desktop shell. Embeds `openhuman_core` in-process, wraps CEF via `tauri-runtime-cef`, plus deep-link / single-instance / updater plugins |
| `package.json` | workspace root | — | 1 + 3 = **4** | Pnpm pass-through scripts; husky/tsx/ws toolchain |
| `app/package.json` | `openhuman-app` | 0.54.3 | 37 + 41 = **78** | React 19 + Vite + Redux Toolkit frontend; Tauri JS API; WDIO E2E |
| `remotion/package.json` | `remotion` | 1.0.0 | 9 + 6 = **15** | Mascot video assets pipeline (separate from pnpm workspace) |
| `packages/npm/package.json` | `openhuman` | 0.0.0 | 0 + 0 = **0** | Tiny postinstall installer stub for `npm i -g openhuman` |

### Source size (for context, not strictly dependencies)

- **Rust core:** 1,217 `.rs` files, **~415k LOC** across `src/`.
- **Frontend:** 817 `.ts`/`.tsx` files, **~158k LOC** across `app/src/`.
- **Vendored Rust forks** sit in `app/src-tauri/vendor/{tauri-cef, tauri-plugin-notification}` (git-submodule pinned).

### High-level graph (Rust side, by file count)

```
openhuman_core (1 crate, ~150 modules)
   ├── memory       (62k LOC, 146 incoming imports — central hub)
   ├── agent        (45k LOC, 220 outgoing imports — the orchestrator)
   ├── tools        (38k LOC, 224 outgoing imports — most outgoing of any module)
   ├── inference    (30k LOC, 114 incoming imports — second hub)
   ├── channels     (33k LOC, providers for discord/telegram/web/...)
   ├── composio     (26k LOC, third-party integrations)
   └── ~140 leaf modules

app/src-tauri (separate crate)
   └── openhuman_core (path dep) + tauri/CEF/plugins
```

---

## 2. Top 25 Rust dependencies (by importance / weight)

Selected from the **105 direct deps of `openhuman` in `Cargo.lock`**, prioritising heavy, sensitive, or risk-flagged crates. Versions are exact pins from `Cargo.lock`.

| # | Crate | Declared | Resolved | Role | Risk notes |
|---|---|---|---|---|---|
| 1 | `tokio` | `"1"` features = `["full","sync"]` | **1.52.3** | Async runtime — pulled in by basically everything | Heavy but safe. `features=full` ships all sub-features. |
| 2 | `reqwest` | `"0.12"` 8 features incl. both `rustls-tls` AND `native-tls` | **0.12.28** | HTTP client | Enabling BOTH `rustls-tls` and `native-tls` in one binary is a smell — usually one or the other. |
| 3 | `axum` | `"0.8"` default-features-off | **0.8.9** | RPC server (the `openhuman.*` JSON-RPC surface) | Current. |
| 4 | `rusqlite` | `"0.37"` features = `["bundled"]` | **0.37.0** | Embedded SQLite — backs `memory/store`, `memory/tree`, credentials | `bundled` ships an in-tree SQLite (build size +~3MB but no system dep). Also depended on transitively by `matrix-sdk-sqlite` and `whatsapp-rust-sqlite-storage`. |
| 5 | `postgres` | `"0.19"` | (resolved 0.19.x) | Sync Postgres client — present alongside SQLite | Unusual: sync `postgres` crate while everything else is async. Used where? worth a follow-up. |
| 6 | `rustls` | `"0.23"` features=`["ring"]` | **0.23.40** | TLS | Current. |
| 7 | `tokio-rustls` | `"0.26.4"` | 0.26.4 | TLS for tokio sockets | Current. |
| 8 | `ring` | `"0.17"` | 0.17.x | Crypto primitives (also via rustls) | OK. |
| 9 | `aes-gcm` | `"0.10"` | 0.10.x | Symmetric crypto (likely vault/credential encryption) | Standard RustCrypto. |
| 10 | `chacha20poly1305` | `"0.10"` | 0.10.x | Symmetric crypto (alt path) | Two AEADs in one binary — duplication worth checking. |
| 11 | `argon2` | `"0.5"` | 0.5.x | Password hashing | OK. |
| 12 | `whisper-rs` | `"0.16"` (+ git-patched `whisper-rs-sys`) | 0.16.0 | Local speech-to-text via whisper.cpp | **Heavy.** macOS path enables `metal` feature. `whisper-rs-sys` is forked at `tinyhumansai/whisper-rs-sys` (branch=`main`, no rev pin) for an MSVC `/MT` CRT fix on Windows — unstable. **No commit pin = non-reproducible build** when upstream branch advances. |
| 13 | `whisper-rs-sys` (`patch.crates-io`) | git branch=main | n/a | C++ bindings to whisper.cpp | Same fork issue as above. |
| 14 | `matrix-sdk` | `"0.16"` optional, e2e-encryption + rustls-tls + markdown | **0.16.1** | Optional Matrix channel | Pulls **massive** transitive set: `matrix-sdk-base/common/crypto/sqlite/indexeddb/store-encryption`, `vodozemac`, `ruma-signatures`, `matrix-pickle`. Causes the **Rust 1.94 pin** (rust-toolchain.toml says: "Pin below Rust 1.94 until matrix-sdk resolves recursion limit overflow in async — issue 6254"). Real blocker on toolchain upgrades. |
| 15 | `whatsapp-rust` | `"0.5"` optional | **0.5.0** | Optional WhatsApp Web channel | Mid-popularity ecosystem (`whatsapp-rust-sqlite-storage`, `wacore-*`, `wacore-libsignal`). Single-org maintainership. Comment in Cargo.toml admits this is a recent migration from a 0.2 fork (`wa-rs`). Watch for regressions. |
| 16 | `wacore` | `"0.5"` optional | 0.5 | WhatsApp protocol core | Same risk family as `whatsapp-rust`. |
| 17 | `ethers-core` + `ethers-signers` | `"2.0.14"` default-features-off | 2.0.14 | Wallet/signing for EVM keys | `ethers-rs` is **deprecated** upstream (the ethers-rs project recommends migration to `alloy`). Last release 2.0.x is old. Still functional but a known migration debt. |
| 18 | `lettre` | `"0.11.19"` rustls-tls only | 0.11.19 | SMTP send | OK. |
| 19 | `mail-parser` | `"0.11.2"` | 0.11.2 | RFC 5322 email parsing | OK; tracked by Stalwart team. |
| 20 | `async-imap` | `"0.11"` runtime-tokio | 0.11 | IMAP fetch | OK. |
| 21 | `socketioxide` | `"0.15"` features=`["extensions"]` | 0.15 | Socket.IO server | Small ecosystem, primarily one maintainer. Used by `webview_apis`/`socket`. |
| 22 | `tauri-runtime-cef` (in tauri lock only) | path = `vendor/tauri-cef/...` | **0.1.0** | CEF runtime fork | **Vendored as git submodule**; CEF support lives on `feat/cef` branch of `tauri-apps/tauri`. The fork is `tinyhumansai/tauri-cef` on `feat/cef-notification-intercept`. Submodule commit IS the pin, but if a contributor forgets `--recurse-submodules` they get nothing. |
| 23 | `cef` (tauri lock only) | `"=146.4.1"` exact pin | 146.4.1+146.0.9 | Chromium Embedded Framework Rust bindings | `cef-dll-sys` auto-downloads ~200MB of Chromium runtime on first build. Heavy. |
| 24 | `sentry` | `"0.47.0"` (root) and same (tauri) | 0.47.0 | Error reporting | Three separate Sentry projects (core, tauri shell, frontend). |
| 25 | `cpal` + `hound` + `enigo` + `rdev` + `arboard` | various 0.x | various | OS input/output: audio capture, keystroke synthesis, global hotkeys, clipboard | Heavy native FFI. `rdev` and `enigo` are notorious for permissions/security issues on macOS (require Accessibility/Input Monitoring grants); `rdev` historically has had silent input-event leakage on macOS — review usage. |

**Honourable mentions (not in top 25 but worth naming):**
- `prost = "0.14"` — protobuf, used by `opentelemetry-otlp`.
- `opentelemetry / opentelemetry_sdk / opentelemetry-otlp = "0.32"` — observability stack.
- `prometheus = "0.14"` — metrics endpoint.
- `fantoccini = "0.22.0"` (optional, behind `browser-native` feature) — WebDriver client.
- `pdf-extract = "0.10"` (optional, behind `rag-pdf`) — pulls `lopdf`, `adobe-cmap-parser`.
- `objc2 / objc2-contacts / objc2-app-kit / block2` — macOS Contacts framework + WKWebView.
- `landlock = "0.4"` (optional, linux-only) — sandbox.
- `starship-battery = "0.10"` — battery probe. Comment in Cargo.toml notes it's a **maintained fork** of the abandoned `battery` crate. Documented risk.
- `nu-ansi-term = "0.46"` and `wait-timeout = "0.2"` — both single-maintainer.

---

## 3. Top 25 Node dependencies (by importance / weight)

From `app/package.json` (the only manifest with substantive deps). Resolved versions from the **root** `pnpm-lock.yaml` (the active workspace lockfile).

| # | Package | Declared | Resolved | Role | Risk notes |
|---|---|---|---|---|---|
| 1 | `react` | `^19.1.0` | **19.2.5** | UI runtime | Current. Multiple peer-pinned copies in the graph (`19.2.5`, `19.2.3`). |
| 2 | `react-dom` | `^19.1.0` | **19.2.5** | DOM renderer | Same. |
| 3 | `@reduxjs/toolkit` | `^2.11.2` | **2.11.2** | State management | Current. |
| 4 | `react-redux` | `^9.2.0` | **9.2.0** | React bindings | Current. |
| 5 | `redux-persist` | `^6.0.0` | **6.0.0** | Persisted store | Project effectively unmaintained (last release 2022). Common churn target. |
| 6 | `redux-logger` | `^3.0.6` | **3.0.6** | Dev-time logger | Unmaintained (last release 2017). Should probably be devDep only. |
| 7 | `react-router-dom` | `^7.13.0` | **7.14.2** | Routing | Current (Remix-era). |
| 8 | `@sentry/react` | `^10.38.0` | **10.49.0** | FE error reporting | Drift accepted. Heavy: pulls `@sentry-internal/replay`, `replay-canvas`, `feedback`, `browser-utils`. |
| 9 | `@sentry/vite-plugin` (dev) | `^2.22.6` | 2.23.1 | Source maps upload | Pulls all 7 platform-specific `@sentry/cli-*` binaries (linux-x64/arm64/arm/i686, win32-x64/i686, darwin) into the lockfile — large npm footprint but only one runs on a given host. |
| 10 | `@tauri-apps/api` | `^2.10.0` (root pins `2.10.1`) | **2.10.1** | Tauri JS bindings | `resolutions` in root forces exact 2.10.1. |
| 11 | `@tauri-apps/plugin-deep-link` | `^2` | 2.4.8 | Deep links | OK. |
| 12 | `@tauri-apps/plugin-opener` | `^2` | 2.5.3 | Open URL/file | OK. |
| 13 | `@tauri-apps/plugin-os` | `^2.3.2` | 2.3.2 | OS info | OK. |
| 14 | `@tauri-apps/cli` (dev) | `2.10.0` (exact) | 2.10.0 | Build CLI | Bundles 10 platform-specific binaries (`@tauri-apps/cli-{darwin-arm64, darwin-x64, linux-arm-gnueabihf, linux-arm64-gnu, linux-arm64-musl, linux-riscv64-gnu, linux-x64-gnu, linux-x64-musl, win32-*}`). Normal for native CLIs. |
| 15 | `remotion` | `4.0.454` (exact) | **4.0.454** | Video rendering for the mascot | **HEAVY.** Pulls `@remotion/player` (also `4.0.454`) and `@remotion/zod-types`. Remotion is **commercial-licensed for companies >3 people**. Worth verifying license posture for the company shipping OpenHuman. The remotion package is **only** a dependency via the `mascot` feature — `remotion/package.json` says `"license": "UNLICENSED"`. |
| 16 | `@remotion/player` | `4.0.454` (exact) | 4.0.454 | Embedded player | Same license posture as `remotion`. |
| 17 | `three` | `^0.183.2` | **0.183.2** | 3D rendering (mascot?) | Current. Tree-shakable, but ESM ergonomics often pull more than needed. |
| 18 | `@types/three` (dev) | `^0.183.1` | 0.183.1 | Three.js types | OK. |
| 19 | `lottie-react` | `^2.4.1` | 2.4.1 | Lottie animations (mascot?) | OK. |
| 20 | `cmdk` | `^1.1.1` | **1.1.1** | Command palette UI primitive | OK. |
| 21 | `react-joyride` | `^3.1.0` | **3.1.0** | Onboarding tours | Less active maintenance; older deps internally. |
| 22 | `react-markdown` | `^10.1.0` | **10.1.0** | Markdown renderer | Current. |
| 23 | `socket.io-client` | `^4.8.3` | **4.8.3** | Socket.IO transport | Pairs with the Rust `socketioxide` server. |
| 24 | `@radix-ui/react-dialog` | `^1.1.15` | (resolved 1.1.x) | Accessible dialog primitive | Current. |
| 25 | `@noble/curves` + `@noble/secp256k1` + `@noble/hashes` + `@scure/bip32` + `@scure/bip39` + `@scure/base` | `^2.x` / `^3.x` | `2.2.0` / `3.1.0` / `2.2.0` / `2.2.0` / `2.2.0` / `2.2.0` | Crypto primitives (wallet, mnemonics, BIP32/39) | All `paulmillr/noble-*` and `paulmillr/scure-*`. Trusted, audited. Single-maintainer concentration is a *known and accepted* risk in the JS crypto ecosystem — note it. |

**Honourable mentions:**
- **Test stack (dev only):** `vitest@4.1.5`, `@vitest/coverage-v8@4.1.5`, `vite@8.0.10`, `@vitejs/plugin-react@6.x`, `jsdom@28.1.0`, `@testing-library/{react,dom,jest-dom,user-event}`.
- **WDIO/Appium for desktop E2E:** `@wdio/cli`, `@wdio/appium-service`, `@wdio/local-runner`, `@wdio/mocha-framework`, `@wdio/spec-reporter` — all on `9.27.0` family. Heavy dev-time graph (pulls `@puppeteer/browsers`).
- **Polyfills:** `buffer`, `process`, `os-browserify`, `util`, `vite-plugin-node-polyfills` — needed because some deps assume Node globals in browser. Adds bundle size; check whether all are still required after React 19.
- **Tooling-only:** `knip@6.6.2`, `eslint@9.39.4`, `prettier@3.8.3`, `husky@9.1.7`, `tsx@4.21.0`, `cross-env@10.1.0`, `tailwindcss@3.4.19`, `autoprefixer@10.5.0`, `postcss@8.5.10`.

**Resolved/declared drift worth a follow-up:** none significant in the active root lockfile — every `^X` we sampled landed on a sane minor. (Earlier confusion was from `app/pnpm-lock.yaml`, a stale secondary lockfile.)

---

## 4. Heavy / unusual / risky dependencies (flagged)

### Compile-/runtime-heavy
1. **`cef@=146.4.1+146.0.9`** + `cef-dll-sys` — downloads ~200MB Chromium on first build; pinned via exact `=` constraint (good).
2. **`tauri-runtime-cef`** + 7 vendored tauri-cef path crates — entire Tauri fork checked out as submodule (`vendor/tauri-cef`). If the submodule isn't fetched, the build silently fails to compile any of `tauri{,-build,-utils,-macros,-runtime,-runtime-wry,-plugin}`.
3. **`whisper-rs` + `whisper-rs-sys`** — whisper.cpp via FFI. Forked at `tinyhumansai/whisper-rs-sys`, **branch=`main` with NO commit pin**. Non-reproducible the moment upstream pushes.
4. **`matrix-sdk@0.16.1`** — ~12 transitive crates (`matrix-sdk-base/common/crypto/sqlite/indexeddb`, `vodozemac`, `ruma-signatures`, etc.). Documented blocker on Rust toolchain upgrades.
5. **`whatsapp-rust@0.5`** + 6 `wacore-*` transitives + own SQLite store. Mid-popularity, recent fork migration.
6. **`remotion@4.0.454`** — heavy renderer with commercial-license tier above 3 staff; package.json declares `"license": "UNLICENSED"` on the `remotion/` workspace.

### Sensitive (input/output/secret-touching)
- **Crypto:** `aes-gcm`, `chacha20poly1305`, `argon2`, `sha2`, `hmac`, `ring`, `rustls` (root). On the JS side: `@noble/*`, `@scure/*`, `ethers-core` (Rust), all signing keys.
- **Wallet/keys:** `ethers-core` + `ethers-signers` are **deprecated** upstream — migrate to `alloy`.
- **Input control:** `rdev`, `enigo`, `arboard` — privileged on macOS (TCC prompts), historically suspect for input leakage. Confirm scoping.
- **Sandbox:** `landlock` (opt-in, linux-only). Cargo features `sandbox-landlock`, `sandbox-bubblewrap` exist — feature gating is intentional.
- **Secrets in env:** `dotenvy` — fine.

### Forked / git deps (non-reproducible if not pinned)
| Crate | Source | Pin | Risk |
|---|---|---|---|
| `whisper-rs-sys` | `tinyhumansai/whisper-rs-sys`, **branch = main** | **NONE (HEAD floats)** | **HIGH — non-reproducible** |
| `tauri-plugin-opener` | `tauri-apps/plugins-workspace` | `rev = c6561ab6b4f9e7f650d4fc8c53fd8acc9b65b9b2` | OK, full SHA |
| `tauri-plugin-deep-link` | same | same rev | OK |
| `tauri-plugin-global-shortcut` | same | same rev | OK |
| `tauri-plugin-single-instance` | same | same rev | OK |
| `tauri`, `tauri-build`, `tauri-utils`, `tauri-macros`, `tauri-runtime`, `tauri-runtime-wry`, `tauri-plugin` | path = `vendor/tauri-cef/crates/*` (submodule) | submodule commit pin | OK if submodule fetched |

### Single-maintainer / abandoned-risk crates
- `starship-battery` — **explicit fork** of abandoned `battery` (acknowledged in comment).
- `nu-ansi-term`, `wait-timeout`, `enigo`, `rdev`, `fantoccini`, `socketioxide`, `whatsapp-rust` family — small core team / single-org maintainership.
- `redux-logger` and `redux-persist` (JS) — both effectively unmaintained.

### Drift / version-pin oddities
- `vite "^8.0.0"` in `app/package.json` → resolves to `vite@8.0.10` in root `pnpm-lock.yaml`. Fine. **However**, `app/pnpm-lock.yaml` is a **stale, parallel lockfile** still pinning `vite@7.3.2`. **Either delete `app/pnpm-lock.yaml` or document why two pnpm locks coexist** — having two is a footgun and an out-of-sync `app/` lockfile WILL eventually get picked up by some script.
- Two separate `Cargo.lock` files (root + `app/src-tauri`). They agree on every package they share (sampled: `tokio@1.52.3`, `reqwest@0.12.28`, `serde@1.0.228`, `axum@0.8.9`, `hyper@1.9.0`, `rustls@0.23.40`), but **divergence is possible** because they are independent resolutions. 200 crates exist only in tauri's lock, 159 only in root's.

### Engines / toolchain pins
- Rust: **`1.93.0` pinned** in `rust-toolchain.toml` — explicit upper bound because `matrix-sdk` recursion bug at ≥1.94 (issue 6254). **Real toolchain debt.**
- Node: `app/package.json` requires `node >= 24.0.0`. `packages/npm/package.json` requires `node >= 18`. Mismatched floors across packages.
- pnpm: `package.json` pins `pnpm@10.10.0` exactly via `packageManager` (good).

---

## 5. License posture

No `cargo-deny` or `license-checker` runs were performed; this is a heuristic name-based scan of `Cargo.lock` and `pnpm-lock.yaml`.

| Concern | Status |
|---|---|
| **AGPL transitive Rust deps** | None found (heuristic name match). |
| **GPL transitive Rust deps** | None found (heuristic name match). |
| **LGPL (e.g., GTK)** in tauri lock | `atk-sys`, `cairo-rs`, `gdk-*`, `gio-*`, `glib`, `gtk`, `gtk-sys`, `pango`, `soup3` — all present on the Linux build path via `tauri-runtime-wry`. These are LGPL and **dynamically linked** (system libraries) — fine for proprietary distribution. |
| **`webp-converter` (npm, in `remotion/`)** | Bundles native binaries; verify license file in dist. |
| **`remotion@4.0.454`** | **The biggest license question.** Remotion's license switched to dual personal/commercial; the `remotion/package.json` in this repo says `"license": "UNLICENSED"`. If the entity shipping OpenHuman has >3 employees, a Remotion company licence is required. **Action item: get sign-off from legal.** |
| **`@puppeteer/browsers`** (dev only) | Apache-2.0, OK. |
| **`openssl-sys`** | Present in tauri lock (transitive). OpenSSL's "OpenSSL License" is Apache-2.0 since 3.0; the root `openhuman` prefers `rustls`. Worth confirming OpenSSL isn't linked into shipped binaries. |
| **`whisper-rs-sys` fork** | Whisper.cpp upstream is MIT; fork commit history not audited. |

**Summary:** no obvious GPL/AGPL contamination of the Rust core. The two real license items are (a) **Remotion commercial-tier eligibility** and (b) confirming the OpenSSL/GTK linkage on Linux is dynamic, not static.

---

## 6. Internal coupling observations

### Rust — module-level import counts (`use crate::openhuman::{module}` matches)

Outgoing (afferent) = how many files in module X import from another module.
Incoming (efferent) = how many files outside module X import from X.

| Module | Total LOC | Outgoing imports | Incoming imports | Notes |
|---|---:|---:|---:|---|
| `memory`     | 62,134 | 78  | **146** | Central hub. Most-depended-on module. Stable abstraction layer. |
| `agent`      | 44,683 | **220** | 90  | The orchestrator. Imports more than anyone else. |
| `tools`      | 37,638 | **224** | 60  | Heaviest outgoing. Reaches into `memory` (32 files), `agent` (31), `inference` (4). |
| `inference`  | 29,794 | 55  | 114 | Second hub. Many depend on it; it depends on few. Healthy. |
| `channels`   | 32,524 | 84  | 8   | Self-contained provider layer (telegram, discord, web). Healthy fan-out. |
| `composio`   | 26,105 | 71  | 18  | External SaaS integrations (gmail, slack, notion, github). Healthy. |

### Cross-module edge matrix (Rust)

`use crate::openhuman::{tgt}` occurrences in files under `src/openhuman/{src}`:

| from \ to | memory | agent | tools | channels | inference | composio |
|---|---:|---:|---:|---:|---:|---:|
| **memory**    |  —  |  5 |  1 |  2 |  4 |  2 |
| **agent**     | 34 |  —  | 36 |  0 | 40 |  7 |
| **tools**     | 32 | 31 |  —  |  0 |  4 |  2 |
| **channels**  |  6 | 14 |  7 |  —  | 13 |  1 |
| **inference** |  0 |  2 |  1 |  0 |  —  |  0 |
| **composio**  | 19 |  6 |  2 |  0 |  0 |  —  |

### Cycle-shaped relationships (Rust)

These are **bidirectional at module granularity**. They're not strict cycles at file granularity (no `A.rs` ↔ `B.rs` direct pair found), but they make refactoring risky:

1. **`agent ↔ tools`** — agent imports tools 36×, tools imports agent 31×. Heavy mutual coupling; the two modules effectively co-design each other. Most concerning structural finding.
2. **`agent ↔ memory`** — agent imports memory 34×, memory imports agent 5×. Mostly one-way but the back-edge exists.
3. **`tools ↔ memory`** — tools imports memory 32×, memory imports tools 1×. Effectively one-way with a small leak.
4. **`agent ↔ inference`** — agent imports inference 40×, inference imports agent 2×. One-way modulo a tiny leak.

**Net:** the structural seam between `agent` and `tools` is the riskiest place to refactor without breaking compilation in many files. `memory` is the most stable abstraction (146 incoming, 78 outgoing — high I = `Ce/(Ca+Ce)` = ~0.35, healthy).

### TypeScript — module-level import counts (relative `../{module}/` matches)

| from \ to | components | lib  | features | services | store | pages | hooks | providers | utils |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **components** |  —  | 170 | 15 |  66 | 53 |  1 |  46 | 19 | 125 |
| **lib**        |  —  |  —  |  —  |   5 | 16 |  —  |  —  |  —  |  9  |
| **features**   |  1  |  5  |  —  |   9 | 11 |  1  |  —  |  5  |  7  |
| **services**   |  —  |  7  |  2  |  —  | 20 |  —  |  —  |  —  | 28 |
| **store**      |  1  |  4  |  1  |   9 |  —  |  —  |  —  |  —  |  4  |
| **pages**      | 102 | 42  |  5  |  33 | 32 |  —  | 14  |  4  | 27  |
| **hooks**      |  —  |  2  |  5  |  20 |  8  |  —  |  —  |  6  | 11  |
| **providers**  |  —  |  3  |  —  |  13 | 23  |  —  |  3  |  —  |  6  |
| **utils**      |  —  |  1  |  —  |  28 |  5  |  —  |  —  |  —  |  —  |

### TS bidirectional pairs (apparent cycles at module granularity)

- **`components ↔ store`** (53 ↔ 1) — mostly one-way, but stores import back from components.
- **`components ↔ features`** (15 ↔ 1) — mostly one-way.
- **`services ↔ store`** (20 ↔ 9) — **bidirectional**, this is a smell. Services should not depend on stores; stores should consume services.
- **`lib ↔ store`** (16 ↔ 4) — bidirectional; stores reach into `lib`, but `lib` also reads `store`. Layering inversion.
- **`utils ↔ services`** (28 ↔ 28) — fully symmetric; utils should be leaf-only. **Concerning.**
- **`utils ↔ store`** (5 ↔ 4) — same pattern.
- **`pages ↔ features`** (5 ↔ 1) — mostly one-way.

**Net:** the `services / store / utils / lib` quadrant has multiple back-edges that imply unclear ownership. `components` and `pages` are mostly downstream consumers (healthy).

---

## 7. Dependency-health score

**Score: 6 / 10**

Strengths:
- Direct deps are mostly current; lock files actually resolve to recent minor versions.
- TLS, async runtime, JSON, observability stacks are conventional and modern (axum 0.8 / tokio 1.52 / rustls 0.23 / sentry 0.47 / opentelemetry 0.32).
- All Tauri plugin git deps are pinned by full SHA.
- Exact pin on `cef = "=146.4.1"`.
- Rust toolchain pin is explicit and documented.
- License posture is OK on the Rust side (no GPL/AGPL).
- No GitHub-tarball deps in npm; no `file:` deps.

Deductions:
- **−1** `whisper-rs-sys` git dep pinned to **branch=main, no rev**. Non-reproducible builds whenever upstream pushes. Easy to fix.
- **−1** `ethers-rs` is the deprecated path; significant migration debt to `alloy`.
- **−1** `agent ↔ tools` heavy bidirectional coupling (36/31), plus three TS cycles (`services↔store`, `utils↔services`, `lib↔store`).
- **−0.5** Two `Cargo.lock` files independently resolving the same crates (root + `app/src-tauri`). No active divergence today, but it's fragile.
- **−0.5** Two pnpm lockfiles (`pnpm-lock.yaml` and `app/pnpm-lock.yaml`), and they **DO disagree** (root: vite 8.0.10; app: vite 7.3.2). Delete the stale one.
- **−0.5** Remotion license posture unverified (`UNLICENSED` declared on `remotion/package.json`, commercial tier above 3 staff).
- **−0.5** Single-maintainer/abandoned npm deps: `redux-logger` (2017), `redux-persist` (2022). Behavioural debt.
- **−0.5** Rust toolchain **pinned below 1.94** due to `matrix-sdk` recursion bug. Real upgrade blocker.

Net: a competent dependency posture with a few concrete, fixable issues. Most are documented in code comments — which is itself a positive signal that the maintainers are aware.

---

## 8. Quick wins (sorted by ratio of effort to risk reduction)

1. **Pin `whisper-rs-sys` to a commit SHA** instead of `branch = "main"`. 1-line change in two `Cargo.toml` files.
2. **Delete `app/pnpm-lock.yaml`** (the stale duplicate) or document the workflow that re-creates it. Right now the two files actively disagree on `vite`.
3. **Resolve `app/pnpm-lock.yaml` vs root** — pick one, document, enforce in CI.
4. **License audit for Remotion** before next release. One legal email.
5. **Migration plan for `ethers-rs` → `alloy`** as a tracked tech-debt ticket.
6. **Decide whether `redux-logger` should be devDependency-only**.
7. **Refactor the `agent ↔ tools` seam**: extract a shared trait crate or a `agent_tool_interface` module so the back-edges go through one defined surface.
8. **Workspace-ify Cargo**: if `openhuman_core` and `OpenHuman` (tauri) shared a `[workspace]`, you'd have one lockfile, one resolution, less drift potential. The blocker is currently the `[patch.crates-io]` divergence (root patches `whisper-rs-sys` only; tauri patches whisper + 7 tauri crates), so it's a real refactor, not trivial — but a workspace would catch a class of bugs.
9. **Add `cargo-deny` + `license-checker` to CI** so the GPL/AGPL question is answered by tooling, not heuristics.

---

## Notes on method (transparency)

- All Rust dep counts are from manifest sections (`[dependencies]`, `[dev-dependencies]`) and `Cargo.lock` `name = ` entries. No `cargo tree` ran.
- All Node dep counts are JSON-parsed counts of `dependencies` + `devDependencies`.
- Internal coupling counts are `grep` over `use crate::openhuman::X` (Rust) and `from "../X/..."` / `from "../../X/..."` (TS). These match the *file count of an import edge*, not the unique-pair edge count, so the matrix shows "import statement intensity" — useful for spotting hot seams, but not a substitute for an AST-based analysis.
- "Single-maintainer" classification is heuristic (crate ecosystem familiarity), not pulled from `crates.io` API.
- The `app/pnpm-lock.yaml` discrepancy is real and reproducible — `grep -E "^  vite@" /tmp/openhuman/app/pnpm-lock.yaml` shows `vite@7.3.2`, but the root lock has `vite@8.0.10`.

## Source files referenced

- `/tmp/openhuman/Cargo.toml`
- `/tmp/openhuman/Cargo.lock`
- `/tmp/openhuman/app/src-tauri/Cargo.toml`
- `/tmp/openhuman/app/src-tauri/Cargo.lock`
- `/tmp/openhuman/package.json`
- `/tmp/openhuman/app/package.json`
- `/tmp/openhuman/remotion/package.json`
- `/tmp/openhuman/packages/npm/package.json`
- `/tmp/openhuman/pnpm-lock.yaml` (active workspace lock)
- `/tmp/openhuman/app/pnpm-lock.yaml` (stale; out of sync)
- `/tmp/openhuman/pnpm-workspace.yaml`
- `/tmp/openhuman/rust-toolchain.toml`
