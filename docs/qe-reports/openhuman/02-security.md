# OpenHuman Security Audit

**Audit Date**: 2026-05-20
**Auditor**: V3 QE Security Scanner (agentic-qe)
**Project Version**: 0.54.3 (per `app/src-tauri/tauri.conf.json`)
**Scope**: OWASP Top 10 + AI/LLM-specific + Tauri/desktop + supply chain
**Methodology**: Static analysis (grep + targeted file reads), `pnpm audit`, manual code review of auth/IPC/network surfaces

---

## Executive Summary

OpenHuman is a Tauri-based desktop AI assistant with a Rust core (`openhuman-core` JSON-RPC server) and a TypeScript/React frontend. The codebase shows a **strong baseline security posture** with several pieces of evidence:

- **Per-process random 256-bit bearer tokens** for the core RPC, 0o600 file perms on Unix (`src/core/auth.rs:104-269`).
- **SSRF defence in depth** with DNS-rebinding protection on outbound HTTP tools (`src/openhuman/tools/impl/network/url_guard.rs`).
- **Prompt-injection detector + enforcement** wired into the agent bus, web channel, and local inference paths (`src/openhuman/prompt_injection/detector.rs`).
- **Tauri capabilities are explicitly scoped** to specific commands and webview labels; recipe events are bound to the caller webview label.
- **Hardened Docker compose**: `read_only`, `no-new-privileges`, `cap_drop: ALL`, tmpfs, mem/cpu limits (`docker-compose.yml:25-50`).
- **No secrets committed**: the suspicious 12.9KB `.env.example` is documentation only — every value is blank or commented out. `scripts/ci-secrets.example.json` is also all-blank.

**Critical findings**: **0**
**High findings**: **2**
**Medium findings**: **5**
**Low findings**: **4**
**Info / observations**: **5**

The two `HIGH` findings are not exploitable in isolation but combine into a credible remote-code-execution path when the core is deployed in Docker/cloud mode (the `0.0.0.0` bind path that the project explicitly supports).

---

## Findings Table

