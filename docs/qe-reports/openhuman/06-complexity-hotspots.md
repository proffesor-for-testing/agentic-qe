# OpenHuman — Code Complexity Hotspots

**Scope analysed:** 2,282 source files (1,345 Rust + 937 TS/TSX), excluding `node_modules/`, `target/`, `dist/`, `build/`, `.git/`, declaration files.
**Aggregate:** 581,955 LOC (all), 483,916 LOC (production, ex-tests).
**Method:** LOC via `wc -l`, function spans via `awk` between `fn`/`function`/arrow declarations, branch counts via `grep -cE`, coupling via `use`/`import` line counts, indent depth via leading-space buckets (16 / 20 / 24 spaces).
**Note on churn:** TODO/FIXME density across the codebase is extremely low (max single-file count = 3). Churn-via-comment is **not a meaningful signal** here, so the report omits it from final ranking.

---

## 1. Top 30 largest source files (production + tests)

| Rank | LOC | File | Role |
|----:|----:|------|------|
| 1 | 6,306 | `tests/json_rpc_e2e.rs` | JSON-RPC end-to-end test harness (test code) |
| 2 | 4,450 | `app/src-tauri/src/webview_accounts/mod.rs` | Franz-style embedded webview hosting (WhatsApp/Slack/Discord/…) — Tauri child webview lifecycle, recipe injection, per-account session isolation |
| 3 | 3,846 | `app/src-tauri/src/lib.rs` | Tauri command/plugin wiring + app bootstrap |
| 4 | 2,702 | `src/core/observability.rs` | Tracing/metrics/logging plumbing |
| 5 | 2,696 | `app/src/components/settings/panels/AIPanel.tsx` | AI settings UI (providers, models, planner controls) |
| 6 | 2,345 | `src/openhuman/memory/tree/read_rpc.rs` | Memory-tree read-side RPC surface |
| 7 | 2,261 | `app/src/lib/i18n/en.ts` | English translation table (data) |
| 8 | 2,181 | `src/openhuman/agent/harness/session/turn.rs` | Per-turn agent loop (provider call, tool dispatch, progress emission) |
| 9 | 2,125 | `app/src/pages/Conversations.tsx` | Conversations page (threads, composer, message dispatch) |
| 10 | 2,111 | `app/src/lib/i18n/ko.ts` | Korean translation table (data) |
| 11 | 2,093 | `app/src-tauri/src/whatsapp_scanner/mod.rs` | WhatsApp DOM scraper / sync |
| 12 | 2,013 | `src/openhuman/config/schema/load.rs` | Config loader + env-var overrides + migration |
| 13 | 2,005 | `src/openhuman/inference/provider/compatible.rs` | OpenAI-compatible provider client (chat + streaming) |
| 14 | 1,889 | `src/openhuman/composio/ops.rs` | Composio integration ops |
| 15 | 1,834 | `src/openhuman/channels/providers/telegram/channel_tests.rs` | Telegram channel tests (test code) |
| 16 | 1,792 | `src/openhuman/channels/providers/web.rs` | Web channel provider |
| 17 | 1,717 | `src/openhuman/agent/harness/test_support_test.rs` | Agent test support (test code) |
| 18 | 1,699 | `src/openhuman/config/schema/load_tests.rs` | Config loader tests (test code) |
| 19 | 1,679 | `src/openhuman/agent/harness/subagent_runner/ops.rs` | Sub-agent inner tool-call loop |
| 20 | 1,659 | `app/src-tauri/src/discord_scanner/mod.rs` | Discord DOM scraper / sync |
| 21 | 1,656 | `src/openhuman/agent/harness/session/builder.rs` | Session/system-prompt builder |
| 22 | 1,617 | `src/openhuman/memory/tree/store.rs` | Memory-tree write-side store |
| 23 | 1,534 | `src/openhuman/composio/ops_test.rs` | Composio tests (test code) |
| 24 | 1,497 | `src/openhuman/security/policy_tests.rs` | Policy tests (test code) |
| 25 | 1,489 | `app/src/services/webviewAccountService.ts` | Front-end webview-account service |
| 26 | 1,488 | `src/openhuman/channels/runtime/dispatch.rs` | Channel message dispatch / routing |
| 27 | 1,483 | `src/core/jsonrpc.rs` | JSON-RPC core |
| 28 | 1,463 | `src/openhuman/tokenjuice/reduce_tests.rs` | TokenJuice reduce tests (test code) |
| 29 | 1,459 | `src/openhuman/inference/local/service/ollama_admin.rs` | Local Ollama service admin (install, diagnostics) |
| 30 | 1,422 | `src/openhuman/agent/prompts/mod_tests.rs` | Prompt tests (test code) |

