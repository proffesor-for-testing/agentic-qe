# 05 – OpenHuman: Product Factors (SFDIPOT) Test Strategy

**Framework:** James Bach's Heuristic Test Strategy Model (HTSM) — SFDIPOT product factors
**Project:** OpenHuman (`/tmp/openhuman`)
**Version observed:** 0.54.3 (core + Tauri shell), README badge: "Early Beta"
**Assessor scope:** Configs, workspace layout, CI workflows, top-level subsystem directories. Source files were not deeply read — risks are inferred from product surface.

---

## Executive Summary

OpenHuman is an **agentic local-first desktop assistant** built as a single Tauri 2.x application on a vendored **Chromium Embedded Framework (CEF) runtime**, with a **Rust core** (`openhuman-core`, ~95 subsystem dirs) embedded **in-process** in the Tauri shell. The shell exposes a **JSON-RPC server on `127.0.0.1:7788`** (also reachable in headless Docker mode) plus a **Socket.IO** event stream and a **WebSocket bridge to CEF** for connector recipes (Gmail, WhatsApp Web, Slack, Discord, iMessage, Google Meet). Persistent state lives in **bundled SQLite** (`rusqlite`) under a per-user workspace, with **AES-GCM / ChaCha20-Poly1305 + Argon2** at-rest encryption and OS-keychain credentials. The app ships **118+ OAuth integrations** (via Composio + native scanners), an **MCP client and server**, a **QuickJS skills sandbox**, **local AI** (Whisper STT, Piper TTS, Ollama/LM Studio), **embeddings + vector store** for the Memory Tree, a **cron-based scheduler**, a **wallet** (EVM/BTC/Solana/Tron), and **auto-update** for both the Tauri bundle and the core. The product is multilingual (5 README locales, i18n CI gate), targets macOS/Windows/Linux desktops plus a self-hosted Docker server, and is openly labelled "expect rough edges." Existing tests: ~20 Rust integration tests, ~55 WDIO/Appium E2E specs, frontend Vitest, installer Pester/bash tests, plus 20 CI workflows including a release pretest gate. Major **untested surface**: the QuickJS skills sandbox isolation, prompt-injection detector under adversarial inputs, wallet RPC against rogue chains, CEF intercept and credential-store recovery on locked keyrings, auto-fetch 20-minute loop under partial outage, and the proliferation of webview scanners (`*_scanner` modules) reading from third-party UIs that change without notice.

---

## S — Structure

### Observed (what the product is made of)

- **Cargo workspace root** with one root crate `openhuman` (v0.54.3) producing 5 binaries: `openhuman-core` (main JSON-RPC server), `slack-backfill`, `gmail-backfill-3d`, `memory-tree-init-smoke`, `inference-probe`.
- **`app/src-tauri/`** — the Tauri shell crate `OpenHuman` v0.54.3 (`staticlib`, `cdylib`, `rlib`), embedding `openhuman_core` *in-process* (Cargo.toml: `openhuman_core = { path = "../.." }`). Per the comment in `app/src-tauri/Cargo.toml`, sidecar was removed in PR #1061; core now runs as a tokio task inside the Tauri host.
- **`app/src-tauri/vendor/tauri-cef/`** — vendored fork of Tauri on a `feat/cef-notification-intercept` branch, plus a vendored `tauri-plugin-notification`. CEF version is pinned to `=146.4.1`.
- **`pnpm-workspace.yaml`** lists only `"app"` — the React/TS frontend (`app/src/`) is the lone JS workspace member; `remotion/` (mascot renderer) and `scripts/agent-batch/` have their own `package.json` outside the workspace.
- **Frontend** (`app/src/`): React 19 + Vite 8 + Redux Toolkit + Tailwind 3 + Sentry + Three.js (mascot 3D) + Remotion player + react-router-dom 7 + Tauri APIs.
- **`src/openhuman/`** has **~95 subsystem directories** including `agent/`, `agentmemory backend`, `audio_toolkit`, `autocomplete`, `billing`, `channels`, `composio`, `credentials`, `cron`, `desktop_companion`, `doctor`, `embeddings`, `encryption`, `inference`, `integrations`, `learning`, `mcp_client`, `mcp_server`, `meet`, `meet_agent`, `memory`, `migration`, `migrations`, `notifications`, `overlay`, `people`, `prompt_injection`, `referral`, `routing`, `runtime_node`, `runtime_python`, `scheduler_gate`, `screen_intelligence`, `security`, `service`, `skills`, `socket`, `subconscious`, `team`, `threads`, `todos`, `tokenjuice`, `tool_registry`, `tools`, `tree_summarizer`, `update`, `vault`, `voice`, `wallet`, `webhooks`, `webview_accounts`, `webview_apis`, `webview_notifications`, `whatsapp_data`.
- **`packages/`** — distribution packaging: `deb`, `homebrew`, `homebrew-core`, `npm`.
- **`remotion/`** — separate Remotion project for mascot asset rendering.
- **`scripts/`** — ~80+ utility scripts (release, debug-*, mock-api, agent-batch, deep-work, rabbit code-review CLI, weekly-code-review, install.sh/ps1, tauri DMG signing, sentry symbol upload).
- **Git submodules** declared (`.gitmodules`) — README step 2 says `git submodule update --init --recursive` is mandatory before `pnpm install`; the Tauri-CEF fork is one of them.
- Rust toolchain pinned to **1.93.0** with a comment: "Pin below 1.94 until matrix-sdk resolves recursion limit overflow"; Node ≥ 24; pnpm 10.10.0.
- `[patch.crates-io]` rewrites **all `tauri-*` crates** and `whisper-rs-sys` to forks/vendored paths. Plugins are pinned to a specific commit on `plugins-workspace@feat/cef`.

### Quality Risks

| ID | Risk | Severity |
|----|------|---|
| S1 | **Single-process model with embedded core**: a panic in any of 95 subsystem dirs takes down the GUI and silences the JSON-RPC server. Sentry capture is best-effort. | H |
| S2 | **Vendored Tauri-CEF fork on `feat/cef-notification-intercept`** is critical-path: any upstream Tauri security fix must be manually back-ported. The fork sets `macOSPrivateApi: true` and has `--remote-debugging-port=9222` exposed to the bridge. | H |
| S3 | **Five binaries** (`openhuman-core`, `slack-backfill`, `gmail-backfill-3d`, `memory-tree-init-smoke`, `inference-probe`) each have independent CLI surfaces; only `openhuman-core` appears in `app/scripts/e2e-*`. The backfill binaries can mutate the same workspace SQLite while the desktop is running. | H |
| S4 | **CEF binary pin** `=146.4.1` exact. A forced-pinned binary blob means CVE response time for embedded Chromium is whatever the maintainers' upgrade cadence is. The `.github/workflows/tauri-cef-pin-guard.yml` indicates this is known-fragile. | H |
| S5 | **Optional features compile-gated** (`whatsapp-web`, `channel-matrix`, `peripheral-rpi`, `browser-native`, `rag-pdf`, `sandbox-landlock`) — feature matrix multiplies failure modes. Most CI runs likely use default features only. | M |
| S6 | **`e2e-test-support` feature** flips `openhuman.test_reset` RPC on — comment in Cargo.toml says shipped binaries don't have it, but the safety depends entirely on the build script never accidentally enabling it. | M |
| S7 | Submodules required before install means a fresh contributor clone without `--recursive` will produce a broken Cargo build with confusing errors. | L |
| S8 | `app/src-tauri/Cargo.lock` exists alongside the root `Cargo.lock`. Diverging lockfiles across two workspaces is a class of "works on my machine" supply-chain risk. | M |

### Test Ideas (Structure)