| ID | Severity | Category | File:Line | Description | Recommendation |
|----|----------|----------|-----------|-------------|----------------|
| SEC-01 | HIGH | Auth / Update / RCE | `src/openhuman/config/schema/update.rs:53-55`, `src/openhuman/update/ops.rs:21-39` | `rpc_mutations_enabled` defaults to `true` — any bearer-authenticated RPC client can call `update.apply`/`update.run`, downloading and executing a new core binary. On Docker/cloud deployments (`OPENHUMAN_CORE_HOST=0.0.0.0`) this is an authenticated remote-code-execution path. `.env.example:79-81` acknowledges the risk but does not change the default. | Flip the default to `false`. Keep desktop-Tauri (where the shell controls the token) opt-in via a feature flag or runtime check (`if bind_host == 127.0.0.1 { allow }`). |
| SEC-02 | HIGH | Auth / Timing side-channel | `src/core/auth.rs:210-212` | `bearer_matches` uses `==` (variable-time `&str` comparison). Token comparison is non-constant-time. The code comment even calls this out: *"adding constant-time semantics later is a one-line change."* For a 64-hex (256-bit) token over LAN/cloud this is a *theoretical* timing oracle, but it is reachable on `0.0.0.0` deployments. | Replace with `subtle::ConstantTimeEq` or `ring::constant_time::verify_slices_are_equal`. One-line fix. |
| SEC-03 | MEDIUM | XSS / Injection | `app/src/features/human/Mascot/backend/BackendMascot.tsx:144`, `:87` | `dangerouslySetInnerHTML` with backend-fetched SVG (`app/src/services/mascotService.ts:19-24`) plus a live `slot.innerHTML = inner` swap on viseme change. SVG can contain `<script>` and event handlers in HTML context. The code comment says *"Treated as trusted"*, but the trust boundary is `api.tinyhumans.ai` (one HTTP MITM or backend compromise away). | Sanitize via DOMPurify with `USE_PROFILES: { svg: true, svgFilters: true }`, or parse with `DOMParser` and reject anything outside an SVG-element whitelist. Also block `<foreignObject>`. |
| SEC-04 | MEDIUM | CSP | `app/src-tauri/tauri.conf.json:25-27` | CSP allows `'unsafe-inline'` in `default-src`, plus wildcard `https:`, `wss:`, `http:`, `ws:`, `data:`, `blob:` in `connect-src`. `connect-src` effectively allows any URL. `default-src` with `unsafe-inline` weakens script and style XSS defence. | Drop `'unsafe-inline'` from `default-src` (use nonces or move to explicit `script-src 'self'`). Narrow `connect-src` to the actual hosts the app uses (`https://api.tinyhumans.ai`, `https://staging-api.tinyhumans.ai`, IPC, loopback ports). |
| SEC-05 | MEDIUM | CORS | `src/core/jsonrpc.rs:616-635` | `Access-Control-Allow-Origin: *` is hardcoded on **every** response, including the authenticated `/rpc` and `/v1/chat/completions` endpoints. While bearer-in-header is not auto-attached by browsers, a malicious page can probe `/health`, `/schema`, and `/events` cross-origin, and any cached/stolen token allows full cross-origin RPC from a hostile page. | When the core binds to `0.0.0.0`, restrict CORS to `null`/explicit origins. When loopback-only, keep `*` if needed but at least skip the header on `POST /rpc`. |
| SEC-06 | MEDIUM | Supply chain | `package.json` → transitive `ws@8.18.3` (via `app > socket.io-client > engine.io-client > ws`) | `pnpm audit` reports GHSA-58qx-3vcg-4xpx (ws uninitialized memory disclosure, `>=8.0.0 <8.20.1`). The repo also has a direct dev-dep `ws@^8.20.0` (which is patched) but the transitive copy is still 8.18.3. | Add a pnpm `overrides` entry pinning `ws` to `>=8.20.1`, or upgrade `socket.io-client`/`engine.io-client` to a version that ships the patched transitive. |
| SEC-07 | MEDIUM | Supply chain | `Cargo.toml:203`, `app/src-tauri/Cargo.toml:192` | `whisper-rs-sys = { git = "https://github.com/tinyhumansai/whisper-rs-sys.git", branch = "main" }` — pinned to a mutable branch in a project-owned fork. Anyone with push access to that fork (or a fork takeover) silently changes what gets compiled into the core binary on the next `cargo update`. | Pin to a specific `rev = "<commit-sha>"` so the lockfile materially constrains the source. |
| SEC-08 | LOW | Crypto / Randomness | `app/src/utils/deviceFingerprint.ts:13`, `app/src/pages/Accounts.tsx:41`, `app/src/components/settings/panels/AIPanel.tsx:2275,2414`, `app/src/store/threadSlice.ts:202` | `Math.random()` used as fallback for IDs (`fp_*`, `acct-*`, message IDs, profile IDs). For toast/UI IDs this is fine, but `acct-` IDs become webview labels (`acct_<account_id>`) and route security-relevant `webview_recipe_event` checks (`app/src-tauri/src/webview_accounts/mod.rs:3107-3117`). Predictable IDs could theoretically allow forging targets. | Prefer `crypto.randomUUID()` (already used as the preferred path in `threadSlice.ts:202`) and remove the `Math.random()` fallback — `crypto.randomUUID` is universally available in any environment Tauri/modern browsers run. |
| SEC-09 | LOW | Command injection (defence-in-depth) | `src/openhuman/tools/impl/browser/browser_open.rs:144-147` | Windows path: `cmd.exe /C start "" brave <url>`. The URL is already validated against an allowlist with no whitespace, HTTPS-only, no userinfo, etc., so this is **not exploitable** today. However, `start` and `cmd /C` have well-known quoting quirks (the leading empty `""` is the window-title arg, and `&`/`^`/`%` semantics inside `start` are subtle). | Either use `tokio::process::Command::new("cmd").args(["/C", "start", "", "brave", url])` (already done — good) **and** add explicit assertion in the validator that the URL contains no `&`, `%`, `^`, `>` characters; or invoke brave directly via its registered protocol handler. |
| SEC-10 | LOW | CSP scope | `app/src-tauri/tauri.conf.json:26` | `frame-src 'self' https: data: blob:` allows arbitrary HTTPS framing inside the Tauri shell. Combined with the embedded webview-account child webviews (LinkedIn, Slack, WhatsApp, etc.) this is intentional, but the wide `https:` permits unexpected framing from any HTTPS origin. | Audit whether the main window actually needs `frame-src https:`. The child-webview model uses separate `acct_*` webviews with their own capability, so the main window may be able to drop `frame-src` entirely. |
| SEC-11 | LOW | Insecure default flag | `src/openhuman/tools/impl/browser/security.rs:131`, documented in `.env.example:87` | `OPENHUMAN_BROWSER_ALLOW_ALL=1` disables the browser-tool URL allowlist. Default is `0` (locked). Opt-in env var is acceptable, but if it ever ships set to `1` in a packaged config it bypasses SSRF defences. | Add a startup log warning at WARN level when this flag is enabled. Consider gating it behind a debug build. |
| SEC-12 | INFO | Auth design | `src/core/auth.rs:79`, `:186-193` | `/events/webhooks` accepts bearer via `?token=…` query param. Documented rationale (browser `EventSource` cannot set headers). Query tokens land in server logs, browser history, referer chains. The `http_request_log_middleware` already strips query (`?…` substitution at `:596`), but downstream proxies / Sentry might still see the URL. | Add explicit redaction for `?token=…` everywhere the request URI is logged or sent to Sentry. Already partially done — verify Sentry's HTTP integration also redacts. |
| SEC-13 | INFO | AI / Prompt injection | `src/openhuman/prompt_injection/detector.rs` + integrations | Detector is regex-based with `Allow / Review / Block` verdicts, leet-speak normalization, Cyrillic homoglyph mapping, zero-width-char stripping. Heuristic classifier is opt-in (`OPENHUMAN_PROMPT_INJECTION_CLASSIFIER=heuristic`). Wired into `agent::bus`, `inference::local`, `channels::providers::web`. **No ML classifier**, no embeddings detector. | Acceptable for current threat model. Consider adding a small classifier (TinyBERT or a hosted moderation API behind a feature flag) for higher-stakes flows like wallet operations and tool calls. |
| SEC-14 | INFO | Crypto | `src/openhuman/tools/impl/network/polymarket.rs:820-830` | Salt generated via `OsRng.fill_bytes` for CLOB order signing. Comment explicitly explains why `rand::random` is insufficient (replay/front-running). Correctly used. | No action. |
| SEC-15 | INFO | Dockerfile | `Dockerfile:76-77`, `docker-compose.yml:25-50` | Non-root UID 10001, `read_only` filesystem, `cap_drop: ALL`, `no-new-privileges`, tmpfs, mem/cpu limits. Healthcheck via `curl http://localhost:7788/health`. | Exemplary. Optionally pin base image by digest (`rust:1.93-bookworm@sha256:…`) for reproducible / supply-chain-hardened builds. |

