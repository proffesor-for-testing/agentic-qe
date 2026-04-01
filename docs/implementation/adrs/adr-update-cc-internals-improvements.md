# ADR Updates for CC-Internals Improvements

**Date**: 2026-04-01
**Source**: Six Thinking Hats analysis of Claude Code internals
**Related Plan**: [docs/plans/cc-internals-improvements-plan.md](../../plans/cc-internals-improvements-plan.md)
**New ADRs**: ADR-088 (Prompt Cache Latch), ADR-089 (4-Tier Context Compaction)

This document records the update amendments to 8 existing ADRs to accommodate improvements IMP-01 through IMP-10 (excluding IMP-05 and IMP-08 which have their own new ADRs).

---

## 1. ADR-042 Update: Microcompact for MCP Tool Results (IMP-01)

**ADR**: ADR-042-v3-qe-token-tracking-integration.md
**Status**: Implemented -> **Extended**
**Improvement**: IMP-01 (Microcompact for MCP Tool Results)

### Amendment: Cross-Result Microcompaction

**Existing scope**: Per-task/agent/domain token metrics, early-exit optimization, response caching, pattern reuse (-25% reduction).

**Extension**: Add cross-result microcompaction to the token reduction strategy. While ADR-042 tracks and reduces token consumption via pattern reuse, it does not manage accumulated tool result lifecycle within a conversation.

**New decision added**:

> We extend ADR-042's token reduction mechanisms with a **microcompact engine** that evicts stale MCP tool results from conversation context at zero API cost. Results older than 60 minutes are replaced with sentinel strings (`'[Old tool result content cleared]'`), preserving the last 5 results. Token estimation uses a padded heuristic (`ceil(chars / 3)`; images flat 2,000 tokens). This complements existing per-result truncation (output-compaction.ts) with cross-result lifecycle management. Expected additional savings: ~40% of tool-result tokens.

**New files**:
- `src/mcp/middleware/microcompact.ts` -- MicrocompactEngine class
- `tests/mcp/middleware/microcompact.test.ts`

**Modified files**:
- `src/mcp/protocol-server.ts` -- Integrate microcompact into handleToolsCall()
- `src/mcp/types.ts` -- Add ToolResultEntry type with timestamp tracking

**New dependency**:
| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Extended By | ADR-089 | 4-Tier Context Compaction | Microcompact becomes Tier 1 of the compaction pipeline |

---

## 2. ADR-039 Update: Tool Concurrency Partitioning (IMP-02)

**ADR**: ADR-039-v3-qe-mcp-optimization.md
**Status**: Implemented -> **Extended**
**Improvement**: IMP-02 (Tool Concurrency Partitioning)

### Amendment: Concurrent Tool Execution via Safety Annotation

**Existing scope**: Connection pooling, O(1) hash-indexed tool lookup, least-connections load balancing, real-time monitoring. Achieved <0.1ms tool lookup and 0.6ms p95 response.

**Extension**: Add tool-level concurrency safety annotation and batch execution. While ADR-039 optimized the MCP server infrastructure (connections, lookup, balancing), it did not address parallel execution of multiple tool calls within a single request.

**New decision added**:

> We extend ADR-039's MCP optimization with a **tool concurrency partitioning system**. Each MCP tool definition gains an `isConcurrencySafe: boolean` flag (default: `false`, conservative). Read-only tools (coverage_analyze, defect_predict, code_index, fleet_status, agent_list, etc.) are annotated `true`. A `BatchToolExecutor` partitions consecutive concurrent-safe tool calls into parallel batches executed via `Promise.all()` with configurable max concurrency (`AQE_MAX_TOOL_CONCURRENCY`, default: 10). Non-safe tools break batches and run sequentially. Expected throughput improvement: 2-3x for multi-tool operations.

**New files**:
- `src/mcp/middleware/batch-executor.ts` -- BatchToolExecutor class
- `tests/mcp/middleware/batch-executor.test.ts`

**Modified files**:
- `src/mcp/types.ts` -- Add `isConcurrencySafe` and `isReadOnly` to ToolDefinition
- `src/mcp/protocol-server.ts` -- Annotate all 200+ tool registrations
- `src/mcp/tool-registry.ts` -- Add `invokeBatch()` method

**Kill switch**: `AQE_MAX_TOOL_CONCURRENCY=1` reverts to sequential execution.