Production-only top three (ignoring `*_test*`, `tests/`): `webview_accounts/mod.rs` (4,450), `app/src-tauri/src/lib.rs` (3,846), `core/observability.rs` (2,702).

---

## 2. Top 15 likely-most-complex files (combined score)

Score combines: LOC, branch-keyword density per 1k LOC, deep-nest line counts (≥16 / ≥20 / ≥24 leading spaces), match-arm density (`=>` count), imports/uses, and largest single-function span.

| Rank | File | LOC | Branches | Branches/1k | `=>` arms | 16sp | 20sp | 24sp | Imports | Biggest fn (LOC) | Verdict |
|----:|------|----:|---------:|------------:|---------:|----:|----:|----:|--------:|-----------------:|---------|
| 1 | `app/src-tauri/src/webview_accounts/mod.rs` | 4,450 | 302 | 67.9 | 86 | 318 | 163 | 71 | 17 | `webview_account_open` (839) | God-module: IPC + webview lifecycle + recipe injection + per-OS shims |
| 2 | `app/src-tauri/src/lib.rs` | 3,846 | 269 | 69.9 | 79 | — | — | — | 29 | `run` (255), `drop` impl block (1,051 spans) | Tauri bootstrap dumping-ground |
| 3 | `src/openhuman/agent/harness/session/turn.rs` | 2,181 | 150 | 68.8 | 47 | 300 | 261 | 146 | 26 | `turn` (~967) | Single function = 44% of file; high-density nesting |
| 4 | `src/openhuman/inference/provider/compatible.rs` | 2,005 | 152 | 75.8 | 33 | 229 | 225 | 146 | 9 | `stream_native_chat` (421) | Streaming SSE state machine; deepest 24-sp count of all hotspots |
| 5 | `src/openhuman/config/schema/load.rs` | 2,013 | 259 | **128.7** | 86 | 244 | 81 | 60 | 12 | `apply_env_overrides_from` (719) | Highest branch density in repo — huge env-var override switch |
| 6 | `src/openhuman/agent/harness/subagent_runner/ops.rs` | 1,679 | 126 | 75.0 | 39 | 207 | 154 | 99 | 22 | `run_typed_mode` (740), `run_inner_loop` (576) | Two giant loops in one file |
| 7 | `src/openhuman/channels/runtime/dispatch.rs` | 1,488 | 121 | 81.3 | 44 | 132 | 68 | 34 | 22 | (top non-test fn 133) | High coupling + high branch density |
| 8 | `src/openhuman/agent/harness/session/builder.rs` | 1,656 | 113 | 68.2 | — | 159 | 112 | 66 | 18 | — | Builder for the system prompt + tool list |
| 9 | `src/openhuman/inference/local/service/ollama_admin.rs` | 1,459 | 128 | **87.7** | — | — | — | — | 16 | `download_and_install_ollama` (445) | Installer + diagnostics + lifecycle in one |
| 10 | `src/openhuman/memory/tree/read_rpc.rs` | 2,345 | 94 | 40.1 | 14 | 245 | 118 | 35 | 22 | `delete_chunk_rpc` (166) | Large but flatter; per-RPC functions stay <170 LOC |
| 11 | `app/src/components/settings/panels/AIPanel.tsx` | 2,696 | 97 | 36.0 | — | 213 | 150 | 24 | 13 | `BackgroundLoopControls` (689), `runPlannerNow` (678) | Multi-feature panel; nested components |
| 12 | `app/src/pages/Conversations.tsx` | 2,125 | 109 | 51.3 | — | 122 | 87 | 45 | 35 (TS imports) | `selectedThreadParent` (908), `resolveThreadDisplayTitle` (~930 span heuristic) | Top TS coupling; mixes thread state + composer + display logic |
| 13 | `src/core/jsonrpc.rs` | 1,483 | — | — | 69 | — | — | — | 18 | — | High match-arm density (69) over manageable LOC |
| 14 | `app/src-tauri/src/whatsapp_scanner/mod.rs` | 2,093 | — | — | — | — | — | — | 14 | — | DOM scraper; similar shape to discord/slack scanners |
| 15 | `src/openhuman/composio/ops.rs` | 1,889 | — | — | — | — | — | — | 15 | — | Integration ops surface |