1. **Build the same SHA twice with and without `--recursive`** submodule fetch; capture the failure mode and time-to-failure of `cargo check -p openhuman --lib` to assess developer ergonomics.
2. **Force a panic inside `src/openhuman/voice/`** via a malformed Whisper model path and observe whether the JSON-RPC server on :7788 stays up, restarts, or wedges; capture Sentry breadcrumbs and core.token rewrite timing.
3. **Compile-matrix sweep**: run `cargo check` across all 6 optional features (`sandbox-landlock`, `channel-matrix`, `peripheral-rpi`, `browser-native`, `rag-pdf`, `whatsapp-web`) in pairs; count compile errors and unused-dependency warnings.
4. **Build a release binary with `e2e-test-support` accidentally enabled**, then attempt `openhuman.test_reset` over RPC from a third-party client; record whether anything other than the absent feature flag blocks the wipe.
5. **Run `slack-backfill` and the desktop concurrently** against the same workspace; trigger overlapping SQLite writes and inspect `PRAGMA integrity_check`, lock contention, and final row counts vs expected.
6. **Diff `Cargo.lock` (root) against `app/src-tauri/Cargo.lock`** for shared crates; flag any version skew, then try to reproduce the build from each lockfile in isolation.
7. **Upgrade the Tauri-CEF submodule pin by one commit on `feat/cef`** without changing the patch table; capture every callsite that fails to compile to size the upgrade surface.

---

## F — Function

### Observed (what the product does)

Inferred from the 95 subsystem dirs, README, and E2E spec names:

**User-facing capabilities** (one E2E spec per area, mostly):
- Chat & agent harness (send / stream / cancel / subagent / scroll / wallet flow).
- Onboarding (modes, judge, stress, chat).
- 118+ third-party integration connectors via Composio + per-service native scanners (Gmail, Slack, Discord, Telegram, WhatsApp Web, iMessage, Google Messages, Notion, Reddit, GitHub, Drive, Sheets, Facebook, Instagram).
- Google Meet *participation* — the mascot joins meetings as a real participant with fake-camera SVG-to-Y4M frames piped into CEF's `--use-file-for-fake-video-capture`, plus audio out via meet_audio/meet_call.
- Voice: STT via whisper-rs (Metal on macOS), TTS via ElevenLabs + Piper, dictation hotkeys, mascot lip-sync.
- Memory Tree (canonicalize → chunk → score → fold into hierarchical summaries) + Obsidian-compatible `.md` vault export.
- Skills system: discovery, install, OAuth, multi-round execution, socket-reconnect handling — registry can be remote URL or local dir.
- MCP client (stdio servers) and MCP server (exposing OpenHuman as MCP to other agents).
- Webhooks (ingress + tunnel), cron jobs, scheduler with battery/idle gating, subconscious background ticks every 20 minutes.
- Wallet: EVM, BTC, Solana, Tron — ABI execution, RPC fallback to public endpoints.
- Auto-update for Tauri bundle AND core in lockstep.
- Multi-locale UI (en, zh-CN, ja-JP, ko, de — checked by `pnpm i18n:check`).
- Native overlay window, command palette, autocomplete, screen intelligence (vision-based).
- Card and crypto payment flows (Stripe-ish + crypto).

**Internal capabilities**:
- JSON-RPC dispatch with bearer-token auth (`OPENHUMAN_CORE_TOKEN`), structured errors, RPC log.
- Socket.IO event bus over `socketioxide`.
- Model routing (low/medium/high tier presets) + provider quality + telemetry.
- TokenJuice compression layer for every tool call/scrape/email/search payload.
- Prompt-injection detector (`src/openhuman/prompt_injection/`).
- Tool registry with user-filter, orchestrator tools, schema validation.
- Encryption at rest (AES-GCM + Argon2 KDF + ChaCha20-Poly1305).
- Sandboxing options: Landlock (Linux), Bubblewrap, Firejail, macOS sandbox profiles, Docker — `src/openhuman/security/` has files for each.
- Migration framework with versioned migrations (`migrations/`, `migration/`).

### Quality Risks

| ID | Risk | Severity |
|----|------|---|
| F1 | **Prompt injection from any of 118+ integration data sources** (e.g., a Notion page, a Gmail email body, a Slack message) can hijack the agent. The detector is one Rust module against an unbounded adversarial surface. | H |
| F2 | **Auto-fetch every 20 minutes** silently pulls fresh data from every connected service into memory — a single misbehaving connector can DoS the device, fill disk, or leak data into Memory Tree. | H |
| F3 | **Wallet** with private-key signing in the same process as 118 OAuth tokens, embedded Chromium, and untrusted skills (QuickJS) — process compromise = wallet drain. Wallet defaults to public RPC endpoints (publicnode.com, blockstream.info, mainnet-beta.solana.com) which an attacker on the network path could MITM. | H |
| F3a | **Wallet `execution.rs` + `abi.rs`**: ABI decoding bugs or wrong-chain-id replay against forks can sign transactions the user did not intend. | H |
| F4 | **Skills runtime is QuickJS sandbox**; `src/openhuman/skills/inject.rs` exists. Sandbox-escape from skill code into core gives the skill full agent powers (memory, wallet, OAuth tokens). | H |
| F5 | **`SKILLS_LOCAL_DIR` and `SKILLS_REGISTRY_URL`** can point to a local file path or arbitrary HTTP URL — supply-chain attack vector for any user who copy-pastes an env var from a "tutorial". No signing observed for skills. | H |
| F6 | **Google Meet agent** sends *the user's* audio/video into Meet sessions and joins as a participant. A bug here = silent eavesdropping on the user's own meetings or unauthorized join. | H |
| F7 | **MCP server (`mcp_server/`)** exposes OpenHuman tools to other agents; if no authn or weak authn, any local process can drive OpenHuman. | H |
| F8 | **Update flow**: `OPENHUMAN_AUTO_UPDATE_RPC_MUTATIONS_ENABLED` toggles whether bearer-auth callers can invoke `update.apply` — the env-comment itself flags "disable on exposed server deployments." Default not visible from .env.example. | H |
| F9 | **Subconscious/scheduler ticks** keep the agent thinking in the background. A loop bug = CPU drain, battery destruction, or runaway LLM bill (every tick is a potential model call). | M |
| F10 | **Migrations** (`migrations/phase_out_profile_md.rs`, `retire_chat_v1_model.rs`, `unify_ai_provider_settings.rs`) run on workspace upgrade; a failed migration mid-flight on the bundled SQLite = data loss. No visible rollback story. | H |
| F11 | **TokenJuice** is run on *every* LLM input — a compression bug can corrupt prompts (lose CJK grapheme boundaries despite the claim, drop URLs, change PII handling) and the user never sees the original was mangled. | M |
| F12 | **Approval flow** (`src/openhuman/approval/`) is the last gate before destructive actions. Bypass = silent execution of arbitrary tools without user consent. | H |

### Test Ideas (Function)

1. **Inject a prompt-injection payload** into a Notion page, a Gmail subject line, and a Slack DM, then trigger auto-fetch; assert via `rpc_log` whether the agent attempts the injected action and whether `prompt_injection::detector` flagged it. Try base64-wrapped, zalgo-Unicode, and ASCII-art variants.
2. **Disconnect the network during an auto-fetch tick**, then drop a 50 MB attachment into Gmail's IMAP feed and reconnect; measure disk growth in `~/.openhuman`, memory-tree row count, and whether the next tick double-ingests.
3. **Sign a transaction with the wallet** while a MITM proxy returns a different chain-id from the configured `OPENHUMAN_WALLET_RPC_EVM`; observe whether the signed payload protects against replay (EIP-155) and whether the user sees the chain mismatch.
4. **Install a hostile skill** that calls `oauth.fetch` for a service the user did not authorize; assert the bearer-token scope-check (`session_support.rs`) rejects the call rather than returning the token.
5. **Set `SKILLS_REGISTRY_URL` to an attacker HTTP server** that serves a registry pointing to a malicious `index.js`; run `skill install`, then capture which paths in the workspace the skill touches.
6. **Start the desktop, then `curl -X POST http://127.0.0.1:7788/rpc -d 'update.apply'`** without the bearer token; capture status, and repeat with a stolen token from a different session — does revocation work?
7. **Schedule a Meet join while the user is in a separate Meet** call; observe whether the audio pipeline mixes streams, switches cameras, or refuses cleanly with a recoverable error.
8. **Send 1000 RPC frames in 10 seconds** to `/rpc` and `/socketio`; count rejected vs accepted, then assert no inbound frame survives in `rpc_log` with truncated/un-parsed JSON that could pivot to deserialization-confusion bugs.
9. **Run a migration mid-flight power kill**: start `openhuman-core run` while a `migrations/` step is executing, SIGKILL the process, restart and observe whether the SQLite is left mid-migration (corrupt) or rolls forward.
10. **Feed TokenJuice an input mixing 4-byte CJK, ZWJ emoji families, RTL Hebrew, and base64-encoded payloads**, then diff the model-bound prompt vs the original byte-for-byte; verify no graphemes are split and no URL is silently rewritten.