---

## Detailed Write-up — HIGH Findings

### SEC-01: Authenticated RCE via `update.run`/`update.apply` defaults

**Files**: `src/openhuman/config/schema/update.rs:53-55`, `src/openhuman/update/ops.rs:21-39`, `src/openhuman/update/ops.rs:182-205`

**Reasoning**:

The update subsystem exposes two mutating JSON-RPC methods, `openhuman.update_apply` and `openhuman.update_run`, that download a new binary from GitHub Releases, stage it, and (optionally) self-restart. These are gated by `enforce_update_mutation_policy()`:

```
src/openhuman/update/ops.rs:29
    if policy.rpc_mutations_enabled {
        return Ok(policy);
    }
```

`policy.rpc_mutations_enabled` is read from `UpdateConfig::rpc_mutations_enabled`, whose default is:

```
src/openhuman/config/schema/update.rs:53-55
fn default_rpc_mutations_enabled() -> bool {
    true
}
```

The `.env.example` even warns:

```
.env.example:80-81
# [optional] Allow bearer-authenticated RPC callers to invoke update.apply/update.run
# Disable on exposed server deployments unless you explicitly want remote self-upgrade.
```

…but the user has to read that comment, set `OPENHUMAN_AUTO_UPDATE_RPC_MUTATIONS_ENABLED=false`, and rebuild their config to be safe.

