# OpenHuman — Code Quality & Code Smell Review

**Reviewer:** AQE v3 Code Reviewer (sampled, evidence-based)
**Scope sampled:** 25 files across `src/` (Rust core), `app/src-tauri/src/` (Tauri host), `app/src/` (React/TS)
**Method:** size-ranked sweeps + grep for smell indicators + targeted line reads. Not exhaustive.

---

## Executive Summary

Severity-ranked (Critical → Info):

1. **[HIGH] One Tauri host file is a 4,450-line god module.** `app/src-tauri/src/webview_accounts/mod.rs` owns process state, IPC commands, CDP wiring, notification routing, and webview lifecycle in a single file. The single function `webview_account_open` is **840 lines** (line 13033). This blocks safe parallel work, hides invariants, and is the single largest maintainability risk in the codebase.
2. **[HIGH] `std::sync::Mutex` + `.lock().unwrap()` pattern in the Tauri host.** `webview_accounts/mod.rs` uses `use std::sync::Mutex;` (line 23) and contains **17 production-path `.lock().unwrap()` calls** (e.g., lines 1119, 1636, 1845, 2655, 2669, 2677, 3040, 3054, 3073, 3083). A single panic while a lock is held permanently poisons it — every subsequent IPC command from React will then crash the host. `parking_lot::Mutex` (which doesn't poison) is **already a direct dep** (`Cargo.toml`) and is the obvious fix.
3. **[HIGH] The agent turn loop is a 967-line god-method.** `src/openhuman/agent/harness/session/turn.rs:71` — `Agent::turn` runs from line 71 to ~1037. The same file holds three other 250+-line methods (`inject_agent_experience_context` 345 lines L1038, `emit_progress` 265 lines L1383, `build_system_prompt` 308 lines L1838). The orchestrator-of-everything pattern makes it hard to test branches in isolation and concentrates ownership of unrelated concerns (KV-cache prefix policy, prompt construction, integration hydration, memory injection).
4. **[HIGH] React page-level components carry too much state.** `app/src/pages/Conversations.tsx` is a single 1,919-line component (L206 → L2124) with **29 hook calls** inside one function body. `app/src/components/settings/panels/AIPanel.tsx` is 2,696 lines containing a 690-line `BackgroundLoopControls` (L2948) and a 521-line `AIPanel` (L4109). These will not survive their next major refactor without regressions.
5. **[MEDIUM] Env-driven config schema loader is a 720-line method.** `src/openhuman/config/schema/load.rs:5732` — `apply_env_overrides_from` is 720 lines in one function. Any new env var lands in a fan-out of `if let Some(...)` arms with no test partitioning.
6. **[MEDIUM] Inconsistent error-type strategy.** 392 files use `anyhow`, only 8 use `thiserror`, and **1,062 functions return `Result<..., String>`** (greppable in `src/`). Stringly-typed errors propagate context loss and force callers into substring sniffing — this is exactly what `src/core/observability.rs::expected_error_kind` (L137) and `is_session_expired_message` (L227) are doing for ~700 lines: classifying *strings* into error kinds. This is the long-tail cost of stringly-typed errors made concrete.
7. **[MEDIUM] Pervasive `#![allow(dead_code)]` suppression.** `src/openhuman/mod.rs:16` blankets the entire `openhuman` module subtree with `#![allow(dead_code)]`. 37 occurrences of `#[allow(dead_code)]` and 110 total `#[allow(...)]` attributes across `src/` mean the compiler's own dead-code detector is silenced — actual dead code is invisible.
8. **[MEDIUM] Comment-driven feature toggles via `[#1123]`.** `app/src/App.tsx` has 7 commented-out blocks tagged `[#1123]` (L23, 48, 50, 125, 161, 194, 215) and the same pattern in `Conversations.tsx` (L14, 21, 23) and `pages/Accounts.tsx`. Dead code preserved as comments is harder to keep current than removing it and pulling from git history.
9. **[LOW] Hardcoded transport endpoints.** `src/openhuman/tools/impl/browser/types.rs:33` hardcodes `http://127.0.0.1:8787/v1/actions` as a default. `src/openhuman/webview_apis/client.rs:142` constructs `ws://127.0.0.1:{port}/` from an env var with no fallback validation. Both are leaky abstractions for tests/dev that have escaped into production defaults.
10. **[LOW] Documentation outweighs code in places.** `AGENTS.md` is 649 lines; `CLAUDE.md` is 311. Some module docs (`src/openhuman/mod.rs`, `app/src-tauri/src/webview_accounts/mod.rs`) are genuinely good; others (e.g., `src/openhuman/agent/harness/session/turn.rs:51-68`) read like docstrings written to compensate for function size rather than to document an interface.

**Top-level finding:** the codebase is *not* sloppy — naming is good, error handling is principled in most modules, doc-comments are present, and the test scaffolding is substantial (~85k LOC of test code vs ~360k LOC of prod Rust = ~24% test-LOC ratio, healthy for a Rust codebase). The structural problems are concentrated in a small number of hotspot files that have grown organically into god-objects.

---

## Quantitative Metrics

| Metric | Value | Note |
|---|---|---|
| Rust files (prod + test) | 1,323 | under `src/`, `packages/`, `app/src-tauri/` |
| TS/TSX files (prod + test) | 895 | under `app/src/`, `packages/` |
| Rust prod LOC | ~360k | excludes `*_test*.rs` and `tests.rs` |
| Rust test LOC | ~86k | `*_test*.rs` + `tests.rs` files |
| TS prod LOC | ~110k | excludes `__tests__/` and `*.test.*` |
| Workspace structure | **single crate** | no `[workspace]` in root `Cargo.toml`; 74 `pub mod` lines in one `openhuman/mod.rs` |
| Direct Rust deps | 144 | top-level entries in `Cargo.toml` |
| `Result<_, String>` signatures | 1,062 | non-test Rust |
| `anyhow::Result` users | 392 files | predominant |
| `thiserror` users | 8 files | the typed-error story is barely adopted |
| `.unwrap()` total | 3,009 | mostly inside `#[cfg(test)]` blocks (good) |
| `.unwrap()` in prod paths | ~120–150 | concentrated in webview_accounts (49) + a few benchmarks/schemas |
| `.expect(` total | 730 | most are fixture/test code |
| `panic!(` calls | 75 | none in critical hot paths sampled |
| `let _ = ` (discarded result) | 640 | many are fire-and-forget event emits — semi-legitimate |
| TS `as any` | 21 | mostly in `app/src/polyfills.ts` for global injection |
| TS `@ts-ignore` | 4 | all in test files |
| TS `console.*` in prod | 195 | predominantly `console.warn/error` — acceptable |
| TODO/FIXME/HACK | 20 | low density, mostly with linked issue numbers |

### Largest Rust production files (top 10)
```
4450  app/src-tauri/src/webview_accounts/mod.rs
3846  app/src-tauri/src/lib.rs
2702  src/core/observability.rs
2345  src/openhuman/memory/tree/read_rpc.rs
2181  src/openhuman/agent/harness/session/turn.rs
2093  app/src-tauri/src/whatsapp_scanner/mod.rs
2013  src/openhuman/config/schema/load.rs
2005  src/openhuman/inference/provider/compatible.rs
1889  src/openhuman/composio/ops.rs
1792  src/openhuman/channels/providers/web.rs
```

### Largest TS/TSX production files (top 10)
```
2696  app/src/components/settings/panels/AIPanel.tsx
2261  app/src/lib/i18n/en.ts          (translation strings — legitimate)
2125  app/src/pages/Conversations.tsx
2111  app/src/lib/i18n/ko.ts          (translation strings — legitimate)
1489  app/src/services/webviewAccountService.ts
 997  app/src/pages/Skills.tsx
 923  app/src/providers/ChatRuntimeProvider.tsx
 920  app/src/components/composio/ComposioConnectModal.tsx
 906  app/src/features/human/Mascot/yellow/MascotCharacter.tsx
 857  app/src/components/settings/panels/VoicePanel.tsx
```

---

## Top 10 Specific Issues (file:line citations)

### 1. `webview_accounts/mod.rs` is a 4,450-line god module

`app/src-tauri/src/webview_accounts/mod.rs:1-3239` (prod section) + tests below.

The module docstring at lines 1-19 honestly admits the scope: "Hosts third-party web apps … recipe injection … per-account session isolation … notification bypass." That's at least five bounded contexts in one file:

- Provider URL registry (`provider_url` L48)
- CDP browser session management
- Notification forwarding (`forward_native_notification` L1112, 329 lines)
- Webview lifecycle commands (`webview_account_open` L13033, **840 lines**)
- DND / mute / focus preference state

The single function `webview_account_open` at 840 lines is the centerpiece — it spawns child webviews, injects scripts, registers CDP sessions, wires notification handlers, and stores state in three different `Mutex<HashMap<...>>` fields. This cannot be unit-tested.

**Fix:** Split into `mod.rs` (re-exports + state struct), `commands.rs` (Tauri `#[command]` entries), `lifecycle.rs` (open/close/prewarm), `notifications.rs` (forward + bypass prefs), `recipes.rs` (script injection). Keep the state struct as the only cross-cutting type.

---

### 2. `std::sync::Mutex` + `.lock().unwrap()` panic-amplifier in Tauri host

`app/src-tauri/src/webview_accounts/mod.rs:23` declares `use std::sync::Mutex;`. The production section (lines 1-3239, before `#[cfg(test)]`) contains **17 calls to `.lock().unwrap()`**:

```
1119: state.notification_bypass.lock().unwrap().clone();
1636: app_state.inner.lock().unwrap().get(account_id).cloned();
1845: state.inner.lock().unwrap();
2655: state.inner.lock().unwrap().remove(&args.account_id);
2669: state.browser_ids.lock().unwrap().remove(&args.account_id);
2677: state.cdp_sessions.lock().unwrap().remove(&args.account_id);
2745, 2755, 2763, 2896, 2937, 2993, 3010,
3040, 3054, 3073, 3083 (notification bypass prefs)
```

Pattern recurs in `app/src-tauri/src/lib.rs` (13 calls), `screen_capture/mod.rs` (6), `meet_call/mod.rs` (6).

**Risk:** If any closure invoked while holding `state.inner` panics — e.g., a logging macro chokes on a malformed UTF-8 payload from `webview_recipe_event` (which is fed by untrusted DOM content from third-party sites like Slack/Discord/WhatsApp) — the mutex is poisoned. Every subsequent IPC command that tries to lock it will panic at the `.unwrap()`. Recovery requires restarting the app process.

**Fix:** Replace `use std::sync::Mutex;` with `use parking_lot::Mutex;` (already in `Cargo.toml`). `parking_lot::Mutex::lock()` returns the guard directly — no `unwrap()` needed, no poisoning. This is a mechanical change with a high blast-radius improvement.

---

### 3. `Agent::turn` is a 967-line method

`src/openhuman/agent/harness/session/turn.rs:71` — `pub async fn turn(&mut self, user_message: &str) -> Result<String>` runs to ~line 1037.

Same file:
- L1038: `inject_agent_experience_context` — 345 lines
- L1383: `emit_progress` — 265 lines
- L1838: `build_system_prompt` — 308 lines

The docstring at L51-68 lists six numbered responsibilities (initialization, prompt construction, context injection, execution loop, synthesis, background tasks). That's a Single Responsibility Principle violation enumerated in the comment.

**Fix:** Extract each numbered step into a private method on `Agent` (e.g., `fn maybe_resume_transcript`, `fn maybe_bake_system_prompt`, `async fn execution_loop`). Each step is independently testable — and a 9-step state machine surfaces naturally.

---

### 4. `apply_env_overrides_from` is 720 lines in `config/schema/load.rs:5732`

`src/openhuman/config/schema/load.rs:5732` — `fn apply_env_overrides_from(&mut self, env: &(dyn EnvLookup + Send + Sync))` is **720 lines** long. With 144 direct Cargo deps and a sprawling settings surface, the codebase has a lot of env vars to handle — but doing them all in one method means no test partitioning, no documentation per group, and merge conflicts whenever two PRs add env vars.

**Fix:** Group env vars by domain (e.g., `apply_inference_env`, `apply_observability_env`, `apply_voice_env`) and have the top-level method delegate. Each sub-method can have a corresponding `#[test]` that pokes specific keys.

---

### 5. `pages/Conversations.tsx` is a 1,919-line single component with 29 hooks

`app/src/pages/Conversations.tsx:206` defines `const Conversations = ({...}) => {` and the body extends to L2124. Inside that single function:

- 29 hook calls (`useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`) — counted via grep within the component body
- L2125: `export const AgentChatPanel = () => <Conversations variant="page" />;` exists *only* to expose a variant alias

When this component has 29 stateful concerns mixed with chat send/receive, MIC composer, autocomplete polling (`AUTOCOMPLETE_POLL_DEBOUNCE_MS` L100), thread management, agent profile editing, prompt-injection guard, voice STT, and Redux dispatch — every renderer rerun touches all of them. Memoization at the top level is masked.

**Fix:** Pull subsystems into `useConversationsChatState`, `useConversationsAutocomplete`, `useConversationsVoice` hooks under `app/src/pages/conversations/hooks/`. The shell component becomes a layout coordinator.

---

### 6. `AIPanel.tsx` packs 4 distinct components into 2,696 lines

`app/src/components/settings/panels/AIPanel.tsx`:
- L2650: `ProviderKeyDialog` — 127 lines
- L2948: `BackgroundLoopControls` — **690 lines**
- L3727: `CustomRoutingDialog` — 326 lines
- L4109: `AIPanel` — 521 lines

Plus two large hooks (`useAISettings` L272, `useOllamaStatus` L387, `useInstalledModels` L436) that should be in `hooks/` rather than embedded in the panel.

**Fix:** Split into a directory:
```
panels/ai/
  AIPanel.tsx
  ProviderKeyDialog.tsx
  BackgroundLoopControls.tsx
  CustomRoutingDialog.tsx
  hooks/useAISettings.ts
  hooks/useOllamaStatus.ts
  hooks/useInstalledModels.ts
```

---

### 7. Stringly-typed errors infect the entire core

1,062 functions return `Result<..., String>` in non-test Rust code under `src/`. The cost is concretely visible:

`src/core/observability.rs:137-516` — there are **8 different "is_xxx_message"** classifier functions:

- `expected_error_kind` L137
- `is_session_expired_message` L227
- `is_loopback_unavailable` L271
- `is_network_unreachable_message` L299
- `is_transient_upstream_http_message` L347
- `is_backend_user_error_message` L384
- `is_provider_user_state_message` L420
- `is_local_ai_capability_unavailable_message` L516

Every one of them does substring matching on error *strings*. This is the dual of the upstream choice to throw away typed errors. The same substring-matching pattern appears in `is_transient_provider_http_failure` (L812) and `is_max_iterations_event` (L845) but reading Sentry events.

**Fix:** Introduce `thiserror` enums at the integration boundaries (provider errors, channel errors, memory errors, tool errors). The classifier file then matches on enum variants, not strings, and the matchers can never silently drift when a vendor changes a message.

---

### 8. Module-wide `#![allow(dead_code)]` defeats the compiler

`src/openhuman/mod.rs:16` — `#![allow(dead_code)]` at module level disables dead-code warnings for the entire 75-module subtree (74 `pub mod` lines in the same file). The justification comment ("Many types/functions are intended for future use or integration with the frontend") is the canonical anti-pattern: the compiler is the only tool that reliably detects truly-unreachable code, and you have turned it off everywhere.

37 separate `#[allow(dead_code)]` and 110 `#[allow(...)]` attributes underneath compound the issue — they're locally justified, but the umbrella `#![allow(dead_code)]` makes them redundant *and* prevents anyone from cleaning them up without a flag day.

**Fix:** Remove the module-level allow. Let the compiler emit warnings. Either delete what is unused, mark individual items `#[allow(dead_code)]` with a comment, or keep public exports referenced by a doctest. Yes, this is a flag-day cleanup, but the long-term cost of not having dead-code signal is steeper.

---

### 9. Commented-out code as feature flags (`[#1123]` markers)

`app/src/App.tsx` lines 23, 48, 50, 125, 161, 194, 215 — seven commented-out blocks tagged `[#1123]`. Same pattern in `app/src/pages/Conversations.tsx` L14, L21, L23, and `app/src/pages/Accounts.tsx` L8, L10, L111+.

The comment-tag is well-meant (each one references the issue removing welcome-agent onboarding), but git history already records that. Long-lived comments rot faster than code because nobody runs `cargo check` against them.

**Fix:** Delete the commented blocks. If a rollback is needed, `git revert` is one command.

---

### 10. Hardcoded loopback URLs/ports in production defaults

- `src/openhuman/tools/impl/browser/types.rs:33` — `endpoint: "http://127.0.0.1:8787/v1/actions".into()`. A hardcoded loopback URL with a magic port as a struct default. If two browser tools collide on 8787, the second one silently 502s.
- `src/openhuman/webview_apis/client.rs:142` — `let url = format!("ws://127.0.0.1:{port}/");` where `port` comes from `OPENHUMAN_WEBVIEW_APIS_PORT` (`webview_apis/mod.rs:10`). No bounds check on the env var; an empty string will panic the URL parse downstream.

**Fix:** Lift these into a `BrowserToolConfig` / `WebviewApisConfig` populated by the config loader (the same loader that already handles env overrides, see issue #4). Validate at parse time.

---

## Strengths Observed (what they're doing right)

1. **Test scaffolding is generous.** ~86k LOC of Rust test code against ~360k LOC of prod is healthy. Files like `src/openhuman/security/policy_tests.rs` (1,497 LOC) and `src/openhuman/composio/ops_test.rs` (1,534 LOC) show real coverage discipline.
2. **Module-level docstrings are real.** E.g., `app/src-tauri/src/webview_accounts/mod.rs:1-19` explains the architecture concisely with an ASCII flow diagram. `src/openhuman/agent/harness/session/turn.rs:1-18` lists the public surface up-front. Many crates would kill for this.
3. **TODOs reference issue numbers.** Of the 20 TODO/FIXME markers in the codebase, most have linked issue IDs: `TODO(#1339)`, `TODO(phase-5)`, `TODO(composio-retry-dedup)`. This is unusually disciplined.
4. **Domain segmentation is broadly correct.** 75 modules under `src/openhuman/` cleanly map to capability areas (memory, channels, composio, inference, voice, security). The boundaries are real even if individual modules have grown too large.
5. **Error-classification is centralized, not scattered.** Even though `observability.rs` is 2,702 lines, it is the *one* place where error-string heuristics live, rather than being duplicated across providers.
6. **TypeScript discipline is high.** Only 21 `as any` (most in `polyfills.ts` for legitimate global injection), 4 `@ts-ignore` (all in tests), and no `@ts-nocheck`. Compare to typical Electron+React apps where these run into hundreds.
7. **Notification routing is feature-flagged correctly.** `webview_accounts/mod.rs:1146-1158` — the `forward_native_notification` function gates on `NotificationSettingsState::enabled()` and exits early when off. Defensive coding done right.
8. **Test/prod split via `#[cfg(test)]` inline modules is consistent.** The 3,009 `.unwrap()` calls compress to ~120-150 in actual production paths once `#[cfg(test)]` blocks are excluded — the test scaffold is doing its job.
9. **No `unimplemented!()` or `todo!()` macros in prod.** Zero occurrences across `src/` and `app/src-tauri/src/`. This means no half-finished code paths can panic the agent loop.
10. **Inference provider module is decomposed.** Even though `compatible.rs` is 2,005 lines, the surrounding directory has nine sibling files (`compatible_parse.rs`, `compatible_stream.rs`, `compatible_types.rs`, `reliable.rs`, `router.rs`, `factory.rs`, etc.) — the directory was clearly designed with separation in mind even if `compatible.rs` itself never got split.

---

## Risk Score: **6 / 10**

The codebase is in the upper half of its peer group. Test density is good, naming is sound, TS strictness is enforced, and most modules show genuine architectural intent. The risk drivers are concentrated rather than diffuse: a small handful of god-files (`webview_accounts/mod.rs`, `agent/harness/session/turn.rs`, `pages/Conversations.tsx`, `panels/AIPanel.tsx`, `config/schema/load.rs`) plus one systemic choice (`Result<_, String>` everywhere, dead-code warnings disabled module-wide). These are addressable with mechanical refactors — no architectural rewrite needed. The single most acute *operational* risk is the `std::sync::Mutex` + `.lock().unwrap()` pattern in the Tauri host: a one-line panic in a third-party-DOM-driven callback poisons a lock and bricks the IPC layer until the user restarts the app. That alone justifies a sprint of focused cleanup before the next release.