Other notable coupling outliers (imports/uses ≥ 30, even where LOC is modest):

- `src/openhuman/channels/runtime/startup.rs` — **46 uses** (highest in repo, file not even in size top-30)
- `src/openhuman/memory/tree/jobs/handlers/mod.rs` — 41 uses, 1,224 LOC
- `app/src/pages/Settings.tsx` — 41 imports
- `app/src/App.tsx` — 31 imports
- `app/src/pages/Skills.tsx` — 30 imports

---

## 3. Specific refactor recommendations — top 5 hotspots

### 3.1 `app/src-tauri/src/webview_accounts/mod.rs` (4,450 LOC, biggest fn 839)
**Evidence:** 172 `fn` declarations, 153 `if`, 86 `=>` arms, 318 lines indented ≥16 spaces, single function `webview_account_open` spans lines 1,787 → 2,626 (839 LOC).
**What it does:** IPC commands for opening/closing/sizing child webviews, per-provider recipe injection, OS-specific shims (`#[cfg(windows)]` / `#[cfg(target_os = "linux")]`), drop/cleanup logic.
**Refactor:**
1. **Split by responsibility into a submodule directory** `webview_accounts/{ipc.rs, recipe.rs, lifecycle.rs, platform_linux.rs, platform_macos.rs, platform_windows.rs}`. The OS-cfg blocks are an obvious seam.
2. **Decompose `webview_account_open`** — at 839 LOC it should be a thin orchestrator calling: `resolve_recipe()`, `build_webview_config()`, `attach_event_bridge()`, `register_navigation_handlers()`, `persist_account_metadata()`.
3. **Extract recipe injection** into its own type with a small trait (`RecipeInjector { fn script(&self) -> Cow<str>; fn initialization_args(&self) -> Value; }`) — currently per-provider branching is inline.

### 3.2 `app/src-tauri/src/lib.rs` (3,846 LOC, `run` = 255 LOC)
**Evidence:** 152 `fn`, 109 `if`, 79 `=>` arms, 29 imports. Contains the Tauri bootstrap plus dozens of `#[tauri::command]` handlers.
**Refactor:**
1. **Move all `#[tauri::command]` functions** into per-domain modules (`commands/accounts.rs`, `commands/updates.rs`, `commands/data.rs`, …) and have `lib.rs` only call `.invoke_handler(generate_handler![...])`.
2. **Extract update flow** — `apply_app_update` (119), `download_app_update` (92), `reset_local_data` (92) belong in an `app_update` submodule.
3. **Cap `lib.rs` at ~500 LOC** (boilerplate only).