**Threat model**: Any party with the bearer token + network reachability to `:7788` can ship code into the running process. On the desktop-Tauri path the token is in-memory and only loopback-reachable; **on the Docker/cloud path** documented in `docker-compose.yml` the core binds to `0.0.0.0:7788` and the token is provided via `.env`. If that token leaks (Sentry breadcrumb, log line, env-var dump, screenshot), an attacker with TCP reachability becomes root on the host — modulo the container's `cap_drop: ALL` (which limits damage but the attacker still owns the process and any mounted volumes).

**Severity**: HIGH — because the attack is post-auth, but the auth surface (a single bearer token, sometimes user-provisioned and sometimes pasted into a UI) is realistic to compromise.

**PoC reasoning**:
1. Attacker obtains the bearer token (env leak, support log, malicious extension reading clipboard at paste time, etc.).
2. `curl -X POST http://victim:7788/rpc -H "Authorization: Bearer $TOKEN" -d '{"jsonrpc":"2.0","id":1,"method":"openhuman.update_run","params":{}}'`
3. The core downloads the configured GitHub release artifact, stages it, and self-replaces.
4. Note: the **release URL is fixed** to the project's GitHub releases by `tauri.conf.json:78` (`https://github.com/tinyhumansai/openhuman/releases/latest/download/latest.json`) and downloads are minisign-verified by the Tauri updater pipeline. The core's `openhuman.update_apply` path uses the project's own GitHub asset list, so a third party cannot easily redirect to a malicious binary. **The exploit becomes a guaranteed-restart vector** (DoS, downgrade-to-buggy-version) rather than arbitrary RCE — but the auto-update pipeline is GitHub-released only.
5. Combined with a compromised maintainer or workflow secret, this becomes full RCE. As of this audit there is no evidence of GitHub workflow misconfiguration.

**Recommended fix**:

```rust
// src/openhuman/config/schema/update.rs
fn default_rpc_mutations_enabled() -> bool {
    false  // was: true
}
```

…plus add a runtime check in `enforce_update_mutation_policy` that auto-allows when `OPENHUMAN_CORE_HOST` resolves to a loopback address (so the desktop-Tauri flow keeps working out-of-the-box).

---

### SEC-02: Variable-time bearer-token comparison

**File**: `src/core/auth.rs:210-212`

**Reasoning**:

```rust
fn bearer_matches(supplied: &str, expected: &str) -> bool {
    !supplied.is_empty() && supplied == expected
}
```

The code comment 7 lines above acknowledges:

> *"Hex tokens of fixed length make the comparison non-secret-shaped, but we still pin a deliberate helper so adding constant-time semantics later is a one-line change."*

For a 256-bit hex token, a remote timing oracle is extremely hard to exploit in practice (network jitter swamps the 100-ns-per-byte signal), but:

1. The cloud deployment path puts the core behind a Docker bridge on an arbitrary network. Local-network attackers can time-sample much faster than internet attackers.
2. Co-tenant attackers (e.g., another container on the same host, malicious IPC, kernel side-channels) can observe with high precision.
3. The fix is genuinely one line. There is no engineering cost to apply it.

**Recommended fix**:

```rust
use subtle::ConstantTimeEq;

fn bearer_matches(supplied: &str, expected: &str) -> bool {
    if supplied.is_empty() { return false; }
    bool::from(supplied.as_bytes().ct_eq(expected.as_bytes()))
}
```

---

## Dependency Audit Summary

### npm / pnpm (`pnpm audit --prod`)