---

## D — Data

### Observed (what it stores and processes)

- **Bundled SQLite** via `rusqlite = { features = ["bundled"] }`. Single workspace dir (`~/.openhuman` or `~/.openhuman-staging` based on `OPENHUMAN_APP_ENV`).
- **Encryption at rest**: `aes-gcm`, `chacha20poly1305`, `argon2`, `sha2`, `hmac`, `ring`. Module `src/openhuman/encryption/` plus `ops.rs`. Memory backend likely encrypts blobs; key derivation via Argon2 from a user-supplied key or device-derived material.
- **`src/openhuman/credentials/`** — separate cred store (`core.rs`, `ops.rs`, `profiles.rs`, `responses.rs`, `schemas.rs`, `session_support.rs`). SECURITY.md says OS-level keychain (Keychain, Credential Manager). On Linux likely libsecret/`keyring`.
- **`src/openhuman/memory/`** has 7 modules: `conversations/`, `ingestion/`, `tree/`, `store/`, `safety/`, `schemas/`, `tool_memory/`, `stm_recall/`, `sync_status/`. Store split into `agentmemory/` (optional proxy backend) and `unified/` (local SQLite with `fts5`, `kv`, `graph`, `documents`, `events`, `segments`, `query`, `profile`).
- **Tree store**: `canonicalize`, `chunk`, `content_store`, `jobs`, `retrieval`, `score`, `tree_global`, `tree_source`, `tree_topic`. README claims ≤3k-token Markdown chunks.
- **Obsidian vault export** to `.md` files — second copy of memory data outside SQLite.
- **`postgres = "0.19"` dependency** in core Cargo.toml — surprising for a local-first app. Possibly used by `agentmemory` backend or for the optional cloud backend.
- **FTS5** virtual table (`memory/store/unified/fts5.rs`) for full-text search.
- **Embeddings** stored via `embeddings/store.rs` with providers (`cloud.rs`, `ollama.rs`, `openai.rs`, `noop.rs`).
- **Vault** module (`src/openhuman/vault/`) — likely secrets management separate from `credentials/`.
- **WhatsApp data** is mentioned in a dedicated subsystem (`whatsapp_data/`) — likely encrypted session blobs for the wa-rs client.
- **iMessage scanner** reads `~/Library/Messages/chat.db` *read-only* on macOS (per Cargo.toml comment).
- **Gmail-backfill** binary fetches and stores 3 days of mail; `slack-backfill` similar.
- Per-OS workspace path via `directories = "5"`/"6"`.

### Quality Risks

| ID | Risk | Severity |
|----|------|---|
| D1 | **Single SQLite for everything** (memory, jobs, credentials cache, kv, graph, fts5, segments, events) — a corruption event = unrecoverable. No visible automatic backup story. | H |
| D2 | **Encryption key management**: Argon2 KDF parameters not visible from outside; if the key derivation uses a device-bound secret (TPM/Keychain) without a recovery path, OS reinstall = data loss. If it uses a weak passphrase, brute force is trivial. | H |
| D3 | **Two copies of memory** (SQLite + Obsidian `.md` vault) — divergence inevitable. The `.md` files are plaintext on disk and not encrypted (contradicting "everything is encrypted at rest"). | H |
| D4 | **Memory Tree compresses email and chat into ≤3k-token chunks** — irreversible information loss; if the compression rule overlay (TokenJuice) drops a phone number or contract clause, the user has no way to retrieve the original. | M |
| D5 | **Gmail + Slack backfill binaries** mutate the same SQLite as the live core. If the user runs them while the desktop is open, write-locks can starve real-time ingestion. | H |
| D6 | **Embeddings** can leak conversation content to OpenAI/cloud providers if `provider = "openai"` (cloud.rs/openai.rs) — opposed to the "private, on-device" marketing. Easy to set wrong; no banner observed. | H |
| D7 | **PII boundary unclear**: README says "workflow data stays on device", but Composio is a SaaS connector hub, Sentry receives crash reports, Seltz/SearXNG receive search queries, ElevenLabs receives TTS text. Each is a separate data egress path. | H |
| D8 | **iMessage `chat.db` read-only** — but read-only is at the rusqlite level; macOS Full-Disk-Access TCC grant is broad. If the agent later writes back (regression), Apple's chat.db can be corrupted with no rollback. | M |
| D9 | **Migrations** rewrite schemas. The CLAUDE.md project instructions in *this* repo describe data-loss risk patterns that apply: no visible row-count verification step in OpenHuman's `migrations/` module surface. | H |
| D10 | **FTS5 indexes** can grow unboundedly with auto-fetch; no visible quota or pruning. | M |
| D11 | **Multi-byte text claim** ("CJK, emoji preserved grapheme-by-grapheme") — `unicode-segmentation` is in the dep tree, but actual coverage is unproven on user data. A regression silently mangles non-Latin text. | M |
| D12 | **`postgres` crate** in dependencies but not in `.env.example` — dead code, or a hidden cloud backend toggled by `BACKEND_URL`. Either way, surprise data egress. | H |

### Test Ideas (Data)

1. **Run `gmail-backfill-3d` while the desktop is open and actively ingesting Slack**; after both finish, run `sqlite3 workspace.db "PRAGMA integrity_check; SELECT COUNT(*) FROM memory_segments;"` and compare to expected counts; assert no `database disk image is malformed`.
2. **Fill the workspace SQLite to 90% disk** with synthetic email, then trigger auto-fetch; capture the failure mode (graceful pause? crash? silent data loss?) and whether the user sees a notification.
3. **Connect Gmail with `embeddings.provider = "openai"`**, then ingest a folder containing the word "PRIVATE-TEST-TOKEN-12345"; use a network tap to confirm whether the literal string (or vector encoding of it) leaves the device.
4. **Diff the Obsidian `.md` vault and the SQLite memory store** after 10 conversations; flag any chunk present in one but not the other, then attempt to recover by editing the `.md` and confirm the SQLite ingests the edit.
5. **Force-kill the process during a `unify_ai_provider_settings.rs` migration**, then restart; capture whether the workspace is mid-state, rolled back, or wedged on retry.
6. **Generate a 50 KB email body of mixed Hangul, ZWJ-emoji families, RTL Arabic, and Devanagari ligatures**, push it through TokenJuice, then compare grapheme cluster counts before/after via `unicode-segmentation`.
7. **Delete the `~/.openhuman/core.token` file** while the core is running and a session is active; observe whether next RPC call regenerates safely or wedges.
8. **Reinstall the OS (simulate by deleting `~/Library/Keychains` on macOS)** while preserving `~/.openhuman`; observe whether memory becomes unreadable, partially readable, or whether there's a recovery path.
9. **Set `BACKEND_URL` to a self-hosted server** and observe outbound traffic; characterize what *core* sends home even when "analytics disabled" (`OPENHUMAN_ANALYTICS_ENABLED=false`).
10. **Use a malformed `chat.db`** in `~/Library/Messages/` (simulate corruption) and start the iMessage scanner; confirm the read-only constraint plus structured-error path.

---

## I — Interfaces

### Observed (how it connects)

- **JSON-RPC** at `POST /rpc` on `127.0.0.1:7788` (default), bearer-token auth (`OPENHUMAN_CORE_TOKEN`). `src/core/jsonrpc.rs`, `src/rpc/dispatch.rs`, `src/rpc/structured_error.rs`.
- **REST** at `/health`, `/?` via `src/api/rest.rs`. JWT via `src/api/jwt.rs`.
- **Socket.IO** event bus via `socketioxide` (`src/api/socket.rs`, `src/openhuman/socket/`).
- **WebSocket bridge** server in the Tauri shell on 127.0.0.1 accepting JSON-RPC frames from the core, so core-side handlers can drive the live CEF webview connectors via CDP (Chrome DevTools Protocol). The CEF instance exposes `--remote-debugging-port=9222`.
- **Tauri commands** (per `app/src-tauri/src/`): `companion_commands.rs`, `core_process.rs`, `core_rpc.rs`, `cdp/`, `webview_apis/`, `webview_accounts/`, `screen_capture/`, scanners for Discord/Slack/Telegram/iMessage/Google Meet/WhatsApp/Google Messages.
- **MCP client** (`src/openhuman/mcp_client/`) talks to external MCP servers over stdio; runs them under managed Python (`runtime_python`) or Node (`runtime_node`).
- **MCP server** (`src/openhuman/mcp_server/`) exposes OpenHuman's tools to other agents over stdio (`protocol.rs`, `tools.rs`).
- **Webhooks** at `src/openhuman/webhooks/` (router, bus, types) — inbound HTTP webhooks. Tunnel (`webhooks-tunnel-flow.spec.ts`) likely uses Ngrok-style relay.
- **Composio** connector hub (`src/openhuman/composio/`) for OAuth-mediated third-party APIs (118+ services). Auth retry, error mapping, googlecalendar arg adapters, periodic syncs.
- **CDP** (`app/src-tauri/src/cdp/`) for Chrome DevTools Protocol over `tokio-tungstenite`.
- **Voice interfaces**: STT via whisper-rs (Metal on macOS), TTS via Piper (binary lookup `PIPER_BIN`) + ElevenLabs (cloud). Audio capture via `cpal` 0.15. Dictation listener + hotkey (`rdev`).
- **Deep-link scheme**: `openhuman://` registered via `tauri-plugin-deep-link`.
- **CLI**: `clap` 4.5 derive — subcommands include at least `serve` (Docker default), `run`, `core run`, plus per-binary helpers.
- **Auto-updater** endpoint: `https://github.com/tinyhumansai/openhuman/releases/latest/download/latest.json` signed with a minisign pubkey baked in `tauri.conf.json`.
- **External services**: Sentry (multiple DSNs), Seltz, SearXNG, Composio, LM Studio (`http://localhost:1234/v1`), Ollama, OpenAI/Anthropic/etc. via routing.