### 3.3 `src/openhuman/agent/harness/session/turn.rs` (`turn` = ~967 LOC, lines 71 → 1,038)
**Evidence:** 300 lines indented ≥16 spaces (highest in the report), 261 at ≥20, 146 at ≥24. The single `turn` function is ~44% of the file.
**Refactor:**
1. **Extract a state machine.** A turn has clear phases: `LoadOrResumeTranscript → BuildOrReuseSystemPrompt → InvokeProvider → DispatchToolCalls → EmitProgress → PersistTurn`. Encode them as enum variants of `TurnPhase` and let `turn()` be a loop over `next_phase()`.
2. **Pull tool-iteration logic** (the inner loop that drives `max_tool_iterations`) into a `tool_iteration::drive(…)` helper. That alone should kill 200+ LOC of nesting from `turn`.
3. **Move logging/progress emission** behind a small `TurnObserver` so the happy path reads like the doc comment at the top of the file.

### 3.4 `src/openhuman/inference/provider/compatible.rs` (2,005 LOC, `stream_native_chat` = 421)
**Evidence:** Branch density 75.8/1k LOC, deepest 24-sp count of any production file (146). Already partially split via `#[path]` into `compatible_parse.rs`, `compatible_stream.rs`, `compatible_dump.rs`, `compatible_types.rs` — the seam exists but the orchestrator file is still huge.
**Refactor:**
1. **Move `stream_native_chat`** wholesale into `compatible_stream.rs` and expose it via the existing module split. The 421-LOC streaming state handler does not belong in the trait-impl file.
2. **Collapse `chat` / `chat_with_system` / `chat_with_history` / `stream_chat_with_system`** (233 + 166 + 100 + 156 LOC) — they almost certainly share request-building boilerplate. Extract a `ChatRequestBuilder` and a single `dispatch(builder, mode: Streaming | OneShot)`.
3. **Type the deep nesting away.** `serde_json::Value` walking is what produces the 24-space indents; introduce typed structs for the OpenAI/Responses API payloads (Serde derives) so the parser flattens.

### 3.5 `src/openhuman/config/schema/load.rs` (2,013 LOC, `apply_env_overrides_from` = 719)
**Evidence:** Highest branch density in the entire repo: **128.7 branches per 1k LOC**, 200 `if`, 25 `match`, 86 `=>` arms. `apply_env_overrides_from` is a 719-LOC if/else cascade.
**Refactor:**
1. **Replace the cascade with a declarative table.** Define `static ENV_OVERRIDES: &[EnvBinding]` where each row is `(env_var_name, path_in_schema, parser_fn)`, and have one generic applier walk the table. Each row becomes one line; the file shrinks by an order of magnitude.
2. **Split migration logic** (`migrate_cloud_provider_slugs` = 120, plus `decrypt_config_secrets` = 92) into `schema/migrate.rs` and `schema/secrets.rs`.
3. **Parallel benefit for tests:** `load_tests.rs` is 1,699 LOC — table-driven overrides will let the test file shrink in proportion.

---

## 4. Module-level coupling observations

**Re-export-heavy mod.rs files** (≥30% lines are `pub use`):

| File | LOC | `pub use` lines | % |
|------|----:|----------------:|--:|
| `src/openhuman/channels/mod.rs` | 65 | 37 | 57% |
| `src/openhuman/security/mod.rs` | 41 | 13 | 32% |
| `src/openhuman/config/schema/mod.rs` | 85 | 26 | 31% |

These are healthy façade modules, not monoliths. The actual monoliths are the implementation `mod.rs` files in `app/src-tauri/`:

| File | LOC | Shape |
|------|----:|-------|
| `app/src-tauri/src/webview_accounts/mod.rs` | 4,450 | Single-file module — no submodule split |
| `app/src-tauri/src/whatsapp_scanner/mod.rs` | 2,093 | Single-file scraper |
| `app/src-tauri/src/discord_scanner/mod.rs` | 1,659 | Single-file scraper |
| `app/src-tauri/src/screen_capture/mod.rs` | 1,066 | Single-file |
| `app/src-tauri/src/slack_scanner/mod.rs` | 1,049 | Single-file |
| `src/openhuman/agent/prompts/mod.rs` | 1,392 | Prompt assembly logic in `mod.rs` instead of submodules |
| `src/openhuman/memory/tree/jobs/handlers/mod.rs` | 1,224 | 41 imports (highest of any handler-style file) |