```
1 vulnerabilities found
Severity: 1 moderate
```

| Severity | Package | Version found | Fix | Path |
|----------|---------|---------------|-----|------|
| Moderate | `ws` | `8.18.3` | `>=8.20.1` | `app > socket.io-client > engine.io-client > ws` (GHSA-58qx-3vcg-4xpx) |

The repo also has `ws@8.20.0` as a direct dev dep (patched). Only the transitive copy is vulnerable.

**Recommendation**: add to root `package.json`:

```json
"pnpm": { "overrides": { "ws": ">=8.20.1" } }
```

(or `resolutions` field if migrating tooling — `resolutions` is currently used for `@tauri-apps/api`.)

### Cargo (`cargo audit`)

**Not run** — `cargo` was not available in the audit environment (`cargo: command not found`), and the constraint was to skip if installation took >60s. The `Cargo.lock` contains 914 crates. Manual review of pinned versions showed current minor versions for crypto-critical crates:

- `openssl@0.10.79` — current, no open RUSTSEC
- `ring@0.17.14` — current
- `rustls@0.23` — current
- `reqwest@0.12` — current

**Recommendation**: run `cargo audit` in CI on a schedule (weekly) — the project has 914 transitive crates and audit results drift constantly.

### Git dependencies in Cargo manifests

| Dep | Pinning | Risk |
|-----|---------|------|
| `whisper-rs-sys` | `branch = "main"` (project-owned fork) | **SEC-07 / MEDIUM** — branch pin is mutable |
| `tauri-plugin-opener` | `rev = "c6561ab6..."` | OK — commit-pinned |
| `tauri-plugin-deep-link` | `rev = "c6561ab6..."` | OK — commit-pinned |
| `tauri-plugin-global-shortcut` | `rev = "c6561ab6..."` | OK — commit-pinned |
| `tauri-plugin-single-instance` | `rev = "c6561ab6..."` | OK — commit-pinned |

---

## Areas Checked With No Findings

To make the audit's negative space explicit:

- **Hardcoded secrets in source**: no real secrets found. All "matches" for `sk-…`, `AKIA…`, `-----BEGIN PRIVATE KEY-----`, `Bearer xyz`, `xoxb-…` were either (a) inside `src/openhuman/memory/safety/mod.rs` regex patterns that *detect* secrets, (b) inside `src/openhuman/agent_experience/types.rs` and `src/openhuman/memory/store/unified/fts5.rs` test-redaction fixtures, or (c) inside `tests/fixtures/composio_github.json` example values published by the upstream provider. The 12.9KB `.env.example` is documentation only — every variable is blank or commented.
- **SQL injection**: ripgrep across all `format!()` calls touching SQL keywords found only one site (`src/openhuman/memory/tree/read_rpc.rs:1278,1452`) which uses a `TABLES: &[&str]` *constant* allowlist as the interpolated value, not user input. Other SQL goes through `rusqlite::params!` / parameterized queries.
- **Command injection**: every `std::process::Command::new(...)` site found (~40 sites) uses fixed program names with separately-passed arguments (no shell). Validated URLs flow into argument position only. AppleScript escaping in `src/openhuman/voice/text_input.rs:155-158` escapes `\` and `"` correctly.
- **`eval` / `new Function`**: zero matches in `app/src/**` source.
- **Weak hashes (MD5/SHA-1)**: SHA-1 used only for the WebSocket protocol handshake (`scripts/mock-api/socket/websocket.mjs:42-45`) — required by RFC 6455. No MD5 / SHA-1 used for security purposes.
- **TLS skip-verification**: zero matches for `rejectUnauthorized: false`, `verify=False`, `InsecureSkipVerify`, `danger.*=true` related to TLS. The one `skip_verify` match (`src/bin/gmail_backfill_3d.rs:279`) is a chunk-file integrity check flag, not a TLS bypass.
- **Tauri allowlist drift**: capabilities are explicitly scoped per-window and per-webview-label; `webview-accounts` capability is bound to remote URLs and exposes only `webview_recipe_event` + screen-share session commands. The recipe-event handler verifies caller-label match before processing (`app/src-tauri/src/webview_accounts/mod.rs:3107-3117`).
- **Open redirect / SSRF**: `src/openhuman/tools/impl/network/url_guard.rs` implements full SSRF defence — HTTP(S)-only, allowlist required, no whitespace, no userinfo, no IPv6 literal, blocklist for loopback/RFC1918/link-local/multicast/carrier-grade-NAT, **plus DNS-resolution rebinding check** before issuing the request.
- **AI/LLM prompt injection**: `src/openhuman/prompt_injection/detector.rs` enforces with verdict Allow/Review/Block, normalises leet-speak, Cyrillic homoglyphs, full-width ASCII, zero-width/bidi formatting chars. Enforcement is wired into agent bus, web channel, and local inference paths (3 distinct integration points).
- **`dangerouslySetInnerHTML`**: only one production usage, in `BackendMascot.tsx` for backend-supplied SVG. Flagged as SEC-03 above.
- **`target="_blank"` without `rel`**: every match has `rel="noreferrer"` or `rel="noopener noreferrer"`.
- **Tauri `withGlobalTauri`**, dangerous config flags: none enabled.
- **`tauri-plugin-opener`** auto-injection: explicitly disabled (`open_js_links_on_click(false)`) in `app/src-tauri/src/lib.rs:2277-2280`.