---

## 3. ADR-057 Update: Retry Engine + QE Quality Daemon (IMP-03, IMP-10)

**ADR**: ADR-057-infra-self-healing.md
**Status**: Accepted -> **Extended**
**Improvements**: IMP-03 (Retry Engine), IMP-10 (QE Quality Daemon)

### Amendment A: Unified Retry Engine (IMP-03)

**Existing scope**: Infrastructure failure detection from test output, YAML-driven recovery playbooks, exponential backoff for service recovery, composition with Strange Loop's Observe-Model-Decide-Act cycle.

**Extension**: Generalize the backoff and retry mechanisms from infra-specific recovery to a unified retry engine usable across all MCP tool calls and API invocations.

**New decision added**:

> We extend ADR-057's recovery mechanisms with a **unified `withRetry<T>()` function** available across the entire codebase. Parameters: `maxAttempts` (default: 5 for tools, 10 for API), `baseDelayMs` (1000), `maxDelayMs` (32000), `jitterFraction` (0.25), error classification (`isRetryableError`: timeout, ECONNRESET, 429, 503 = retryable; validation, 404 = fatal), AbortSignal support, and persistent retry mode (indefinite with 30-min cap, 30s heartbeat). Model fallback via `FallbackTriggeredError` after 3 consecutive failures. **Critically, the retry engine integrates with the existing `CircuitBreaker` class (ADR-011, `src/shared/llm/circuit-breaker.ts`)** — retry successes/failures feed circuit breaker state transitions (CLOSED -> OPEN after threshold failures, HALF-OPEN for recovery probing). The retry engine does NOT replace the circuit breaker; it wraps it. This consolidates the 90+ files with retry/backoff patterns into a single engine while respecting the existing circuit breaker architecture.

**New files**:
- `src/shared/retry-engine.ts` -- Unified `withRetry()`, `computeBackoff()`, `isRetryableError()`
- `tests/shared/retry-engine.test.ts`

**Modified files**:
- `src/shared/llm/retry.ts` -- Re-export `computeBackoff` as `backoffDelay` for backward compat
- `src/mcp/tool-registry.ts` -- Wrap `invoke()` with `withRetry()`
- `src/mcp/protocol-server.ts` -- Replace hardcoded reconnect loop (lines 250-289)

### Amendment B: QE Quality Daemon (IMP-10)

**Existing scope**: Detect infra failures from test output, execute recovery playbooks. Operates within Strange Loop cycle, only when MCP server is active.

**Extension**: Generalize from reactive infra-healing to proactive quality monitoring via an always-on QE daemon.

**New decision added**:

> We extend ADR-057's self-healing concept from infrastructure-reactive to quality-proactive with a **QE Quality Daemon**. The daemon runs independently of active MCP sessions via `aqe daemon start [--detached]`. It implements: (1) Git commit watcher (`fs.watch` on `.git/refs/heads/`) triggering coverage delta analysis on new commits, (2) CI/CD health monitor polling GitHub Actions for failure patterns, (3) Auto test suggestion generator for uncovered code using the code-intelligence domain, (4) Nightly pattern consolidation via the existing dream cycle, (5) Push notification service for quality gate failures (file-based + optional webhook with SSRF protection from ADR-058). Work items flow through a 3-level priority queue ('now' = gate failures, 'next' = new commits, 'later' = nightly consolidation). The daemon extends the existing `src/workers/daemon.ts` worker infrastructure.

**New files**:
- `src/workers/quality-daemon/index.ts` -- Daemon orchestrator
- `src/workers/quality-daemon/git-watcher.ts`
- `src/workers/quality-daemon/coverage-delta.ts`
- `src/workers/quality-daemon/ci-monitor.ts`
- `src/workers/quality-daemon/test-suggester.ts`
- `src/workers/quality-daemon/nightly-consolidation.ts`
- `src/workers/quality-daemon/notification-service.ts`
- `src/workers/quality-daemon/priority-queue.ts`
- `tests/workers/quality-daemon/` -- Test directory

**New dependencies**:
| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Uses | ADR-088 | Prompt Cache Latch | Daemon API calls use latched headers |
| Uses | ADR-089 | 4-Tier Compaction | Long-running daemon sessions use compaction |
| Uses | ADR-058 | Governance | Webhook notifications respect SSRF guard |

---