**Pattern:** the `*/mod.rs` files in `app/src-tauri/src/{provider}_scanner/` consistently exceed 1k LOC. They likely share scaffolding (login detection, DOM polling, event piping). A common `scanner_core` crate-internal module would extract the boilerplate and let each `mod.rs` focus on provider-specific selectors.

**Front-end coupling concentrates in `app/src/pages/`:**

| File | Imports | Note |
|------|--------:|------|
| `app/src/pages/Settings.tsx` | 41 | Aggregates every settings panel |
| `app/src/pages/Conversations.tsx` | 35 | Largest TS file in scope (also: function `selectedThreadParent` spans 908 lines per arrow-block heuristic — likely fronted by closures, but warrants a hand-look) |
| `app/src/App.tsx` | 31 | Router + provider tree |
| `app/src/pages/Skills.tsx` | 30 | Skill catalog UI |

These page-level components are the typical SPA "container" anti-pattern: pull every hook + every component into one file. Recommendation: each `pages/X.tsx` should be ≤300 LOC and only compose smaller components from `components/X/`.

---

## 5. Overall complexity score: **6 / 10**

| Dimension | Score | Reasoning |
|-----------|------:|-----------|
| File size distribution | 6 | 30+ files over 1k LOC; 4 files over 2.5k LOC. Heavy tail. |
| Function size | **8** | At least 6 production functions exceed 400 LOC; one exceeds 950 LOC (`turn::turn`). This is the worst single dimension. |
| Branch density | 6 | Median around 70/1k LOC; outliers at 128/1k (`config/schema/load.rs`) and 88/1k (`ollama_admin.rs`). |
| Nesting depth | 5 | Deep blocks exist (146 lines at 24+ spaces in `compatible.rs` and `turn.rs`) but they are localized to a handful of files. |
| Coupling | 4 | Most files import 5–15 things. A few page/runtime files reach 35–46. No widespread god-deps. |
| Module structure | 5 | Façade `mod.rs` re-exports look clean. Implementation `mod.rs` files in `app/src-tauri/*_scanner/` and `webview_accounts/` are not subdivided — those drag the score. |
| TODO/FIXME churn proxy | 2 | Negligible (max 3 per file across entire codebase). Code is curated, not abandoned. |
| Tests | 4 | Heavy test suites alongside hotspots (`config/schema/load_tests.rs` = 1,699 LOC, `composio/ops_test.rs` = 1,534). Hotspots are exercised; that lowers risk. |

**Verdict:** Roughly **6/10** — *Medium complexity, well-trafficked but with concentrated debt*. The codebase is not unmaintainable; the hot-spot pattern is the classic "five files do 80% of the heavy lifting and got too big." Three changes would move the score to ~4/10:

1. Decompose `webview_account_open`, `turn::turn`, `apply_env_overrides_from`, `stream_native_chat`, `run_typed_mode` + `run_inner_loop`. (Five functions = >3,700 LOC of god-functions.)
2. Split `app/src-tauri/src/lib.rs` and `app/src-tauri/src/webview_accounts/mod.rs` into submodule directories.
3. Replace the `apply_env_overrides_from` if/else cascade with a declarative table — single highest-leverage refactor for branch density.

Risk-weighted priority for QE focus: **`turn.rs`** (agent loop = correctness-critical) > **`compatible.rs`** (LLM I/O, deep nesting on hot path) > **`subagent_runner/ops.rs`** (recursion + budgets) > **`webview_accounts/mod.rs`** (cross-platform shims, OS-conditional code = brittle) > **`config/schema/load.rs`** (config drift = silent data corruption).