### Quality Risks

| ID | Risk | Severity |
|----|------|---|
| I1 | **CSP in `tauri.conf.json` is wide open**: `connect-src 'self' ipc: http://ipc.localhost http://127.0.0.1:* http://localhost:* http: ws://127.0.0.1:* ws://localhost:* ws: https: wss: data: blob:` — accepts any HTTP/WS/HTTPS/WSS. `frame-src 'self' https: data: blob:`. Effectively no XSS-fed-via-network protection. | H |
| I2 | **`--remote-debugging-port=9222`** on the embedded CEF is reachable from any local process (binds to localhost by default, but any malware running as the user can talk CDP and execute arbitrary JS in OpenHuman's webviews — including pages that hold OAuth tokens, wallet state, etc.). | H |
| I3 | **JSON-RPC server on 0.0.0.0** in Docker mode (`OPENHUMAN_CORE_HOST=0.0.0.0`). If the bearer token is weak, missing, or leaked, anyone on the network controls the agent. Docker compose comment explicitly notes: "REQUIRED. Generate with `openssl rand -hex 32`." Easy to miss. | H |
| I4 | **No visible authn on the WebSocket bridge** (127.0.0.1) between core and Tauri shell. Any local process can connect and impersonate either side. | H |
| I5 | **MCP server over stdio** — stdio is inherently local but MCP tool calls are unrestricted; a hostile MCP client (or a misconfigured one) can fire arbitrary tools. | M |
| I6 | **Deep-link `openhuman://` scheme** — browser-side phishing can craft `openhuman://...` URLs that trigger second-launch handlers; the single-instance plugin forwards payloads to the running instance. | H |
| I7 | **Composio** is a third-party SaaS — every integration token round-trips through their service. If Composio is breached, all 118 connectors compromise simultaneously. | H |
| I8 | **CDP-driven scanners** (Gmail, WhatsApp, etc.) silently scrape from sites whose DOM can change daily. A breaking change = silent ingestion failure with no user-visible signal. | M |
| I9 | **Updater pubkey is baked in `tauri.conf.json`** — pubkey rotation requires a binary update. If the signing key is lost or compromised, all installed clients are stuck. | M |
| I10 | **Auto-updater endpoint is GitHub Releases over HTTPS** — if GitHub serves a malicious binary (account compromise, MITM with cert pinning bypass), every installed client pulls it. Mitigated by minisign, but TOCTOU on signature verification needs proof. | H |
| I11 | **Multiple binary discovery via `WHISPER_BIN`, `PIPER_BIN`, `OLLAMA_BIN` env vars** — symlink an attacker binary, agent executes it as the user. Standard PATH-hijack with extra steps. | M |
| I12 | **Webhooks tunnel** opens an inbound HTTP listener accessible externally; if the route table (`router.rs`) has any path that reflects input into responses, instant SSRF/XSS. | H |

### Test Ideas (Interfaces)

1. **From a non-admin local process**, connect to `ws://127.0.0.1:9222`, list CEF targets via CDP, then call `Runtime.evaluate` to read `document.cookie` from the OAuth webview; verify whether OpenHuman blocks, logs, or grants the read.
2. **Spin up `docker compose up` with `OPENHUMAN_CORE_TOKEN=`** (empty); send `POST /rpc` with no Authorization header from a sibling container; capture the response code and whether the RPC was executed.
3. **Send 10 KB of JSON garbage** to `POST /rpc` with a valid token: malformed nesting, oversized strings, JSON-bomb (10MB of `[[[[[...]]]]]` arrays); observe memory growth, response time, and whether any deserialization panics.
4. **Trigger an `openhuman://` deep link via the browser** that points at a path with `../` traversal in its payload; assert the single-instance handler rejects rather than passing it to the primary instance.
5. **Replace the `PIPER_BIN` env var** with a shell script that prints to stderr "OWNED"; trigger TTS and check whether OpenHuman executes the script and whether stderr leaks into a notification or log.
6. **Stand up a fake Composio API server** that returns an OAuth token to OpenHuman for a service the user did not authorize; record whether OpenHuman accepts and stores the token without UI confirmation.
7. **Connect a hostile MCP server** (advertises 50 tools, one named `system.shell` with arbitrary command exec) via stdio; check whether the user is prompted before tools are registered and whether the approval flow gates execution.
8. **Serve a poisoned `latest.json`** from a local proxy and point the updater endpoint at it; confirm minisign rejects (capture the verification window — does the binary download first or check signature first?).
9. **Open three concurrent Socket.IO connections** with the same token, then revoke the token in the credentials store; verify all three drop within N seconds.
10. **Webhook ingress** — send a POST to `/webhooks/<path>` with `<script>` in the body; navigate any UI page that displays webhook history and check for stored XSS.

---

## P — Platform

### Observed (what it depends on / runs on)

- **OS targets**: macOS (≥ 10.15, `.app` + DMG with codesign + notarization scripts, Apple silicon + Intel matrices), Windows (NSIS + MSI, codesign, install.ps1), Linux (deb + AppImage; deb depends on `libgtk-3-0`, `libwebkit2gtk-4.1-0`, `libx11-6`, `libgdk-pixbuf-2.0-0`, `libglib2.0-0`).
- **Rust 1.93.0** pinned (constrained by matrix-sdk recursion bug).
- **Node ≥ 24**, **pnpm 10.10.0** exact.
- **CEF 146.4.1** binary blob downloaded by `cef-dll-sys` build script on first build; can also be pre-cached at `$HOME/Library/Caches/tauri-cef`.
- **Docker base**: `rust:1.93-bookworm` builder → `debian:bookworm-slim` runtime. System deps: `libssl3`, `libasound2`, `libxdo3`, `libxtst6`, `libx11-6`, `libevdev2`, `curl`, `gosu`. Runs as UID 10001, `read_only: true`, `cap_drop: ALL`, `no-new-privileges`.
- **Bundled SQLite** (`rusqlite` "bundled" feature) — does not depend on system libsqlite.
- **Audio**: `cpal` (cross-platform), `whisper-rs` with Metal on macOS, `hound` for WAV.
- **Input**: `enigo` (keyboard simulation), `arboard` (clipboard), `rdev` (global hotkey).
- **System detection**: `sysinfo`, `starship-battery` (laptop throttling), `hostname`, `dirs/directories`.
- **Linux-only**: `landlock = "0.4"` (optional), `rppal` (Raspberry Pi GPIO! — confirms `peripheral-rpi` feature), `notify-rust` for dbus notifications.
- **macOS-only**: `objc2`, `objc2-foundation`, `objc2-contacts`, `objc2-app-kit`, `objc2-web-kit`, `block2`, `mac-notification-sys`. Reads Contacts framework (`CNContactStore`).
- **Windows-only**: `windows-sys` for Console reattach, EnumWindows/ShowWindow, CreateMutexW (single-instance guard).
- **External services** (cloud-side): Composio (118 integrations), Sentry (3 DSNs: core, Tauri, frontend), Seltz, SearXNG, OpenAI / Anthropic / etc. via routing, ElevenLabs (TTS), Ollama (local), LM Studio (local).
- **Update channel**: GitHub releases over HTTPS, minisign-signed.
- **Submodules**: Tauri-CEF fork + others.

### Quality Risks

| ID | Risk | Severity |
|----|------|---|
| P1 | **CEF download on first build** — pulls a binary blob from somewhere over HTTPS. Build supply-chain risk; cache poisoning at `~/Library/Caches/tauri-cef` is local privilege escalation. | H |
| P2 | **Three sandboxing options on Linux** (Landlock, Bubblewrap, Firejail) — sandbox-bubblewrap is on by default? sandbox-landlock is feature-gated and OFF by default. Most Linux users will run unsandboxed. | H |
| P3 | **macOS TCC permissions** required for: full disk access (iMessage), accessibility (autocomplete + screen intelligence + dictation hotkeys), screen recording (screen_intelligence + screen_capture), camera/mic (Meet agent), notifications, contacts (objc2-contacts). Loss/regrant scenarios are fragile. | H |
| P4 | **Windows `windows-subsystem` quirk** — main binary is windowed; `core` subcommand reattaches to parent console via `AttachConsole`. Easy to break with non-default consoles (Windows Terminal, ConEmu, ssh sessions). | M |
| P5 | **Linux** requires `libwebkit2gtk-4.1-0` per the deb manifest, but the runtime is CEF — confusing dependency; if the system has 4.0 only, install fails opaquely. | M |
| P6 | **Docker container is read-only** but writes to a named volume `openhuman-workspace`. If the volume host is on a filesystem without `O_TMPFILE`/proper case-sensitivity (e.g., macOS Docker Desktop default), SQLite WAL behaviour and Argon2 atomic rename can break in subtle ways. | M |
| P7 | **`mem_limit: 4g`, `cpus: 2.0`** in compose — embedding models + voice + memory tree on a 4GB / 2-core container will OOM under load. | M |
| P8 | **Rust 1.93.0 pin** means contributors with `rustup default stable` will see a downgrade prompt; CI uses a specific container image (`ghcr.io/tinyhumansai/openhuman_ci:rust-1.93.0`) which is yet another point of supply-chain risk. | M |
| P9 | **Five system libs on Linux** (xdo, xtst, x11, evdev, asound) are unconditional dependencies even when the corresponding features are off (per the Dockerfile comment). Headless server deploys still pull GUI libs. | L |
| P10 | **Battery-aware scheduler** (`starship-battery`) — unmaintained-fork dependency, decisions about throttling background LLM jobs ride on a crate's ABI. | L |
| P11 | **macOS minimum 10.15** — Apple silicon Macs ship with 11+, but `10.15` means Intel Catalina, which is past Apple security updates. | L |

### Test Ideas (Platform)

1. **Strip TCC permissions** mid-session (System Settings → Privacy → revoke Full Disk Access for OpenHuman.app), then trigger iMessage scan; capture whether the structured error matches the user-visible message and whether the agent retries until the user re-grants.
2. **Run `docker compose up` with `mem_limit: 1g`** and trigger memory-tree initialization on 10k mock conversations; capture OOM-kill behaviour, observe whether the volume is left in a consistent state.
3. **Install on Ubuntu 22.04 with only `libwebkit2gtk-4.0`** (not 4.1); run the deb install and the launcher; capture the exact failure message.
4. **Launch on Windows from PowerShell, Windows Terminal, ConEmu, and Git Bash**, then call `OpenHuman.exe core run --help`; assert console output appears in each and `AttachConsole` is wired correctly.
5. **Build CEF from a cache poisoned with a 1-byte modified binary** at `$HOME/Library/Caches/tauri-cef`; observe whether `cef-dll-sys`'s build script detects mismatched checksum (or whether it just compiles and links).
6. **Run on a battery-only laptop at 15% battery**; trigger a memory-tree compaction job and capture whether `scheduler_gate::signals` correctly throttles via `starship-battery` or whether the job runs and drains.
7. **macOS Sequoia (15.x) first-run**: launch the unsigned dev DMG and capture every Gatekeeper / quarantine / TCC consent dialog in order; map them to the onboarding screens to detect any sequence regression.
8. **Run two instances of `cargo tauri dev`** at the same time on macOS; per the single-instance plugin comment, the second should hand off argv. Verify the second exits cleanly and doesn't trigger `cef::initialize(...) != 1`.

---

## O — Operations

### Observed (how it is used and operated)

- **Install**: `curl … install.sh | bash` on Mac/Linux, `irm install.ps1 | iex` on Windows. Downloads from `tinyhumans.ai/openhuman` or GitHub Releases. DMG drag-install on macOS, MSI on Windows, deb/AppImage on Linux.
- **Update**: dual-path — Tauri shell via `tauri-plugin-updater` (minisign), core via `src/openhuman/update/` with restart strategies (`self_replace` | `supervisor`). RPC mutations to `update.apply` gated by `OPENHUMAN_AUTO_UPDATE_RPC_MUTATIONS_ENABLED`.
- **Observability**:
  - Sentry x3 projects (core, Tauri shell, frontend). DSNs in env vars, version+SHA in release tag.
  - OpenTelemetry traces + metrics (OTLP HTTP) via `opentelemetry-otlp = "0.32"`.
  - Prometheus metrics (`prometheus` crate, no client server module obvious).
  - `tracing-subscriber` + `tracing-appender` + `env_logger`.
  - `OPENHUMAN_ANALYTICS_ENABLED=true` default.
- **Backup**: not visible. No `backup.rs`, no compose-level backup mention. Volume is named `openhuman-workspace`.
- **Doctor**: `src/openhuman/doctor/` — likely a diagnostic CLI.
- **Health**: `/health` endpoint on the core, Docker `HEALTHCHECK` defined.
- **Logging**: `src/core/logging.rs`, `src/core/rpc_log.rs`. RUST_LOG configurable. Tracing-appender suggests file rotation. Sentry capture before_send filter (`tests/observability_smoke.rs`).
- **CI / CD**: **20 GitHub workflows**:
  - `build-desktop.yml`, `build-windows.yml`, `build.yml`
  - `coverage.yml`, `test.yml`, `test-reusable.yml`, `typecheck.yml`
  - `e2e.yml`, `e2e-reusable.yml`, `e2e-agent-review.yml`
  - `deploy-smoke.yml`, `installer-smoke.yml`
  - `docker-ci-image.yml`
  - `release-packages.yml`, `release-production.yml`, `release-staging.yml`
  - `tauri-cef-pin-guard.yml`
  - `pr-quality.yml` (soft checks — checklist, coverage-matrix, lychee link check; all `continue-on-error`)
  - `contributor-rewards.yml`
  - `weekly-code-review.yml`
- **Husky pre-push**: `format`, `lint`, `compile`, `rust:check`, `lint:commands-tokens`. Auto-fixes formatting/lint, fails on TS/Rust/tokens.
- **`scripts/install.sh`** has a unit-test harness (`scripts/test_install.sh`) — exercised by `installer-smoke.yml`.
- **`scripts/install.ps1`** has Pester tests (`scripts/tests/OpenHumanWindowsInstall.Tests.ps1`).
- **Onboarding**: judge + stress test scripts (`scripts/test-onboarding-{chat,judge,stress}.mjs`), 4 onboarding modes from spec list.
- **Approval flow** + **prompt-injection detector** + **tool-policy** form the user-facing safety surface.
- **Recovery**: `process_recovery.rs`, `process_kill.rs` in the Tauri shell handle crashes/zombie processes.

### Quality Risks

| ID | Risk | Severity |
|----|------|---|
| O1 | **No visible backup mechanism** for `~/.openhuman` (or the Docker volume). Memory tree is the user's life corpus; a single corruption = total loss. The CLAUDE.md in *this assessor repo* identifies the same anti-pattern. | H |
| O2 | **`curl … | bash` install**: standard but high-risk if `tinyhumans.ai` or the GitHub raw content endpoint is ever compromised. No GPG/minisign sig on the install script itself. | H |
| O3 | **Sentry, OTLP, analytics all opt-out** — `OPENHUMAN_ANALYTICS_ENABLED=true` default. README emphasizes privacy, but defaults phone home. Default-on telemetry contradicts marketing. | H |
| O4 | **Update restart contract** has two strategies (`self_replace`, `supervisor`); failure mode of a partial update (Tauri shell updated, core not) is implicit. | H |
| O5 | **Auto-fetch every 20 min + subconscious ticks + cron jobs + scheduler_gate** = three overlapping scheduling systems. Behaviour during sleep/wake, dock/undock, VPN flap is a combinatorial nightmare. | H |
| O6 | **`pr-quality.yml` jobs are `continue-on-error: true`** for the first ~2 weeks — comment says "flip to hard-fail once stable". If never flipped, soft gates are not gates. | M |
| O7 | **Five binaries shipped**, but only `openhuman-core` has a Docker image. Backfill binaries deployed to a server need separate management. | M |
| O8 | **Husky pre-push auto-fixes formatting**, then asks user to re-commit. If the user pushes anyway (no re-commit), they push unformatted code — but the hook said it auto-fixed. Confusing. | L |
| O9 | **`weekly-code-review.yml`** runs an automated code review (perhaps the `rabbit` CLI). If the review surfaces secrets in PR descriptions, escalation path unclear. | L |
| O10 | **`installer-smoke.yml`** is `pull_request` + `push:main` — exercises `--dry-run`, not actual install. Production install on a fresh VM is not in CI. | H |
| O11 | **Symbol/source upload to Sentry** is in scripts/upload_sentry_symbols.sh — if this step fails on release, debugging production crashes becomes blind. No visible retry/alarm. | M |
| O12 | **Logs may contain user data** by default — `OPENHUMAN_LOG_PROMPTS=0` is the flag; if a user turns this on for support, the rotating log captures plaintext LLM prompts (i.e., user PII). | M |

### Test Ideas (Operations)

1. **Install via `install.sh` from a local HTTP server** that serves a script signed differently than expected; verify whether the user is warned about the signature mismatch (or whether there is no signature at all).
2. **Trigger the `tauri-plugin-updater` and then SIGKILL during the binary swap** on macOS; restart and assert the app is in either old or new state, never half-replaced.
3. **Start the Tauri shell, update the core only** (manually replace `openhuman-core` on disk), restart core only; capture whether the shell detects version skew and refuses or retries handshake.
4. **Delete `~/.openhuman/` while the app is running**; capture data loss, crash, or graceful re-initialization.
5. **Run the agent through a 24-hour stress** with all 118 connectors active and subconscious ticks on; sample memory, CPU, disk, network outflow every hour. Plot for leaks.
6. **Suspend the laptop for 4 hours** mid-cron job; on wake, assert whether the cron `cron` crate fires the missed jobs once, all at once, or skips.
7. **Submit a PR that intentionally fails the soft `pr-quality.yml` checks** — confirm the merge button is not blocked (verifying that "soft" is actually soft).
8. **Run `openhuman doctor`** with intentional environmental gaps: missing Whisper binary, expired OAuth token, full disk, no internet; capture which diagnostics are accurate, missing, or misleading.
9. **Send a malformed log line** (10MB single-line, embedded null byte, ANSI escapes) to the `tracing-appender` target; assert the appender rotates correctly and does not crash the process.
10. **Verify `OPENHUMAN_ANALYTICS_ENABLED=false` actually disables Sentry/OTLP at runtime** — run with that flag, then network-trace and assert zero outbound to Sentry/OTLP endpoints over a 10-min window with real activity.

---

## T — Time

### Observed (when things happen)

- **Streaming LLM responses**: `chat-harness-send-stream.spec.ts`, `chat-harness-cancel.spec.ts` indicate streaming + cancellation in the chat harness.
- **20-minute auto-fetch loop** per active connector (README).
- **Subconscious ticks**: `src/openhuman/subconscious/`, `scripts/test-subconscious-ticks.sh`.
- **Cron jobs**: `cron = "0.12"` crate + `src/openhuman/cron/`, spec `cron-jobs-flow.spec.ts`.
- **Scheduler gate**: `src/openhuman/scheduler_gate/signals` watches battery + idle to decide when to run background LLM work.
- **Skill + agent tool execution timeout**: `OPENHUMAN_TOOL_TIMEOUT_SECS` default 120s, max 3600s.
- **Web search timeout**: `OPENHUMAN_WEB_SEARCH_TIMEOUT_SECS` default 10s.
- **`wait-timeout = "0.2"`** crate guards `node --version` probe.
- **JWT token** (`src/api/jwt.rs`) — implies session expiry/refresh.
- **Health check**: 30s interval, 5s timeout, 3 retries, 10s start-period (Docker).
- **Single-instance lock** (Tauri-side mutex) — gates concurrent launches.
- **Periodic Composio sync** (`composio/periodic.rs`).
- **Cooldown / retry**: `composio/auth_retry.rs`, `auth_retry_tests.rs`.
- **`tokio-stream`**, **`futures-util`**, **`async-imap`**, **`tokio-tungstenite`** — heavy async surface.
- **Idle watchdog** for CDP sessions (`cdp/session.rs`, comment references `start_paused = true` tokio test).
- **Approval timeout** likely (not confirmed but implied by approval module).
- **Concurrency primitives**: `parking_lot`, `once_cell`, `Arc<RwLock<...>>` patterns inferred from Tokio "full" feature set, `sync` feature.

### Quality Risks

| ID | Risk | Severity |
|----|------|---|
| T1 | **Cancellation races**: streaming responses + tool calls — if the user cancels mid-stream, partial tool side effects (file writes, OAuth API calls, wallet signs) may already be in flight. The cancel signal does not undo network sends. | H |
| T2 | **Auto-fetch + cron + subconscious overlap**: three schedulers can hit the same connector simultaneously; rate-limit blowups, double-ingestion, and lock contention on the SQLite. | H |
| T3 | **JWT expiry**: `JWT_TOKEN` in env is used by skills sandbox for `oauth.fetch` proxy. Expiry handling not documented — if the token is stale on a long-running session, all skill OAuth calls fail silently. | M |
| T4 | **Sleep/wake**: macOS App Nap, Windows modern standby — `cron` crate computes next fire time from wall clock; system-time jumps backward (NTP, DST, manual change) can fire every job at once or skip all. | H |
| T5 | **Single-instance plugin lock**: the comment in `Cargo.toml` documents that the mutex must be acquired *before* `tauri::Builder` work — race condition between launches can still hit `cef::initialize(...) != 1` if the order is wrong. Sentry tag `OPENHUMAN-TAURI-A`. | H |
| T6 | **CEF idle watchdog**: CDP sessions can leak if the websocket disconnects without a close frame; `tokio::test(start_paused = true)` exists, but coverage depends on how mocked time matches reality. | M |
| T7 | **Tool timeout default 120s, max 3600s**: a hostile/buggy MCP tool can occupy the agent for 1 hour. No per-tool budget visible. | M |
| T8 | **Health-check Docker (30s interval)**: between checks, a deadlocked core looks healthy. Orchestrators (Kubernetes) won't restart. | M |
| T9 | **OAuth refresh tokens** — Composio mediates, but expirations span weeks. Token refresh during auto-fetch + sleep cycle = race on which scheduler retries first. | M |
| T10 | **Time-of-check / Time-of-use** in updater (sig verify then apply): signature verified on download, apply happens later. If `/tmp` is writable by other users, swap binary between verify and apply. | H |
| T11 | **Whisper streaming + Meet audio + dictation hotkey**: three audio-capture paths can collide via `cpal` — overlapping device locks lead to dropped audio or silent device-busy errors. | M |
| T12 | **Battery-aware scheduling latency**: when battery drops below threshold, jobs throttle. If the throttle fires *during* an LLM stream (high cost call mid-response), aborting now wastes the tokens already paid for. | L |

### Test Ideas (Time)

1. **Send a chat that triggers a 10-tool-call agent loop with a 30s sleep tool**; cancel after 5s and inspect `rpc_log` + memory store for partial side effects (writes that hit disk before cancel propagated).
2. **Force-shift system time backward by 25 hours** while the desktop runs an active cron job; assert no job double-fires and the scheduler does not lock up.
3. **Suspend macOS for 30 minutes** while a 20-minute auto-fetch tick is pending; on wake, count fired ticks (expect 1, not 2 or 0).
4. **Launch the desktop binary 5 times in 2 seconds**; assert only one survives, the rest exit < 500ms with exit-code 0, and Sentry has 0 `cef::initialize` panics.
5. **Set `OPENHUMAN_TOOL_TIMEOUT_SECS=2`**, then run an MCP tool that sleeps 10s; assert the tool is killed at 2.0s ± 100ms and the agent receives a structured timeout error.
6. **Open a CDP session, drop the underlying TCP connection without close frame** (firewall block), and watch the idle watchdog — measure leak in tokio task count via `tokio_metrics`.
7. **Acquire the keychain lock from another process** so the credentials read blocks for 10s; observe whether RPC handlers serialize behind it or whether unrelated handlers stay live.
8. **Boot OpenHuman with a clock 5 years in the past** (sandboxed VM with `faketime`); assert TLS cert validation rejects updates and the agent doesn't sign wallet transactions with rotted timestamps.
9. **Trigger a Meet join while dictation is active and Whisper STT is streaming**; assert `cpal` either negotiates shared access cleanly or surfaces a structured "device busy" without crashing.
10. **Pump 100 cron-jobs to fire in the same 1-minute window** (synthetic config); measure executor saturation, queue depth, and whether any are silently dropped.

---

## Top 20 Prioritized Test Ideas (Across All Factors)

Risk ranking combines severity, blast radius, and existing-test gap.

| # | Pri | Factor | Test Idea | Automation Fitness |
|---|-----|--------|-----------|----|
| 1 | P0 | F/I | Inject prompt-injection payloads (base64, zalgo, ASCII-art) through Gmail, Notion, Slack into auto-fetch; observe whether the agent attempts the injected action and whether `prompt_injection::detector` flagged it. | Integration + Human exploration |
| 2 | P0 | I | From a non-admin local process, connect to `ws://127.0.0.1:9222`, list CEF targets via CDP, and call `Runtime.evaluate` to read `document.cookie` from the OAuth webview. | Integration |
| 3 | P0 | F | Sign a wallet transaction while a MITM proxy returns a forked chain-id; assert EIP-155 replay protection and visible chain-mismatch warning. | Integration |
| 4 | P0 | F | Install a hostile skill from a fake `SKILLS_REGISTRY_URL` and trace which paths it touches and which OAuth tokens it can reach. | Integration |
| 5 | P0 | D | Run `gmail-backfill-3d` and the desktop concurrently; afterward run `PRAGMA integrity_check` and assert no `database disk image is malformed`. | Integration |
| 6 | P0 | F | Force-kill the process during a `migrations/` step and assert workspace state is forward-rollable, never half-migrated. | Integration |
| 7 | P0 | I | `docker compose up` with `OPENHUMAN_CORE_TOKEN=` empty; send unauthenticated RPC and capture whether it executes. | Unit + Integration |
| 8 | P0 | T | Cancel an active streaming agent loop with 10 tool calls mid-flight; audit partial side effects (file writes, OAuth API calls) and assert idempotency. | Integration |
| 9 | P0 | O | Verify `OPENHUMAN_ANALYTICS_ENABLED=false` produces zero outbound to Sentry/OTLP over 10 min of real activity. | Integration |
| 10 | P0 | I | Trigger `openhuman://` deep link with `../` traversal in payload; assert rejection by the single-instance handler. | Unit |
| 11 | P1 | D | Ingest a folder with literal `PRIVATE-TEST-TOKEN-12345` while `embeddings.provider = "openai"`; confirm via network tap whether the string or its vector leaves the device. | Integration + Human |
| 12 | P1 | F | Force a panic inside `voice/` and observe whether the JSON-RPC server stays up, restarts, or wedges. | Unit + Integration |
| 13 | P1 | T | Shift system time backward 25 hours mid-cron; assert no double-fire and scheduler does not lock. | Integration |
| 14 | P1 | I | Send 10 KB of JSON-bomb (`[[[[[…]]]]]`), oversized strings, malformed nesting to `/rpc`; observe memory growth and deserialization safety. | Integration |
| 15 | P1 | F | Schedule a Meet join while the user is in a separate live Meet; observe audio/camera arbitration. | Human exploration |
| 16 | P1 | P | Strip Full-Disk-Access TCC mid-session and trigger iMessage scan; capture structured-error and recovery prompt. | Human exploration |
| 17 | P1 | F | 20-minute auto-fetch tick during a network outage with a 50MB attachment in the IMAP feed; measure disk growth, memory-tree rows, double-ingestion on reconnect. | Integration |
| 18 | P1 | O | Delete `~/.openhuman/` while running; capture data-loss surface and recovery path. | Integration |
| 19 | P1 | D | Generate 50 KB of mixed CJK + ZWJ-emoji + RTL + Devanagari; push through TokenJuice and diff grapheme counts before/after. | Unit |
| 20 | P1 | I | Stand up a fake Composio API that returns an unauthorized OAuth token; observe whether the desktop silently stores it. | Integration |

Distribution: P0 = 10 (50%), P1 = 10 (50%) — reflecting "early beta" status; lower priorities exist in the per-factor lists.

---

## Coverage Matrix: Existing Tests vs SFDIPOT Gaps

Sources counted: `/tmp/openhuman/tests/` (20 Rust integration tests), `/tmp/openhuman/app/test/e2e/specs/` (55 WDIO E2E specs), `/tmp/openhuman/app/test/` (~8 frontend unit), `/tmp/openhuman/scripts/tests/` (1 Pester), inline `*_tests.rs` files (extensive).

| Factor | Existing Coverage Examples | Gap Severity | Notes |
|--------|----------------------------|--------------|-------|
| **S** Structure | `app/test/info-plist-required-keys.test.ts`, inline `_tests.rs` modules, `linux_cef_deb_runtime_e2e.rs`, `tauri-cef-pin-guard.yml` | **HIGH gap** | No feature-matrix sweep; no failure-injection on subsystem panic; no submodule-missing build test; no `Cargo.lock` divergence test. |
| **F** Function | Extensive Rust unit + 55 E2E specs covering chat, skills, OAuth flows, voice, wallet, webhooks, channels, etc.; `agent_*` and `memory_*` E2E exist | **MEDIUM gap** | Happy paths well covered. Adversarial input, prompt injection, skill sandbox escape, wallet MITM, migration crash all missing. |
| **D** Data | `memory_roundtrip_e2e.rs`, `memory_graph_sync_e2e.rs`, `agentmemory_backend.rs`, `agent_memory_loader_public.rs`, `agent_retrieval_e2e.rs`, `autocomplete_memory_e2e.rs`, `inline tests` for migrations + ops | **HIGH gap** | No concurrency-on-same-SQLite (binaries vs desktop), no disk-full, no encryption-key-loss recovery, no PII egress check, no FTS5-growth bound, no plaintext-vault leak check. |
| **I** Interfaces | `json_rpc_e2e.rs`, `webview_apis_bridge.rs`, `live_routing_e2e.rs`, `tauri-commands.spec.ts`, `webhooks-*.spec.ts`, `tool-*-flow.spec.ts`, `inference_provider_e2e.rs` | **HIGH gap** | No fuzzing of `/rpc`, no port-9222 CDP-takeover test, no CSP review/test, no malformed deep-link, no PATH-hijack on `WHISPER_BIN`/`PIPER_BIN`/`OLLAMA_BIN`, no Composio-impersonation. |
| **P** Platform | `linux_cef_deb_runtime_e2e.rs`, `installer-smoke.yml` (dry-run only), `OpenHumanWindowsInstall.Tests.ps1` (MSI args), `build-desktop.yml` matrix, container image `openhuman_ci:rust-1.93.0` | **HIGH gap** | No fresh-VM install verification, no TCC revoke test, no CEF cache poisoning, no `mem_limit` OOM behaviour, no real Windows console matrix, no Ubuntu 22.04 with libwebkit 4.0 missing. |
| **O** Operations | 20 workflows, `coverage.yml`, `observability_smoke.rs`, `tokenjuice_integration.rs`, `pr-quality.yml` (soft) | **MEDIUM gap** | No backup/restore test, no analytics-off telemetry verification, no Doctor diagnostic correctness, no real install.sh end-to-end (only dry-run), no partial-update recovery, no log-rotation under load. |
| **T** Time | `subconscious_e2e.rs`, `chat-harness-cancel.spec.ts`, `chat-harness-send-stream.spec.ts`, `cron-jobs-flow.spec.ts`, `composio/auth_retry_tests.rs`, `skill-socket-reconnect.spec.ts`, `cdp/session.rs` paused-time unit | **MEDIUM gap** | No clock-skew test, no system-time-jump, no overlapping-schedulers race, no Meet+dictation+STT collision, no sleep/wake mid-cron, no Docker healthcheck false-positive (deadlock detection). |

**Top hidden-gap themes** (cross-cutting):
1. **Adversarial input handling** — almost zero coverage. All E2E flows use clean fixtures.
2. **Concurrency between binaries and desktop** — backfill binaries are not tested against a running core.
3. **Sandbox escape** — QuickJS skill runtime has no negative tests visible.
4. **Real install / real upgrade** — only dry-runs in CI.
5. **Privacy claims under audit** — no test asserts "analytics off = nothing leaves the box".

---

## Strategic Recommendations: Where to Invest Test Effort First

### Tier 1 — Investment in next sprint (highest yield per hour)

1. **Build an adversarial-input corpus** for prompt injection, ingest it through every connector (Gmail, Notion, Slack, Telegram, etc.) and gate releases on the detector blocking ≥ a defined %. This single corpus pays back across F, I, and D factors. *Existing surface: `src/openhuman/prompt_injection/tests.rs` exists but coverage breadth is unknown.*
2. **Port 9222 / CDP isolation hardening + tests** — restrict the debug port or auth it; add a test that asserts a non-OpenHuman local process *cannot* drive the CEF webviews. This closes the single largest local-privilege gap.
3. **`/rpc` fuzzer** — JSON-RPC under cargo-fuzz / `wiremock` adversarial frames. Cheap, fast, catches deserialization panics that crash the embedded core (and thus the GUI).
4. **Migration crash-safety harness** — power-off SQLite mid-migration on every migration in `src/openhuman/migrations/`. Migration bugs are silent and catastrophic.
5. **Analytics-off audit** — a recurring CI step that runs the app with `OPENHUMAN_ANALYTICS_ENABLED=false` and asserts pcap-level egress is zero. Marketing parity check; cheap to automate.

### Tier 2 — Investment in next quarter

6. **Real install on fresh VMs** — Lima/Tart/Vagrant/Windows Sandbox images for macOS, Ubuntu 22.04, Ubuntu 24.04, Windows 11. Run actual `install.sh` and `install.ps1` end-to-end, including update path. `installer-smoke.yml` is dry-run only today.
7. **Wallet adversarial suite** — MITM RPC, replay, chain-id confusion, malformed ABI, sign-without-confirmation. Wallet drain is the highest-impact single bug class.
8. **Skill sandbox negative tests** — install a malicious skill, audit which APIs it can reach. Pair with a documented "skill trust tier" model if it doesn't exist.
9. **Concurrent-binary test rig** — run `gmail-backfill-3d` + `slack-backfill` + desktop concurrently with synthetic workloads, run `PRAGMA integrity_check` on exit. Three commands of CI yield. 
10. **Auto-fetch chaos** — partition network, fill disk, return giant payloads from connectors during the 20-min loop. Throughput/resilience characteristics matter for "always running" desktop apps.

### Tier 3 — Investment when stable

11. **TokenJuice grapheme/CJK regression suite** — fixed corpus of edge-case Unicode, diffed before/after compression. Cheap to maintain, prevents marketing-claim regressions.
12. **macOS TCC matrix** — revoke each entitlement (Full Disk, Accessibility, Screen Recording, Camera, Mic, Contacts, Notifications) and capture user-visible state. Manual but high-signal.
13. **Sleep/wake/clock-skew matrix** — drive faketime-style tests through `scheduler_gate`, `cron`, `composio/periodic`, `subconscious`, `auto-fetch`.
14. **Privacy egress map** — for each external service (Composio, Sentry x3, Seltz, SearXNG, ElevenLabs, OpenAI, Anthropic, Ollama-default, LM-Studio-default, Tinyhumans backend) document and test what data goes out, when, and under what flag. Make this a maintained matrix in `docs/`.
15. **Doctor correctness** — programmatic faults (missing binary, expired token, full disk, no internet) cross-checked against Doctor's output.
16. **Convert `pr-quality.yml` from `continue-on-error: true` to hard-fail** — the comment in the workflow itself says to do this; until done, the gates are theatre.

### Cross-cutting observation: "Early beta" + 95 subsystems + 118 integrations + wallet + auto-update

OpenHuman has the surface area of a **mid-sized OS** and the maturity label of a beta. The current test suite is dense in *happy-path E2E* and thin in *adversarial, resource-pressure, and concurrency* tests. Investment should shift from adding more E2E specs (already 55) toward **negative testing, resource-pressure, and the trust boundaries** (skills, wallet, RPC, CEF, update). The smallest test effort with the largest expected risk reduction is *adversarial-corpus-driven testing against the prompt-injection detector and the JSON-RPC interface* — both have a single owning module and a finite input space, but block the largest blast radius.