## 4. ADR-036 Update: Transcript-First Session Durability (IMP-04)

**ADR**: ADR-036-result-persistence.md
**Status**: Implemented -> **Extended**
**Improvement**: IMP-04 (Transcript-First Session Durability)

### Amendment: Internal State Durability

**Existing scope**: Save task results in language/framework-aware formats (SARIF, LCOV, source code). Historical tracking and cross-run comparison.

**Extension**: Add internal state persistence for AQE's own operational state alongside task-level result persistence.

> **Scope clarification (Devil's Advocate)**: AQE is an MCP server. Standard MCP sessions are managed by the calling client, not by AQE. This durability applies to AQE's INTERNAL state: in-flight task orchestration, learning patterns captured during a session, daemon state, and sub-agent context — NOT to the MCP client's conversation context.

**New decision added**:

> We extend ADR-036's result persistence with **internal state durability**. Before internal operations (sub-agent calls, task orchestration, daemon actions), a state entry is written to an append-only JSONL file at `.agentic-qe/sessions/{sessionId}.jsonl`. Each entry has a UUID and `parentUuid` forming a linked list for chronological reconstruction. Entry types: `tool_call`, `tool_result`, `state_change`, `error`. Session states: `idle`, `running`, `requires_action`. Write-ahead guarantees crash recovery for the QE Quality Daemon and long-running task orchestrations. Resume uses head+tail reads (4KB head for metadata, 64KB tail for recent context). Write batching: sync write for WAL guarantee on first entry, then 100ms batched appends.

**New files**:
- `src/mcp/services/session-store.ts` -- SessionStore class (append-only JSONL)
- `src/mcp/services/session-resume.ts` -- Head+tail fast resume
- `tests/mcp/services/session-store.test.ts`
- `tests/mcp/services/session-resume.test.ts`

**Modified files**:
- `src/mcp/protocol-server.ts` -- Integrate session write-ahead into tool calls
- `src/mcp/types.ts` -- Add SessionEntry and SessionMetadata types

**Kill switch**: `AQE_SESSION_DURABILITY=false` disables write-ahead logging.

---

## 5. ADR-041 Update: Startup Fast Paths (IMP-06)

**ADR**: ADR-041-v3-qe-cli-enhancement.md
**Status**: Implemented -> **Extended**
**Improvement**: IMP-06 (Startup Fast Paths)

### Amendment: Cold Boot Optimization

**Existing scope**: Interactive wizards, progress bars, workflow automation, streaming output, shell completions. Security hardening for YAML/JSON inputs.

**Extension**: Add startup fast paths for cold boot optimization, reducing time-to-first-response for common CLI operations.

**New decision added**:

> We extend ADR-041's CLI enhancement with **startup fast paths** that detect the invocation mode early and skip unnecessary initialization. Five boot modes: `cli-version` (zero imports, <50ms), `cli-health` (minimal imports, <200ms), `cli-full` (current behavior), `mcp` (skip CLI-specific init), `http` (skip interactive init). The current sequential startup in `src/mcp/entry.ts` (token tracking -> experience capture -> infra-healing -> fleet init -> server -> workers) is restructured into parallel phases: Phase 1 runs [token tracking + experience capture + infra-healing] concurrently via `Promise.allSettled()`, Phase 2 runs fleet init (depends on Phase 1), Phase 3 starts background workers non-blocking. Target: 50% reduction in MCP startup time, <50ms for `aqe --version`.

**New files**:
- `src/boot/fast-paths.ts` -- `detectBootMode()`, `isVersionFastPath()`
- `src/boot/parallel-prefetch.ts` -- `parallelPrefetch()` orchestrator
- `tests/boot/fast-paths.test.ts`

**Modified files**:
- `src/mcp/entry.ts` -- Replace sequential init with parallel prefetch
- `src/cli/index.ts` -- Add fast path check before any imports
- `src/kernel/kernel.ts` -- Split `initialize()` into parallel phases

**Kill switch**: `AQE_FAST_PATHS=false` reverts to sequential initialization.

---

## 6. ADR-058 Update: Hook Security Hardening (IMP-07)

**ADR**: ADR-058-guidance-governance-integration.md
**Status**: Implemented -> **Extended**
**Improvement**: IMP-07 (Hook Security Hardening)

### Amendment: SSRF Protection, Config Freeze, and Exit Code Semantics

**Existing scope**: Integration of @claude-flow/guidance governance modules (ContinueGate, MemoryWriteGate, DeterministicToolGateway, TrustAccumulator). 7-phase enforcement pipeline. 12 QE-specific policy shards.

**Extension**: Harden the hooks infrastructure that governance modules depend on against runtime tampering, SSRF attacks, and add model-visible blocking semantics.

**New decision added**:

> We extend ADR-058's governance integration with three security hardening measures: (1) **Config Freeze**: Hook configuration captured and deep-frozen (`Object.freeze` + `structuredClone`) at startup via `captureHooksConfigSnapshot()`. Mutations to frozen config throw TypeError. Post-startup file changes detected via chokidar and logged as warnings but do not affect the running session. (2) **SSRF Guard**: HTTP hook URLs validated against private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x/::1) with DNS rebinding protection (resolve hostname before connecting). Configurable allowlist for local development. (3) **Exit Code Semantics**: Exit 0 = silent success, Exit 2 = model-visible blocking error (agent sees the error and can adjust), other non-zero = user-visible only (logged but not shown to model). (4) **Policy Flags**: `AQE_HOOKS_MANAGED_ONLY=true` restricts to managed hooks, `AQE_HOOKS_DISABLED=true` emergency kill switch.

**New files**:
- `src/hooks/security/config-snapshot.ts` -- `captureHooksConfigSnapshot()`, `deepFreeze()`
- `src/hooks/security/ssrf-guard.ts` -- `validateHookUrl()`, PRIVATE_RANGES
- `src/hooks/security/exit-codes.ts` -- HOOK_EXIT_CODES, `classifyHookExit()`
- `tests/hooks/security/config-snapshot.test.ts`
- `tests/hooks/security/ssrf-guard.test.ts`

**Modified files**:
- `src/hooks/cross-phase-hooks.ts` -- Use frozen config, SSRF validation, exit code classification

**New dependency**:
| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Extended By | ADR-089 | 4-Tier Compaction | Compaction hooks respect freeze and exit semantics |
| Used By | IMP-09 | Plugin Architecture | Plugin hooks go through SSRF guard |
| Relates To | ADR-083 | Coherence-Gated Actions | Exit code 2 feeds coherence gate decisions |

---

## 7. ADR-056 Update: Plugin Architecture for QE Domains (IMP-09)

**ADR**: ADR-056-skill-validation-system.md
**Status**: Implemented -> **Extended**
**Improvement**: IMP-09 (Plugin Architecture for QE Domains)

### Amendment: External Plugin Lifecycle

**Existing scope**: 4-layer "Trust But Verify" validation (intent, schema, executable validators, evaluation suites). 5 trust tiers. 97 skills categorized. CLI integration via `aqe skill` and `aqe eval`.

**Extension**: Extend the skill validation system to support externally-distributed QE domain plugins installable from GitHub repos, npm packages, or local directories.

**New decision added**:

> We extend ADR-056's skill validation framework with an **external plugin lifecycle**. Plugins are distributed as directories containing a `qe-plugin.json` manifest declaring name (kebab-case), version (semver), domains, dependencies, entry point, hooks, and minAqeVersion. Plugin sources: local directory, GitHub repo (clone), npm package (install + copy). Plugins are cached immutably at `.agentic-qe/plugins/{name}@{version}/` (once cached, never modified). Dependencies resolved via DFS walk with cycle detection. Plugin loading integrates with existing `DefaultPluginLoader` in `src/kernel/plugin-loader.ts`. Security: reserved namespace blocking (`aqe-*`, `agentic-qe-*`), non-ASCII name rejection (homograph prevention), entry point path traversal validation, hook policy integration via ADR-058's SSRF guard. CLI commands: `aqe plugin install <source>`, `aqe plugin list`, `aqe plugin remove <name>`. Existing skill validation (trust tiers, schemas, validators, evals) applies equally to plugin-provided skills.

**New files**:
- `src/plugins/manifest.ts` -- QEPluginManifest schema and validation
- `src/plugins/sources/local.ts`, `github.ts`, `npm.ts` -- Source handlers
- `src/plugins/cache.ts` -- Versioned immutable cache
- `src/plugins/resolver.ts` -- DFS dependency resolution
- `src/plugins/lifecycle.ts` -- Plugin lifecycle manager
- `src/plugins/security.ts` -- Name validation, path traversal protection
- `tests/plugins/manifest.test.ts`, `resolver.test.ts`, `lifecycle.test.ts`

**Modified files**:
- `src/kernel/plugin-loader.ts` -- Accept external plugins alongside internal factories
- `src/kernel/kernel.ts` -- Integrate plugin lifecycle into kernel init
- `src/cli/index.ts` -- Add `aqe plugin` commands

**New dependencies**:
| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-058 | Governance (Hooks Security) | Plugin hooks validated via SSRF guard |
| Relates To | ADR-051 | Agentic-Flow Integration | Plugins can provide domain coordinators |

**Kill switch**: `AQE_PLUGINS_DISABLED=true` disables external plugin loading.

---

## 8. ADR-051 Update: Plugin Domain Coordinators (IMP-09 Secondary)

**ADR**: ADR-051-agentic-flow-integration.md
**Status**: Implemented -> **Extended**
**Improvement**: IMP-09 (Plugin Architecture, secondary integration)

### Amendment: Plugin-Provided Domain Coordinators

**Existing scope**: Deep integration of Agent Booster, ReasoningBank, Multi-Model Router, ONNX Embeddings, QUIC Swarm into AQE v3. Achieved 352x faster transforms, 87% cost reduction.

**Extension**: Allow the domain coordinator pattern established by ADR-051 to be extended via external plugins (as defined by ADR-056 amendment).

**New decision added**:

> We extend ADR-051's domain coordinator integration to support **plugin-provided domain coordinators**. Currently, `DOMAIN_FACTORIES` in `src/kernel/kernel.ts` is a static Record mapping domain names to factory functions. With the plugin architecture (ADR-056 amendment), external plugins can register additional domain coordinators via their `qe-plugin.json` manifest's `domains` field. The kernel's `DefaultPluginLoader` merges plugin-provided coordinators into the factory map at load time, with built-in domains taking precedence (plugins cannot override core domains like `coverage-analysis` or `test-generation`). Plugin coordinators receive the same kernel services (memory backend, event bus, anti-drift middleware) as built-in coordinators.

**Modified files**:
- `src/kernel/kernel.ts` -- Support dynamic DOMAIN_FACTORIES extension from plugins
- `src/kernel/plugin-loader.ts` -- Merge plugin domains into factory map

**No new files** (implemented within IMP-09's plugin lifecycle).

---

## Summary: All ADR Changes

| ADR | Improvement | Change Type | Key Addition |
|-----|-----------|-------------|--------------|
| **ADR-042** | IMP-01 | Extended | Microcompact engine for cross-result eviction |
| **ADR-039** | IMP-02 | Extended | `isConcurrencySafe` flags + BatchToolExecutor |
| **ADR-057** | IMP-03, IMP-10 | Extended | Unified retry engine + QE Quality Daemon |
| **ADR-036** | IMP-04 | Extended | Transcript-first JSONL session persistence |
| **ADR-041** | IMP-06 | Extended | Boot mode detection + parallel prefetch |
| **ADR-058** | IMP-07 | Extended | Config freeze + SSRF guard + exit code semantics |
| **ADR-056** | IMP-09 | Extended | External plugin lifecycle with marketplace sources |
| **ADR-051** | IMP-09 | Extended | Plugin-provided domain coordinators |
| **ADR-088** | IMP-05 | **NEW** | Prompt cache latch fields |
| **ADR-089** | IMP-08 | **NEW** | 4-tier context compaction pipeline |

### Cross-Cutting Dependencies

```
ADR-088 (Prompt Cache Latch)
  └── Used by ADR-089 (stable prompt enables better budget estimation)
  └── Used by ADR-057/IMP-10 (daemon API calls use latched headers)

ADR-089 (4-Tier Compaction)
  ├── Tier 1 = ADR-042/IMP-01 (microcompact)
  ├── Uses ADR-036/IMP-04 (session history for all tiers)
  └── Used by ADR-057/IMP-10 (daemon long sessions)

ADR-058/IMP-07 (Hook Security)
  └── Used by ADR-056/IMP-09 (plugin hooks)
  └── Used by ADR-057/IMP-10 (daemon notifications)

ADR-039/IMP-02 (Tool Concurrency)
  └── Used by ADR-041/IMP-06 (parallel init)
  └── Used by ADR-057/IMP-10 (daemon batch operations)
```