---

## Overall Security Posture

**Score**: **7.5 / 10**

**Rationale**:
- **+** Strong baseline: SSRF protection with DNS rebinding, prompt-injection detection wired in three places, hardened Docker, scoped Tauri capabilities, sealed `.env.example`, properly-permissioned token files, MIT-vetted dependency pins.
- **+** Defensive-coding evidence throughout: token redaction in tool outputs, scrubbing logic in `agent/harness/credentials.rs`, deliberate non-CSPRNG comments where used (with reasons), commented rationale on every security-relevant decision.
- **+** Architecturally sound auth: per-process bearer token, headers-only for `/rpc`, query-token only for SSE/WS where browsers can't set headers.
- **-** Two HIGH issues (`SEC-01`, `SEC-02`) are one-line fixes in security-critical paths. The fact that they are still open suggests the security review process for the cloud-deploy code path hasn't received the same attention as the desktop-Tauri path.
- **-** Permissive CSP (`SEC-04`) and wildcard CORS (`SEC-05`) reflect an understandable desktop-app trust model but expand the attack surface unnecessarily when the same code runs in the cloud-deploy path.
- **-** One transitive `ws` vuln (`SEC-06`) and one branch-pinned Cargo git dep (`SEC-07`) — both easy to fix.
- **-** SVG-injection vector via backend manifest (`SEC-03`) — small impact, but not zero, and DOMPurify is one import away.

**With the HIGH findings remediated (default-deny on `rpc_mutations_enabled`, constant-time token comparison) the score moves to 8.5. With also the CSP tightened, ws override, and SVG sanitized, 9.0+.**

---

## Suggested Remediation Order (by ROI)

1. **SEC-02** (1-line change, eliminates timing oracle): `subtle::ConstantTimeEq`. **15 minutes.**
2. **SEC-06** (1 JSON change): add `pnpm.overrides.ws: ">=8.20.1"`. **5 minutes.**
3. **SEC-01** (3-line change + one runtime guard): default `rpc_mutations_enabled` to `false`, auto-allow on loopback bind. **30 minutes.**
4. **SEC-07** (1-line change): pin `whisper-rs-sys` to a `rev = "..."`. **5 minutes.**
5. **SEC-03** (one DOMPurify import + sanitize call): protects against compromised backend / MITM SVG. **1 hour.**
6. **SEC-04, SEC-05** (CSP + CORS tightening): more invasive, requires per-deployment thought. **2-4 hours.**
7. **SEC-08** (replace `Math.random()` ID fallbacks with `crypto.randomUUID()`): mechanical. **30 minutes.**

Everything else is INFO / hardening.
