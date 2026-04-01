# Claude Code Internals Research & AQE Platform Analysis

**Date**: 2026-04-01
**Source**: https://github.com/stuinfla/claude-code-internals (reverse-engineered docs)
**Analysis Method**: Six Thinking Hats
**Platform Version**: AQE v3.8.14

---

## Table of Contents

1. [Claude Code Architecture Overview](#1-claude-code-architecture-overview)
2. [Core Architecture & Tools](#2-core-architecture--tools)
3. [Agent Intelligence & Interface](#3-agent-intelligence--interface)
4. [Interface & Infrastructure](#4-interface--infrastructure)
5. [Connectivity & Plugins](#5-connectivity--plugins)
6. [Unreleased Features](#6-unreleased-features)
7. [AQE Platform Current State](#7-aqe-platform-current-state)
8. [Six Thinking Hats Analysis](#8-six-thinking-hats-analysis)
9. [Improvement Recommendations](#9-improvement-recommendations)

---

## 1. Claude Code Architecture Overview

Claude Code is a TypeScript application built on Bun, React/Ink (terminal UI), and the Anthropic API.
Internal codename: "tengu". Organized into six architectural layers:

1. **Boot** -- Startup, settings, migrations, session wiring
2. **UI Shell** -- Ink-rendered terminal interface (custom React reconciler targeting terminal DOM)
3. **State** -- Immutable `AppState` (React) plus global singleton state
4. **Query Engine** -- Conversation lifecycle, system prompt assembly, API streaming
5. **Tools** -- Capability registry (30+ built-in tools plus MCP)
6. **Services** -- Anthropic API client, MCP connections, context compaction

---

## 2. Core Architecture & Tools

### 2.1 Boot Sequence

**Three-Layer Entrypoint:**
- Layer 1: CLI Entrypoint (`cli.tsx`) -- Zero-cost fast paths. `--version` returns without loading any modules
- Layer 2: Main Function (`main.tsx`) -- Commander argument parsing, initialization, migrations (version 11)
- Layer 3: Setup + REPL (`setup.ts` + `replLauncher.tsx`) -- 16+ ordered steps, then Ink rendering

**Parallel Prefetch Side-Effects (during ~135ms module evaluation):**
- `startMdmRawRead()` -- MDM policy subprocesses via `plutil`/`reg query` (20-40ms)
- `startKeychainPrefetch()` -- macOS keychain reads (~65ms saved)
- `preconnectAnthropicApi()` -- TCP+TLS warm-up (~150ms saved)
- `startDeferredPrefetches()` -- user/git context, tips, model capabilities

**Cold Start Timeline:**
```
t=0ms        $ claude
t=1ms        profileCheckpoint, MDM/keychain fire
t=136ms      Module eval complete
t=140ms      Commander.parse()
t=160ms      preconnectAnthropicApi()
t=165ms      captureHooksConfigSnapshot()
t=190ms      FIRST RENDER
t=191ms      startDeferredPrefetches()
```

**8 Fast Paths (detection order, gated by feature flags):**
1. `--version` -- zero imports
2. `--dump-system-prompt` -- minimal modules
3. Chrome/Computer-Use MCP -- standalone servers
4. `--daemon-worker` -- only worker registry
5. Bridge/Remote Control
6. `daemon` subcommand
7. Background sessions -- no interactive UI
8. Fallthrough to full CLI

**Bare Mode** (`--bare` / `CLAUDE_CODE_SIMPLE`): Strips all non-essential startup for CI/SDK.

### 2.2 Query Engine

**Four-Layer Architecture:**
1. `QueryEngine.submitMessage()` -- Validates prompts, constructs system messaging, delegates
2. `query()` -> `queryLoop()` -- Async generator loop until tool-calling ceases
3. `queryModel`/`callModel` -- Anthropic API via streaming, wrapped in `withRetry()`
4. Stop hooks & token budget -- Post-turn hook execution and continuation decision

**7 Continuation Reasons:**
| Reason | Meaning |
|--------|---------|
| `max_output_tokens_escalate` | First 8k cap hit; retry at 64k |
| `max_output_tokens_recovery` | Model hit output limit; inject recovery nudge (up to 3x) |
| `reactive_compact_retry` | Prompt-too-long -> compact -> retry |
| `collapse_drain_retry` | Prompt-too-long -> drain stages -> retry |
| `stop_hook_blocking` | Stop hook returned blocking error; re-query |
| `token_budget_continuation` | Budget indicates more work needed |
| _(tool follow-up)_ | Model returned tool_use blocks |

**Token Budget Auto-Continue:**
```typescript
const COMPLETION_THRESHOLD = 0.9   // 90% used = done
const DIMINISHING_THRESHOLD = 500  // <500 new tokens = no progress
```

**Streaming and Retry:**
- `StreamingToolExecutor` fires tools while stream remains open (parallel execution)
- Tombstone messages handle mid-stream fallback
- `withRetry()` -- Up to 10 retries with exponential backoff (base * 2^attempt, max 32s, +25% jitter)
- 529 overloaded: Only foreground retries; background bails
- After 3 consecutive 529s, throws `FallbackTriggeredError` switching to fallback model
- OAuth 401: Token refresh before retry
- Context overflow 400: Parses token counts, computes new `maxTokensOverride`
- Persistent mode: Retries indefinitely with 30-min cap, heartbeat every 30s

### 2.3 State Management

**Architecture: 35 Lines, No Dependencies:**
- Custom `createStore<T>` with `getState`, `setState(updater)`, `subscribe`
- `AppState` (400+ fields, `DeepImmutable<{...}>`)
- React integration via `useSyncExternalStore`

**Two-Layer State:**
- Layer 1: Global Singleton (~60 fields: sessionId, cwd, token counters, FPS, hook registry)
- Layer 2: React State (90+ fields: settings, models, tool permissions, tasks, MCP, plugins)

**Prompt Cache Latch Fields:**
`afkModeHeaderLatched`, `fastModeHeaderLatched` keep API headers stable to avoid busting 50-70K token prompt cache.

### 2.4 Context Management Pipeline (Priority Order)

1. `applyToolResultBudget()` -- Caps individual tool result byte size
2. `snipCompact` (HISTORY_SNIP) -- Removes provably unneeded messages without summarization
3. `microcompact` -- Merges consecutive tool-result/user pairs into condensed summaries
4. `contextCollapse` (CONTEXT_COLLAPSE) -- Read-time projection over REPL history
5. `autoCompact` -- Full summarization via forked agent

### 2.5 4-Tier Context Compaction System

**Tier 1 - Microcompact (zero API calls):**
- Clears cached tool-result content from in-memory message arrays
- Keeps last 5 results, replaces old with `'[Old tool result content cleared]'`
- Time-based: 60-min threshold
- Token estimation: padded heuristic `ceil(chars / 3)` (~3 chars/token vs standard 4 chars/token); images = flat 2,000 tokens

**Tier 2 - Session Memory Compact (no API calls):**
- Uses continuously-updated session memory files
- Min 10,000 tokens recent context, max 40,000 tokens
- Preserves tool_use/tool_result pairs

**Tier 3 - Full LLM Compact (one API call):**
- Forks sub-agent for structured 9-section summary:
  1. Primary Request and Intent
  2. Key Technical Concepts
  3. Files and Code Sections
  4. Errors and Fixes
  5. Problem Solving
  6. All User Messages (verbatim -- captures intent drift)
  7. Pending Tasks
  8. Current Work
  9. Optional Next Step
- 20k token reservation (p99.99 = 17,387 tokens)

**Tier 4 - Reactive Compact:**
- Triggered by 413 prompt-too-long errors
- Peels API rounds from oldest entries

**5 Operational States:**
| State | Remaining Tokens | Behavior |
|-------|-----------------|----------|
| Normal | >20k | No action |
| Warning | <=20k | Yellow indicator |
| Error | <=20k | Red indicator |
| Auto-Compact | <=13k | Auto-trigger compaction |
| Blocking | <=3k | Prevents new input |

**Post-compact file restoration:** Up to 5 previously-read files (50k token budget, 5k per file) plus skills (25k budget, 5k per skill).

### 2.6 Tool System

**Tool Interface:**
```typescript
type Tool<Input, Output, P> = {
  name: string
  aliases?: string[]
  inputSchema: ZodSchema
  maxResultSizeChars: number
  call(args, context, canUseTool, parentMessage, onProgress?): Promise<ToolResult<Output>>
  checkPermissions(input, context): Promise<PermissionResult>
  isConcurrencySafe(input): boolean   // Default: false (conservative)
  isReadOnly(input): boolean
  isDestructive?(input): boolean
}
```

**Tool Concurrency Partitioning:**
- Consecutive tools with `isConcurrencySafe === true` batch for parallel execution
- Non-safe tools break batches and run alone
- Max concurrency: `CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY` (default 10)

**StreamingToolExecutor:**
- States: `queued` -> `executing` -> `completed` -> `yielded`
- Tools execute concurrently but emit results in model's requested order
- Sibling abort: Only Bash errors cascade; Read/WebFetch independent

### 2.7 Bash Tool Security

**23 Security Validators** (each returns `allow`, `passthrough`, or `ask`):
- Incomplete commands, jq system functions, obfuscated flags
- Shell metacharacters (`;`, `&&`, `||`, `|`)
- Dangerous variables (`$BASH_ENV`, `$ENV`, `$IFS`)
- Process substitution, I/O redirects, brace expansion
- Control characters, unicode whitespace
- zsh-specific dangerous commands (`zmodload`, `sysopen`, `ztcp`)
- 50-subcommand cap defaults to `ask`

### 2.8 MCP System

**8 Transport Types:**
- Public: `stdio`, `sse`, `http`, `ws` (with mTLS)
- IDE: `sse-ide`, `ws-ide`
- Internal: `sdk`, `in-process`

**7-Level Configuration Cascade:**
1. Enterprise (`managed-mcp.json`)
2. Dynamic (CLI flag)
3. Claude.ai connector API
4. Project (`.mcp.json`)
5. Local
6. User (`~/.claude/settings.json`)
7. Managed/plugin

**8-Phase Connection Lifecycle:**
Config -> batched connection (stdio: 3 concurrent, remote: 20) -> transport -> connect (30s timeout) -> auth handling -> capability negotiation -> tool/resource/prompt fetch -> live notifications (exponential backoff reconnect, 1s -> 30s, max 5)

---

## 3. Agent Intelligence & Interface

### 3.1 Skills System

**6-Stage Lifecycle:** Discovery -> Load -> Parse -> Substitute -> Execute -> Inject

**4 Skill Sources (Priority):**
1. Managed/Policy (Enterprise, lockable)
2. User (`~/.claude/skills/`)
3. Project (`.claude/skills/`)
4. Bundled (compiled into CLI)

**Execution Modes:**
- Inline (default): Prompt injected in same context
- Forked (`context: fork`): Isolated sub-agent via `runAgent()`

### 3.2 Agent System

**3 Agent Type Definitions:**
- `BuiltInAgentDefinition`: Dynamic system prompts, cannot be overridden
- `CustomAgentDefinition`: From `.claude/agents/*.md` or settings
- `PluginAgentDefinition`: Admin-trusted for MCP policy

**Sync vs Async Agents:**
- Sync: Build prompt -> optional worktree -> `await runAgent()` -> return
- Async: Register with own AbortController -> return `async_launched` -> notify on completion

**Fork Path (Experimental):**
- Clone parent's full assistant message
- Build byte-identical placeholder blocks
- Enable prompt cache sharing across N parallel children
- 60-70% cost reduction for parallel agent spawning

### 3.3 Coordinator Mode

Activated via `CLAUDE_CODE_COORDINATOR_MODE=1`. Only 4 tools: Agent, TaskStop, SendMessage, SyntheticOutput.

**4-Phase Workflow:**
1. Research (Workers, parallel) -- Investigate codebase
2. Synthesis (Coordinator) -- Transform findings into specifics
3. Implementation (Workers) -- Make changes, test, commit
4. Verification (Workers) -- Prove code works independently

### 3.4 Teams & Swarm

**File-based Architecture:**
```
~/.claude/teams/<team>/config.json
~/.claude/teams/<team>/permissions/
~/.claude/tasks/<team>/0001.json
```

**3 Spawn Backends:**
1. tmux -- Socket: `claude-swarm-${process.pid}`
2. iterm2 -- Via `it2` CLI
3. in-process -- Non-interactive, isolated via `AsyncLocalStorage`

**Mailbox Messaging:** File-based at `~/.claude/teams/<team>/inbox/<agent-name>/`
Message types: plain text, shutdown_request, idle notification, permission_request/response, mode_set_request

### 3.5 Memory System

**3 Layers:**
1. Auto Memory -- Persistent facts at `~/.claude/projects/<slug>/memory/`
2. Session Memory -- In-session notes at `~/.claude/session-memory/<uuid>.md`
3. Team Memory -- Server-synced via API, scoped to GitHub repo

**Auto Memory Extraction Pipeline:**
1. Query ends
2. Gate check (feature flag + cursor delta)
3. Scan memdir (frontmatter headers only)
4. Fork agent (shared cache, max 5 turns, skip transcript)
5. Write + notify, advance cursor

**AutoDream Consolidation (3 gates: time >= 24h, sessions >= 5, no lock):**
4 phases: Orient, Gather, Consolidate, Prune and index

**Recall - findRelevantMemories:**
Two-step: scan memory files -> Sonnet sideQuery (max 256 tokens, selects up to 5 relevant files)

---

## 4. Interface & Infrastructure

### 4.1 Permission System

**7-Phase Decision Pipeline:**
1. Deny rule checks
2. Ask rule evaluation
3. Tool-specific validation
4. User interaction requirements
5. Safety-protected paths
6. Mode-based transformations
7. Auto mode classification

**5 Permission Modes:**
| Mode | Behavior |
|------|----------|
| default | Ask user for tools not in allow-list |
| plan | Read-only blocking writes |
| acceptEdits | Auto-approves file mods in working directory |
| bypassPermissions | Skips prompts except deny/safety/interaction |
| auto | AI-driven routing (ANT-only) |

### 4.2 Settings Architecture

**5-Layer Priority Cascade:**
1. userSettings (`~/.claude/settings.json`)
2. projectSettings (`.claude/settings.json`)
3. localSettings (`.claude/settings.local.json`)
4. flagSettings (`--settings <path>`)
5. policySettings (enterprise/MDM)

**Change Detection:** Chokidar with constants:
- `FILE_STABILITY_THRESHOLD_MS = 1000`
- `INTERNAL_WRITE_WINDOW_MS = 5000`
- `DELETION_GRACE_MS = 1700`

### 4.3 Session Management

**Append-only JSONL storage.** Messages form linked list via `parentUuid`.
Write batching: 100ms local, 10ms cloud. Lazy session file materialization.
3 session states: idle, running, requires_action.

**Resume:** Head+tail reads (4KB head, 64KB tail) avoid parsing multi-GB files.

### 4.4 Analytics & Telemetry

**Dual Pipeline:**
- First-Party (OpenTelemetry): Detailed analytics with disk-backed retry
- Datadog: Operational monitoring (~40 events, 15s flush, 100-entry threshold)

**Cardinality Reduction:** Model names bucketed. User IDs hashed to 1-of-30 buckets via SHA-256.

---

## 5. Connectivity & Plugins

### 5.1 Plugin System

**5 Conceptual Layers:**
1. Marketplace Sources (GitHub, git, npm, local, URL)
2. Manifest Schema (`plugin.json`)
3. Versioned Cache (immutable per-version snapshots)
4. Dependency Resolution (DFS closure walk, fixed-point demote)
5. Lifecycle (reconciliation -> autoupdate -> load -> registration)

**27 Hook Lifecycle Events:**
Lifecycle(5), Tool execution(3), Agent/subagent(2), Compaction(2), Permission/policy(5), Collaborative(4), Filesystem(4), MCP elicitation(2)

**Name Validation Security:**
- Blocks impersonation patterns
- Reserved names require `anthropics/` org
- Non-ASCII blocked (homograph attack prevention)

### 5.2 Hooks System

**5 Hook Command Types:**
1. command (shell subprocess) -- supports if, timeout, once, async, asyncRewake
2. prompt (LLM prompt) -- `$ARGUMENTS`, 30s timeout
3. agent (agentic verifier) -- up to 50 turns, 60s timeout
4. http (HTTP POST) -- SSRF guard, 10-min timeout
5. function (TypeScript callback) -- in-process, 5s timeout

**Exit Code Semantics:** Exit 2 = model-visible blocking; other non-zero = user-visible only; exit 0 = silent success.

**6 Configuration Sources:** userSettings, projectSettings, localSettings, policySettings, pluginHook, sessionHook.

**Security:** Config frozen at startup. SSRF guard blocks private IPs. `allowManagedHooksOnly` and `disableAllHooks` policy controls.

### 5.3 Error Handling

**4-Layer Architecture:**
1. Typed Error Classes
2. API Retry Engine (10 retries, exponential backoff, 529 model fallback)
3. Terminal Error Overlay
4. Conversation Recovery (4 stages including interrupt detection)

**Tool Error Formatting:** Center-truncation at 10,000 chars (5k head + 5k tail).

### 5.4 OAuth Authentication

OAuth 2.0 Authorization Code + PKCE.
Two targets: Console (API) and Claude.ai (subscribers).
Profile skip optimization saves ~7M requests/day fleet-wide.

### 5.5 Git Integration

Filesystem-first design -- reads `.git/` files directly via Node fs (no subprocess calls).
GitFileWatcher with dirty-bit pattern. Default branch cascade: origin/HEAD -> origin/main -> origin/master -> "main".

---

## 6. Unreleased Features

### 6.1 UltraPlan -- Remote Planning System

Status: Behind feature flags. Uses Opus 4.6 via GrowthBook.

**4-Phase System (30-minute sessions):**
1. Trigger Detection -- Smart keyword scanning
2. CCR Launch -- Cloud Code Runner session, git bundle upload
3. Long-Poll -- Cursor-based pagination, 3s intervals, up to 30 minutes
4. Plan Delivery -- Remote Execution (PR) or Teleport (back to terminal)

### 6.2 Kairos -- Always-On Autonomous Daemon

Status: Anthropic-internal only, behind 7 feature flags.

**Key Capabilities:**
- Memory switches from MEMORY.md to daily log files
- Tick Loop with `<tengu_tick>` XML messages
- Queue Priority: 'now', 'next', 'later'
- Tool Suite: SleepTool, SendUserMessage, PushNotification, SubscribePR, Cron
- AutoDream: Background memory consolidation, 8-step gate chain
- Kill-Switch: GrowthBook flags with 5-minute caching

### 6.3 Plugin Marketplace

5-layer system with GitHub/git/npm/local/URL sources, DFS dependency resolution, versioned immutable cache, background autoupdate, 27 lifecycle events.

### 6.4 Voice System

Push-to-talk pipeline: audio recording -> WebSocket STT -> transcript injection.
3 audio backends (audio-capture-napi, arecord, SoX).
Hold-to-talk with silent-drop replay and focus mode.

### 6.5 Computer Use MCP (Chicago/Malort)

Gated by subscription. OS-level automation with coordinate modes, clipboard guards, mouse animation.

### 6.6 Agent SDK v2 (Alpha)

V1 (stable): `query()` for headless one-shot.
V2 (@alpha): `createSession()`, `resumeSession()`, `prompt()` for persistent multi-turn.
8 control protocol subtypes.

---

## 7. AQE Platform Current State

### 7.1 Metrics

| Metric | Value |
|--------|-------|
| Version | 3.8.14 |
| Source Lines | 548,703 across 1,195 files |
| Test Lines | 368,189 across 705 files |
| QE Agents | 60 specialized (qe-*.md) |
| Platform Agents | 116 non-QE |
| Skills | 187 across 125+ directories |
| Bounded Contexts | 13 DDD domains |
| MCP Tools | 200+ registered |
| Memory Backend | HNSW + SQLite hybrid |
| Learning Patterns | 1,000+ in memory.db |
| QCSD Feedback Loops | 5 cross-phase |
| Max Concurrent Agents | 15 |

### 7.2 13 Domain Bounded Contexts

| Domain | Purpose |
|--------|---------|
| test-generation | AI-powered test synthesis, mutation, property-based |
| test-execution | Parallel running, flaky detection, retry |
| coverage-analysis | O(log n) gap detection, sublinear algorithms, HNSW |
| quality-assessment | Quality gates, metrics, SLA enforcement |
| defect-intelligence | Risk prediction, root cause, pattern learning |
| requirements-validation | BDD scenarios, AC verification, HTSM v6.3 |
| code-intelligence | Complexity, dependency mapping, code indexing |
| security-compliance | SAST/DAST scanning, vulnerability classification |
| contract-testing | API contract validation, Pact integration |
| visual-accessibility | A11y auditing, axe-core |
| chaos-resilience | Fault injection, resilience testing |
| learning-optimization | Experience capture, pattern promotion, meta-learning |
| enterprise-integration | SAP, middleware, message brokers, OData/SOAP |

### 7.3 Architecture Strengths

- Domain-Driven Design with clear bounded contexts
- HNSW vector search + SQLite persistence (hybrid backend)
- Pattern lifecycle management (candidate -> promoted -> adopted)
- QCSD cross-phase feedback loops (5 loops)
- Economic routing model (quality-per-dollar)
- ONNX transformer models for real embeddings
- Dream cycles for pattern consolidation
- 3-tier model routing (WASM Booster < Haiku < Sonnet/Opus)

---

## 8. Six Thinking Hats Analysis

### White Hat -- Facts & Data

See sections 7.1-7.3 for AQE metrics and sections 2-6 for Claude Code metrics.

### Red Hat -- Gut Feelings

- **Pride**: 13-domain DDD architecture with 200+ MCP tools is unique
- **Anxiety**: Context compaction is primitive compared to CC's 4-tier system
- **Excitement**: Plugin marketplace + hooks could transform AQE into ecosystem
- **Concern**: Boot/startup never optimized (2-5x worse than needed)
- **Frustration**: No retry engine -- MCP failures cascade
- **Confidence**: Learning system is MORE sophisticated than CC's auto-memory
- **Unease**: Agent coordination feels fragile vs CC's battle-tested teams/swarm

### Black Hat -- Risks & Critical Gaps

1. **No Context Compaction** -- Long sessions fail without graceful degradation
2. **No Retry Engine** -- Transient failures cascade across swarm
3. **No Sandbox/Permission System** -- Agents can execute arbitrary commands
4. **No Streaming Tool Execution** -- Latency penalty on multi-tool operations
5. **No Session Resume** -- Long analyses lost on crash
6. **Startup Not Optimized** -- Poor DX for frequent CLI use
7. **No Hook Security Model** -- Hooks not frozen at startup
8. **Single MCP Transport** -- Cannot integrate with IDEs

### Yellow Hat -- Where AQE is Ahead

1. Domain-Driven QE Architecture (13 bounded contexts)
2. Learning System Sophistication (pattern lifecycle, dream cycles, ONNX)
3. QCSD Cross-Phase Feedback Loops (5 declarative loops)
4. Economic Routing Model (quality-per-dollar)
5. Real Embeddings + HNSW (vs CC's Sonnet sideQuery)

### Green Hat -- Creative Ideas

**Quick Wins:**
- Microcompact for MCP tool results (40% token savings)
- Tool concurrency partitioning (2-3x throughput)
- Transcript-first durability (crash recovery)

**Medium-Term:**
- 4-tier context compaction for QE agents
- Plugin architecture for QE domains
- Hook security hardening

**Ambitious:**
- QE Quality Daemon (always-on monitoring)
- UltraPlan for QE (remote test strategy)
- Voice-driven exploratory testing
- Agent fork with prompt cache sharing

### Blue Hat -- Action Plan

| Priority | Improvement | Effort | Impact |
|----------|-----------|--------|--------|
| P0 | Microcompact for MCP tools | 1-2 days | 40% token savings |
| P0 | Tool concurrency partitioning | 1-2 days | 2-3x throughput |
| P0 | Retry engine with backoff | 3-5 days | Resilience |
| P1 | Transcript-first durability | 3-5 days | Crash recovery |
| P1 | Prompt cache latch fields | 1 day | 30-50% cache hit |
| P1 | Startup fast paths | 3-5 days | DX improvement |
| P1 | Hook security hardening | 3-5 days | Security |
| P2 | 4-tier context compaction | 1-2 weeks | Session length |
| P2 | Plugin architecture for QE | 2-3 weeks | Ecosystem |
| P3 | QE Quality Daemon | 1 month | Transformative |

---

## 9. Improvement Recommendations

### Key Insight

> AQE's strength is domain specialization; Claude Code's strength is infrastructure robustness.
> We need to adopt their operational patterns (retry, compaction, concurrency, durability, security)
> and layer them onto our already-superior QE domain architecture.

### Sprint 1 -- Quick Wins

1. Microcompact for MCP tool results
2. `isConcurrencySafe` flags on all 200+ MCP tools
3. Retry engine with exponential backoff + jitter

### Sprint 2 -- Durability & Performance

4. Transcript-first session durability (JSONL)
5. Prompt cache latch fields
6. Startup fast paths for CLI vs MCP modes

### Sprint 3-4 -- Security & Compaction

7. Hook security hardening (snapshot freeze, SSRF guards)
8. Full 4-tier context compaction
9. Agent permission boundaries

### Quarter 2 -- Platform Evolution

10. Plugin architecture for QE domains
11. Agent fork with prompt cache sharing
12. QE Quality Daemon
