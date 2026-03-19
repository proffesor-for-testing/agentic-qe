# API Contracts & Integration Analysis Report -- v3.8.3

**Date**: 2026-03-19
**Scope**: MCP tool interface contracts, CLI command contracts, internal API boundaries, error recovery, external integrations, database contracts, breaking change risk, event-driven architecture
**Baseline**: v3.7.10 report (2026-03-06)
**Status**: Comprehensive analysis with 12 findings (0 critical, 3 high, 5 medium, 4 low)

---

## Executive Summary

AQE v3.8.3 has addressed both CRITICAL findings from the v3.7.10 baseline. The SQL allowlist now covers all 40 tables (up from 36), and the ToolRegistry constructor initializes all 10 ToolCategory values. The MCP protocol version string inconsistency is also resolved (unified at `2025-11-25`). The HTTP client retry logic has been upgraded from linear to exponential backoff. However, the total MCP tool count has grown from 52 to 73 (protocol-server), and `process.exit()` usage has ballooned from 20 to 110 instances, indicating significant new CLI command modules that bypass `cleanupAndExit()`. Three high-severity findings remain around missing `required` flags, process.exit proliferation, and event listener cleanup gaps.

### Findings Summary

| Severity | Count | v3.7.10 | Delta | Summary |
|----------|-------|---------|-------|---------|
| CRITICAL | 0 | 2 | -2 | Both resolved (SQL allowlist, ToolCategory registration) |
| HIGH | 3 | 3 | 0 | process.exit proliferation (110 calls), missing `required` flags, EventEmitter listener cleanup gaps |
| MEDIUM | 5 | 2 | +3 | DomainHandlerDomain divergence, `learning` ToolCategory unused, quality_assess/protocol-server missing `target`, server.ts/protocol-server tool definition drift, no `setMaxListeners` |
| LOW | 4 | 0 | +4 | QE bridge tools registered as `domain` only, version hardcode in constructor, HTTP client missing jitter, EventBatcher lifecycle |

### Resolved from v3.7.10 Baseline

| ID | v3.7.10 Finding | Status |
|----|----------------|--------|
| CRIT-1 | SQL allowlist gap for 3+ tables | **RESOLVED** -- `captured_experiences`, `experience_applications`, `witness_chain` added; hypergraph names reconciled with both `hypergraph_nodes`/`hypergraph_edges` and legacy `hypergraph_vertices`/`hypergraph_hyperedges` |
| CRIT-2 | ToolCategory not registered (`cross-phase`, `routing`, `infra-healing`) | **RESOLVED** -- `tool-registry.ts:273-276` now initializes all 10 categories |
| HIGH-3 | Protocol version string mismatch (2024-11-05 vs 2025-11-25) | **RESOLVED** -- `protocol-server.ts:3` header and `:312`/`:418` code both say `2025-11-25` |
| MED-7 | HTTP client uses linear retry delay | **RESOLVED** -- `http-client.ts:326` now uses `baseRetryDelay * Math.pow(2, attempt)` |

---

## 1. MCP Tool Interface Contracts

### 1.1 Tool Inventory

The MCP protocol server (`src/mcp/protocol-server.ts`) is the actual stdio endpoint exposed to clients. It registers tools in two ways:

1. **Hardcoded registrations** in `registerAllTools()`: **54 tools**
2. **QE bridge** (`src/mcp/qe-tool-bridge.ts`): **19 additional tools** (30 QE_TOOLS minus 11 already-registered overlaps)

**Total protocol-server MCP tools: 73**

The programmatic `MCPServer` class (`src/mcp/server.ts`) registers a separate set of **42 tools** with `mcp__agentic_qe__` prefixed names for internal/SDK use.

**Comparison to v3.7.10**: Tool count grew from 52 to 73 (+40%), primarily from QE bridge additions (embeddings, coherence, mincut, GOAP, QX, scheduling, load-test, browser-workflow tools).

| Category | Protocol-Server Count | MCPServer Count | Notes |
|----------|----------------------|-----------------|-------|
| core | 4 (fleet_init, fleet_status, fleet_health, aqe_health) | 3 | aqe_health is protocol-server only |
| task | 5 | 5 | Parity |
| agent | 10 (4 base + 6 team tools) | 4 | Team tools are protocol-server only |
| domain | 12 + 19 bridged = 31 | 12 | Bridged QE tools extend protocol-server |
| memory | 6 | 6 | Parity |
| cross-phase | 8 | 8 | Parity |
| coordination | 4 (pipeline tools) | 4 | Parity |
| routing | 2 (model_route, routing_metrics) | 0 | Protocol-server only |
| infra-healing | 3 | 0 | Protocol-server only |
| learning | 0 | 0 | Defined in ToolCategory but unused |

### 1.2 Input Validation Assessment

**PASS -- SEC-001 centralized validation in ToolRegistry**

The `ToolRegistry.invoke()` method (`tool-registry.ts:392-461`) enforces three-layer validation:
1. Tool name format validation (`VALID_TOOL_NAME_PATTERN`)
2. Parameter schema validation (type, required, enum, unknown rejection)
3. Input sanitization via `sanitizeInput()` from CVE prevention module

**FINDING [HIGH-1] -- Missing `required` flags on logically-required parameters**

Several parameters that are operationally required lack `required: true` in their tool definitions. This persists from v3.7.10 with additional instances:

| Tool | File | Parameter | Expected | Actual |
|------|------|-----------|----------|--------|
| `test_generate_enhanced` | `server.ts:272-273` | `sourceCode` or `filePath` | At least one required | Both optional |
| `coverage_analyze_sublinear` | `server.ts:317` | `target` | Required | Optional |
| `quality_assess` | `server.ts:336` | `target` | Required | Missing entirely from server.ts |
| `quality_assess` | `protocol-server.ts:810-812` | `target` | Required | Missing entirely |
| `security_scan_comprehensive` | `server.ts:357` | `target` | Required | Optional |
| `coverage_analyze_sublinear` | `protocol-server.ts:797` | `target` | Required | Optional |
| `security_scan_comprehensive` | `protocol-server.ts:826` | `target` | Required | Optional |

The `quality_assess` tool in the protocol-server (`protocol-server.ts:807-813`) exposes only `runGate` as a parameter, omitting `target`, `threshold`, and `metrics` entirely. Users calling `quality_assess` via the protocol server cannot specify a target path.

### 1.3 Error Response Consistency

**PASS** -- All handlers return `ToolResult<T>` with consistent shape:

```typescript
interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: ToolResultMetadata;
}
```

The `ToolResultMetadata` interface (`types.ts:77-86`) now includes `dataSource?: DataSource` (`'real' | 'demo' | 'fallback'`) for audit transparency -- a new addition since v3.7.10.

### 1.4 Return Type Consistency

**PASS** -- Domain handlers use `createDomainHandler()` factory (`handler-factory.ts:782-911`) which enforces typed `TResult` generics. V2-compatible fields are maintained in all result types.

### 1.5 ToolCategory Registration

**RESOLVED from v3.7.10** -- The `ToolRegistry` constructor (`tool-registry.ts:273-276`) now initializes all 10 categories:

```typescript
const categories: ToolCategory[] = [
  'core', 'task', 'agent', 'domain', 'coordination', 'memory', 'learning',
  'routing', 'cross-phase', 'infra-healing',
];
```

**FINDING [MED-1] -- `learning` ToolCategory defined but never used**

The `learning` category is initialized in the ToolRegistry and defined in the `ToolCategory` type (`types.ts:47`), but no tool is registered with `category: 'learning'`. The `LearningOptimizeTool` and `DreamCycleTool` from the QE tools registry are bridged with `category: 'domain'` (via `qe-tool-bridge.ts:99`). This makes `getByCategory('learning')` always return an empty array and `stats.byCategory.learning` always report 0.

**File**: `src/mcp/qe-tool-bridge.ts:99`, `src/mcp/tools/registry.ts:218-231`

### 1.6 Tool Definition Drift Between Server Instances

**FINDING [MED-2] -- server.ts and protocol-server.ts tool definitions diverge**

The same logical tools are defined with different parameter sets in the two server implementations:

| Tool | server.ts params | protocol-server.ts params | Missing in protocol-server |
|------|------------------|---------------------------|---------------------------|
| `fleet_init` | 8 params | 4 params | testingFocus, frameworks, environments, memoryBackend |
| `fleet_status` | 3 params | 1 param | includeDomains, includeMetrics |
| `fleet_health` | 2 params | 1 param | detailed |
| `quality_assess` | 4 params (target, runGate, threshold, metrics) | 1 param (runGate) | target, threshold, metrics |
| `memory_share` | 4 params | 3 params | knowledgeContent |
| `task_orchestrate` | 5 params | 2 params | priority, maxAgents, context |

This means MCP clients using the protocol-server (the actual stdio endpoint) have reduced functionality compared to programmatic MCPServer users. The `quality_assess` gap is particularly impactful -- protocol-server clients cannot specify what to assess.

**Files**: `src/mcp/server.ts`, `src/mcp/protocol-server.ts`

### 1.7 inputSchema Completeness

**PASS** -- The `buildInputSchema()` method (`protocol-server.ts:1267-1305`) correctly translates `ToolParameter[]` to JSON Schema format with `type`, `description`, `enum`, `default`, and `required` fields. The `required` array is only emitted when non-empty, which is correct per JSON Schema specification.

---

## 2. SQL Allowlist Compliance

### 2.1 Allowlist Coverage

**RESOLVED from v3.7.10** -- The `ALLOWED_TABLE_NAMES` set (`src/shared/sql-safety.ts:13-42`) now contains **40 entries**:

- **33 tables** created via `CREATE TABLE IF NOT EXISTS` in schema files
- **7 additional entries**: `patterns` (sync), `hypergraph_vertices`, `hypergraph_hyperedges`, `hypergraph_edge_vertices`, `hypergraph_vertex_properties`, `hypergraph_edge_properties` (legacy compat), `experience_applications` (not in schema CREATE statements but allowlisted)

**Table creation vs. allowlist diff**: All tables from `unified-memory-schemas.ts`, `20260120_add_hypergraph_tables.ts`, and `experience-capture-middleware.ts` are present in the allowlist. The `experience_applications` and legacy hypergraph aliases are in the allowlist but not explicitly created in any schema file -- they serve as forward/backward compatibility entries.

### 2.2 STATS_TABLES Alignment

**RESOLVED from v3.7.10** -- The `STATS_TABLES` array (`unified-memory-schemas.ts:607-641`) now references `hypergraph_nodes` and `hypergraph_edges`, which match both the migration CREATE TABLE names and the allowlist. The `queryCount()` method (`unified-memory.ts:767-776`) validates against the allowlist before executing.

### 2.3 Validation Function

**PASS** -- `validateTableName()` (`sql-safety.ts:48-53`) throws on unrecognized names. The `validateIdentifier()` function (`sql-safety.ts:72-88`) provides regex-based validation for schema-qualified names, supporting `schema.table` syntax.

---

## 3. process.exit() Usage

**FINDING [HIGH-2] -- process.exit() proliferation: 110 calls across 19 files**

The total `process.exit()` count has grown from 20 (v3.7.10 baseline) to **110** -- a 5.5x increase. This is driven by new CLI command modules (`learning.ts`, `hooks.ts`, `ruvector-commands.ts`, `platform.ts`) that bypass `cleanupAndExit()`.

| File | Count | Should Use cleanupAndExit? |
|------|-------|---------------------------|
| `src/cli/commands/learning.ts` | 45 | Yes -- CLI command handler |
| `src/cli/commands/hooks.ts` | 25 | Yes -- CLI command handler |
| `src/cli/commands/sync.ts` | 5 | Yes -- CLI command handler |
| `src/cli/commands/ruvector-commands.ts` | 4 | Yes -- CLI command handler |
| `src/cli/commands/platform.ts` | 3 | Yes -- CLI command handler |
| `src/cli/commands/mcp.ts` | 3 | Acceptable (child process mgmt) |
| `src/cli/commands/llm-router.ts` | 2 | Yes -- CLI command handler |
| `src/cli/commands/eval.ts` | 2 | Yes -- CLI command handler |
| `src/cli/commands/init.ts` | 2 | Yes -- CLI command handler |
| `src/cli/commands/token-usage.ts` | 1 | Yes -- CLI command handler |
| `src/mcp/entry.ts` | 3 | Acceptable (MCP entry point) |
| `src/mcp/protocol-server.ts` | 1 | Acceptable (shutdown handler) |
| `src/kernel/unified-persistence.ts` | 2 | Acceptable (signal handlers) |
| `src/kernel/unified-memory.ts` | 2 | Acceptable (signal handlers) |
| `src/benchmarks/run-benchmarks.ts` | 2 | Acceptable (standalone script) |
| `src/performance/run-gates.ts` | 3 | Acceptable (standalone script) |
| `src/cli/index.ts` | 2 | Acceptable (cleanupAndExit impl + force-exit timer) |
| `src/integrations/browser/web-content-fetcher.ts` | 1 | Acceptable (standalone script) |
| `src/init/phases/10-workers.ts` | 2 | Acceptable (daemon script) |

**CLI commands that should use cleanupAndExit but don't**: `learning.ts` (45), `hooks.ts` (25), `sync.ts` (5), `ruvector-commands.ts` (4), `platform.ts` (3), `llm-router.ts` (2), `eval.ts` (2), `init.ts` (2), `token-usage.ts` (1) = **89 instances** requiring migration.

Direct `process.exit()` bypasses:
- SQLite WAL checkpoint on close
- `kernel.dispose()` resource cleanup
- Token tracking persistence
- Background worker shutdown
- Memory singleton reset

---

## 4. Protocol Version Consistency

**RESOLVED from v3.7.10** -- The protocol version is now consistent:

| Location | Version |
|----------|---------|
| `protocol-server.ts:3` (file header comment) | `MCP 2025-11-25` |
| `getServerInfo()` (`protocol-server.ts:312`) | `'2025-11-25'` |
| `handleInitialize()` response (`protocol-server.ts:418`) | `'2025-11-25'` |

No `2024-11-05` references remain.

---

## 5. Error Recovery Patterns

### 5.1 Circuit Breaker Adoption

Three-tier circuit breaker coverage remains strong:

| Level | Implementation | File | Config | Changes since v3.7.10 |
|-------|---------------|------|--------|----------------------|
| **Domain** | `DomainCircuitBreaker` | `src/coordination/circuit-breaker/domain-circuit-breaker.ts` | threshold=3, reset=60s, window=120s | No change |
| **LLM Provider** | `CircuitBreaker` | `src/shared/llm/circuit-breaker.ts` | threshold=5, reset=30s, window=60s | No change |
| **HTTP** | `CircuitBreaker` | `src/shared/http/http-client.ts` | threshold=5, reset=30s, per-origin | No change |

Circuit breaker implementations found across **41 files** (up from ~20 in v3.7.10), indicating broader adoption across LLM providers (OpenRouter, Gemini, Bedrock, Azure-OpenAI, Ollama), chaos-resilience domain, and contract-testing coordinator.

### 5.2 Retry Logic

**RESOLVED from v3.7.10** -- HTTP client now uses exponential backoff:

```typescript
// src/shared/http/http-client.ts:326
const delay = baseRetryDelay * Math.pow(2, attempt);
```

**FINDING [LOW-1] -- No jitter in exponential backoff**

The HTTP client retry uses pure exponential backoff without jitter. Under concurrent usage, multiple retries hitting the same endpoint will all fire at exactly the same delay intervals (1s, 2s, 4s), potentially causing "thundering herd" effects. Standard practice is to add randomized jitter: `delay * (0.5 + Math.random() * 0.5)`.

**File**: `src/shared/http/http-client.ts:326`

| Component | Retry Count | Backoff | File | Changes |
|-----------|------------|---------|------|---------|
| MCP Transport Reconnect | 3 | Exponential (1s, 2s, 4s) | `protocol-server.ts:248` | No change |
| HTTP Client | 3 (default) | Exponential (1s, 2s, 4s) | `http-client.ts:326` | **Fixed** from linear |
| Test Execution | 3 (configurable) | Not specified | `server.ts` | No change |
| Workflow Steps | Configurable per step | Not specified | Various | No change |

### 5.3 Graceful Degradation

Multiple graceful degradation paths verified:

1. Fleet status learning metrics: `try/catch` with `queryCount` wrapped (`core-handlers.ts:346-347`)
2. Pattern search in handler factory: Silent catch returns empty array (`handler-factory.ts:654-661`)
3. Experience capture: Fire-and-forget with catch (`handler-factory.ts:874-880`)
4. Feedback loop recording: Non-critical catch blocks (`handler-factory.ts:883-887`)
5. Domain circuit breaker: Cascade isolation support
6. RuVector integration: Process lifecycle management with error/exit handlers (`server-client.ts:307-314`)

---

## 6. CLI-MCP Parity

### 6.1 MCP-Only Features (no CLI equivalent)

| Feature | MCP Tool | Notes |
|---------|----------|-------|
| Model routing | `model_route`, `routing_metrics` | CLI has `llm-router` command but different interface |
| Infrastructure healing | `infra_healing_status/feed_output/recover` | No CLI equivalent |
| Agent teams | `team_list/health/message/broadcast/scale/rebalance` | No CLI equivalent |
| Cross-phase feedback | 8 cross-phase tools | No CLI equivalent |
| Pipeline YAML | `pipeline_load/run/list/validate` | CLI has `workflow` command, different interface |
| AQE health | `aqe_health` | CLI `status` command is similar |

### 6.2 CLI-Only Features (no MCP equivalent)

| Feature | CLI Command | Notes |
|---------|-------------|-------|
| Shell completions | `completions` | CLI-specific |
| MCP server management | `mcp start/stop` | Meta-management |
| Eval framework | `eval` | No MCP tool |
| Token usage tracking | `token-usage` | QE bridge has `qe/analysis/token_usage` |
| Brain export/import | `brain` | No MCP tool |
| CI/CD integration | `ci` | No MCP tool |
| Cloud sync | `sync` | No MCP tool |
| Fleet watch mode | `fleet watch` | No MCP equivalent (long-running) |
| RuVector commands | `ruvector` | No MCP equivalent |
| Learning management | `learning` (15+ subcommands) | QE bridge has `qe/learning/optimize` and `qe/learning/dream` only |
| Prove/Audit | `prove`, `audit` | No MCP equivalent |

### 6.3 Parity Assessment

The gap between CLI and MCP has widened since v3.7.10 with the addition of 21 new protocol-server tools (team, cross-phase, pipeline, routing, infra-healing, aqe_health) that have no CLI counterparts. Conversely, the CLI has grown with `learning`, `prove`, `audit`, and `ruvector` commands with no MCP equivalents. Neither direction is necessarily wrong -- some features are naturally CLI-only or MCP-only -- but the lack of MCP tools for `eval`, `brain`, and `ci` is notable since these are workflow-oriented operations well-suited to MCP consumption.

---

## 7. Integration Health

### 7.1 External Service Integrations

| Integration | Error Handling | Timeout | Circuit Breaker | Notes |
|-------------|---------------|---------|-----------------|-------|
| RuVector native server | Process lifecycle with error/exit handlers | Not explicit | No | `server-client.ts:288-314` |
| Coherence WASM | Event-based retry with `on('retry')` pattern | Load-time only | No | `wasm-loader.ts:17-21` |
| Browser/Playwright | Process spawn with error handlers | Not explicit | No | `command-executor.ts:113-134` |
| CloudSync tunnel | Socket connect/error/close handlers | Not explicit | No | `tunnel-manager.ts:75-187` |
| HTTP (general) | Result type, retry, timeout, circuit breaker | 30s default | Yes, per-origin | `http-client.ts` |
| LLM providers (6) | Provider-specific error handling | Provider-specific | Yes | `shared/llm/providers/*.ts` |

### 7.2 Boundary Error Handling

**PASS** -- The protocol-server wraps all request handling in a safety net (`protocol-server.ts:201-216`) that catches unhandled errors and returns structured error responses instead of crashing the MCP connection. This is a robust pattern.

### 7.3 AG-UI Event Adapter Integration

The protocol-server integrates with the AG-UI EventAdapter (`protocol-server.ts:159-180`) for streaming events. Each tool call emits progress and result events:
- Progress event at tool start (`protocol-server.ts:463-471`)
- Result event on success/failure (`protocol-server.ts:478-506`)

The EventAdapter is created in the constructor but there is no `dispose()` or `destroy()` call on it when the server stops (`protocol-server.ts:288-293`). The AG-UI components (`EventAdapter`, `BackpressureHandler`, `StateManager`, `StreamController`) all extend `EventEmitter` and some have `destroy()` methods, but they are not called during server shutdown.

---

## 8. Event-Driven Architecture

### 8.1 Event Emitter Usage

EventEmitter-based classes identified across the codebase:

| Class | File | Extends EventEmitter | Has destroy/cleanup |
|-------|------|---------------------|---------------------|
| `EventBatcher` | `src/performance/optimizer.ts` | Yes | Yes (`destroy()` at :365) |
| `AGUISyncService` | `src/adapters/a2ui/integration/agui-sync.ts` | Yes | Yes (`removeAllListeners` at :210-211) |
| `SurfaceStateBridge` | `src/adapters/a2ui/integration/surface-state-bridge.ts` | Yes | Unknown |
| `SurfaceGenerator` | `src/adapters/a2ui/renderer/surface-generator.ts` | Yes | Unknown |
| `BackpressureHandler` | `src/adapters/ag-ui/backpressure-handler.ts` | Yes | Unknown |
| `StateManager` | `src/adapters/ag-ui/state-manager.ts` | Yes | Unknown |
| `EventAdapter` | `src/adapters/ag-ui/event-adapter.ts` | Yes | Yes (`destroy()` at :877) |
| `StreamController` | `src/adapters/ag-ui/stream-controller.ts` | Yes | Yes (`removeAllListeners` at :413) |

### 8.2 Listener Cleanup Analysis

**FINDING [HIGH-3] -- Event listener cleanup gaps in AG-UI adapter stack**

Several EventEmitter subclasses add listeners without corresponding removal:

1. **AGUISyncService** (`agui-sync.ts:193-194`): Adds `change` and `delta` listeners on `stateManager`. Removal exists in cleanup (`agui-sync.ts:210-211`), but surface listeners added at `:251-252` are removed via stored closure references (`agui-sync.ts:256-257`). **Partial** -- cleanup exists but depends on correct lifecycle management.

2. **EventAdapter** (`event-adapter.ts:236-239`): Adds `batch` and `single` listeners on its internal `eventBatcher`. The `destroy()` method at `:877` calls `this.eventBatcher.destroy()` which calls `removeAllListeners()`. **OK** -- but the EventAdapter itself does not call its own `removeAllListeners()` in `destroy()`. Listeners added by external consumers via `.on('event', ...)` will persist.

3. **StreamController** (`stream-controller.ts:438,450,455`): Adds an `abort` event listener on `signal` and `event`/`error` listeners on `adapter`. The `destroy()` method (`stream-controller.ts:413`) calls `this.removeAllListeners()` and the `createSSEStream` cleanup (`stream-controller.ts:586-588`) calls `.off()` for each handler. **OK** -- properly cleaned up.

4. **Protocol server signal handlers** (`unified-memory.ts:1020-1022`, `unified-persistence.ts:320-329`): Register `beforeExit`, `SIGINT`, `SIGTERM` on `process`. These are never removed. For singleton resources this is acceptable, but if multiple instances are created during testing, listeners will accumulate.

**FINDING [MED-3] -- No `setMaxListeners` configuration anywhere in codebase**

No calls to `setMaxListeners()` were found. The default Node.js limit is 10 listeners per event. In a multi-agent system where many components subscribe to the same EventEmitter, this could trigger `MaxListenersExceededWarning` at runtime, particularly on the `stateManager` and `eventAdapter` instances that are shared across multiple consumers.

---

## 9. Internal API Boundaries

### 9.1 DomainHandlerDomain vs DomainName

**PERSISTS from v3.7.10 -- FINDING [MED-4]**

The `DomainHandlerDomain` type (`handler-factory.ts:32-43`) defines 11 values, while `DomainName` (`shared/types/index.ts:32-46`) defines 14 values. Missing domains:
- `learning-optimization`
- `enterprise-integration`
- `coordination`

The handler factory cannot accept these three domains without type casting. This is by design (these domains don't have MCP tool handlers), but creates a type boundary mismatch for any code that needs to route arbitrary `DomainName` values through the handler factory.

### 9.2 Service-to-Service Interfaces

No changes from v3.7.10 -- boundaries remain clean:

| Boundary | Interface | Communication |
|----------|-----------|---------------|
| CLI -> Kernel | `QEKernel` interface | Direct method calls |
| MCP -> Kernel | Handler functions | Handler functions |
| Kernel -> Domains | `DomainPlugin` interface | Plugin system |
| Domain <-> Domain | `CrossDomainEventRouter` | Event bus |
| Queen -> Agents | `QueenCoordinator` | Task assignment |
| Agents -> Memory | `UnifiedMemoryManager` | SQLite backend |

### 9.3 Handler Factory Feedback Loop Integration

New since v3.7.10: The handler factory now integrates with `QualityFeedbackLoop` (`handler-factory.ts:262-338`), recording `TestOutcome` and `CoverageSession` data after domain handler execution. This creates a new internal coupling between:
- `handler-factory.ts` -> `feedback-loop.ts` -> `unified-memory.ts`

The coupling is non-critical (fire-and-forget with catch blocks), but adds latency to tool execution since `recordDomainFeedback()` is `await`-ed (not fire-and-forget).

---

## 10. Database Contract

### 10.1 Schema Tables

**40 tables** in the SQL allowlist, **33 tables** created via explicit `CREATE TABLE IF NOT EXISTS`:

| Category | Tables | Created In |
|----------|--------|-----------|
| Core KV | kv_store | unified-memory-schemas.ts |
| Vectors | vectors | unified-memory-schemas.ts |
| RL | rl_q_values | unified-memory-schemas.ts |
| GOAP (4) | goap_goals, goap_actions, goap_plans, goap_plan_signatures | unified-memory-schemas.ts |
| Dream (4) | concept_nodes, concept_edges, dream_cycles, dream_insights | unified-memory-schemas.ts |
| QE Patterns (4) | qe_patterns, qe_pattern_embeddings, qe_pattern_usage, qe_trajectories | unified-memory-schemas.ts |
| Execution (3) | embeddings, execution_results, executed_steps | unified-memory-schemas.ts |
| MinCut (6) | mincut_snapshots, mincut_history, mincut_weak_vertices, mincut_alerts, mincut_healing_actions, mincut_observations | unified-memory-schemas.ts |
| SONA | sona_patterns | unified-memory-schemas.ts |
| Feedback (3) | test_outcomes, routing_outcomes, coverage_sessions | unified-memory-schemas.ts |
| Hypergraph (2) | hypergraph_nodes, hypergraph_edges | 20260120_add_hypergraph_tables.ts |
| Witness | witness_chain | unified-memory-schemas.ts |
| Experience | captured_experiences | experience-capture-middleware.ts |
| Meta | schema_version | unified-memory-schemas.ts |

### 10.2 Allowlist Extras (Not Created via Schema)

7 entries in the allowlist that are not created via `CREATE TABLE IF NOT EXISTS` in any source file:

| Table | Purpose |
|-------|---------|
| `patterns` | Sync module compatibility |
| `hypergraph_vertices` | Legacy alias for `hypergraph_nodes` |
| `hypergraph_hyperedges` | Legacy alias for `hypergraph_edges` |
| `hypergraph_edge_vertices` | Legacy hypergraph schema compat |
| `hypergraph_vertex_properties` | Legacy hypergraph schema compat |
| `hypergraph_edge_properties` | Legacy hypergraph schema compat |
| `experience_applications` | Allowlisted but no CREATE TABLE found |

**FINDING [MED-5] -- `experience_applications` table allowlisted but never created**

The `experience_applications` table is in the SQL allowlist (`sql-safety.ts:39`) and is queried via `queryCount('experience_applications')` in `core-handlers.ts:355`, but no `CREATE TABLE IF NOT EXISTS experience_applications` exists in any schema file. If the table hasn't been created by some other mechanism, the `queryCount()` call will fail with a "no such table" SQLite error (the `try/catch` in `core-handlers.ts:347` will return 0, masking the issue).

---

## 11. Breaking Change Risk

### 11.1 Public API Surface

| Export Path | Description | Stability | Changes since v3.7.10 |
|-------------|-------------|-----------|----------------------|
| `.` | Main entry point | Stable | No breaking changes |
| `./kernel` | Kernel interfaces | Stable | No breaking changes |
| `./shared` | Shared types/utilities | Stable | `DataSource` type added (additive) |
| `./cli` | CLI entry point | Stable | New commands (additive) |
| `./ruvector` | Native vector wrappers | Experimental | No breaking changes |
| `./sync` | Cloud sync interfaces | Experimental | No breaking changes |

### 11.2 Semver Compliance

**Current version**: 3.8.3 (minor+patch since 3.7.10)

Changes since 3.7.10 are additive only:
- 21 new MCP tools in protocol-server (no removals)
- New `ToolResultMetadata.dataSource` field (optional, non-breaking)
- New CLI commands (`learning`, `prove`, `audit`, `ruvector`)
- New QE tools via bridge (embeddings, coherence, QX, scheduling, browser workflow)
- No changes to `DomainName` union type
- No changes to `ToolResult<T>` shape (additive metadata field only)

**FINDING [LOW-2] -- Hardcoded version `3.0.0` in protocol-server constructor**

The protocol-server constructor defaults to `version: '3.0.0'` (`protocol-server.ts:169`) rather than reading from `package.json`. The actual package version is `3.8.3`. This means the MCP `serverInfo.version` reported to clients is `3.0.0` unless overridden by the config. This is misleading but not breaking.

**File**: `src/mcp/protocol-server.ts:169`

---

## 12. Additional Findings

### FINDING [LOW-3] -- QE bridge tools all registered as `category: 'domain'`

All 19 bridged QE tools from `qe-tool-bridge.ts:99` are registered with `category: 'domain'` regardless of their actual nature. Tools like `qe/learning/optimize`, `qe/learning/dream`, `qe/planning/goap_plan`, `qe/coherence/check` would more accurately belong to `learning`, `coordination`, or a dedicated category. This reduces the usefulness of `getByCategory()` for non-domain tools.

**File**: `src/mcp/qe-tool-bridge.ts:99`

### FINDING [LOW-4] -- EventBatcher lifecycle not tied to parent

The `EventBatcher` class (`src/performance/optimizer.ts:293`) extends EventEmitter and has a `destroy()` method. It uses `setInterval` internally for batch flushing. If the parent `EventAdapter` or `PerformanceOptimizer` is garbage-collected without calling `destroy()`, the `setInterval` timer will keep the EventBatcher alive indefinitely, preventing garbage collection and potentially leaking memory.

**File**: `src/performance/optimizer.ts:293-365`

---

## 13. Recommendations

### High Priority

1. **Add `required: true` to essential MCP tool parameters** in both `server.ts` and `protocol-server.ts`:
   - `quality_assess.target` (also add the parameter to protocol-server)
   - `coverage_analyze_sublinear.target`
   - `security_scan_comprehensive.target`
   - At minimum `test_generate_enhanced.sourceCode` or `filePath` (consider a custom validator for "at least one of" pattern)

2. **Replace `process.exit()` with `cleanupAndExit()` in CLI commands** -- 89 instances across `learning.ts` (45), `hooks.ts` (25), `sync.ts` (5), `ruvector-commands.ts` (4), `platform.ts` (3), `llm-router.ts` (2), `eval.ts` (2), `init.ts` (2), `token-usage.ts` (1). The `cleanupAndExit` function is already imported in the CLI entry point and threaded through the command registry -- these modules just need to accept it as a parameter.

3. **Add event listener cleanup** to AG-UI adapter lifecycle:
   - Ensure `EventAdapter.destroy()` calls `this.removeAllListeners()`
   - Add `setMaxListeners()` calls on shared EventEmitter instances that may have >10 subscribers
   - Ensure protocol-server `stop()` calls `eventAdapter.destroy()`

### Medium Priority

4. **Align protocol-server tool parameters with server.ts** -- at minimum, add `target` parameter to `quality_assess` in protocol-server.ts

5. **Assign correct ToolCategory** to bridged QE tools (learning, coherence, planning tools should not all be `domain`)

6. **Create the `experience_applications` table** in a schema file, or verify it's created elsewhere and document the creation path

7. **Align `DomainHandlerDomain` with `DomainName`** or document the intentional 3-domain gap

8. **Add `setMaxListeners()`** to shared EventEmitter instances (stateManager, eventAdapter) that may accumulate listeners

### Low Priority

9. **Add jitter to exponential backoff** in `http-client.ts`: `delay * (0.5 + Math.random() * 0.5)`

10. **Fix hardcoded version** in `protocol-server.ts:169` -- read from `package.json` or pass via config

11. **Assign proper categories** to QE bridge tools instead of blanket `'domain'`

12. **Ensure EventBatcher interval cleanup** -- tie `destroy()` calls to parent lifecycle

---

## Appendix A: Tool Contract Quick Reference (Protocol-Server -- 73 Tools)

### Core Tools (4)

| Tool | Required Params | Optional Params |
|------|----------------|-----------------|
| fleet_init | none | topology, maxAgents, enabledDomains, lazyLoading |
| fleet_status | none | verbose |
| fleet_health | none | domain |
| aqe_health | none | none |

### Task Tools (5)

| Tool | Required Params | Optional Params |
|------|----------------|-----------------|
| task_submit | type | priority, payload |
| task_list | none | status, limit |
| task_status | taskId | none |
| task_cancel | taskId | none |
| task_orchestrate | task | strategy |

### Agent Tools (4 + 6 Team)

| Tool | Required Params | Optional Params |
|------|----------------|-----------------|
| agent_list | none | domain |
| agent_spawn | domain | type |
| agent_metrics | none | agentId |
| agent_status | agentId | none |
| team_list | none | domain |
| team_health | domain | none |
| team_message | from, to, type, payload | domain |
| team_broadcast | domain, type, payload | none |
| team_scale | domain, targetSize | none |
| team_rebalance | none | none |

### Memory Tools (6)

| Tool | Required Params | Optional Params |
|------|----------------|-----------------|
| memory_store | key, value | namespace |
| memory_retrieve | key | namespace |
| memory_query | none | pattern, namespace, semantic |
| memory_delete | key | namespace |
| memory_usage | none | none |
| memory_share | sourceAgentId, targetAgentIds, knowledgeDomain | none |

### Cross-Phase Tools (8)

| Tool | Required Params | Optional Params |
|------|----------------|-----------------|
| cross_phase_store | loop, data | none |
| cross_phase_query | loop | maxAge, filter |
| agent_complete | agentName, result | none |
| phase_start | phase | context |
| phase_end | phase | context |
| cross_phase_stats | none | none |
| format_signals | signals | none |
| cross_phase_cleanup | none | none |

### Routing Tools (2)

| Tool | Required Params | Optional Params |
|------|----------------|-----------------|
| model_route | task | codeContext, filePaths, manualTier, isCritical, agentType, domain |
| routing_metrics | none | includeLog, logLimit |

### Infra-Healing Tools (3)

| Tool | Required Params | Optional Params |
|------|----------------|-----------------|
| infra_healing_status | none | verbose |
| infra_healing_feed_output | none | output |
| infra_healing_recover | none | services, rerunTests |

### Coordination Tools (4)

| Tool | Required Params | Optional Params |
|------|----------------|-----------------|
| pipeline_load | yaml | variables |
| pipeline_run | pipelineId | input |
| pipeline_list | none | none |
| pipeline_validate | yaml | variables |

### Domain Tools (12 hardcoded + 1 validation_pipeline)

| Tool | Required Params | Optional Params |
|------|----------------|-----------------|
| test_generate_enhanced | none | sourceCode, language, testType |
| test_execute_parallel | none | testFiles, parallel |
| coverage_analyze_sublinear | none | target, detectGaps |
| quality_assess | none | runGate |
| security_scan_comprehensive | none | sast, dast, target |
| contract_validate | none | contractPath |
| accessibility_test | none | url, standard |
| chaos_test | none | faultType, target |
| defect_predict | none | target |
| requirements_validate | none | requirementsPath |
| code_index | none | target |
| validation_pipeline | none | filePath, content, pipeline, steps, continueOnFailure, format |

### QE Bridge Tools (19)

| Tool | Source |
|------|--------|
| qe/coverage/gaps | CoverageGapsTool |
| qe/requirements/quality-criteria | QualityCriteriaTool |
| qe/visual/compare | VisualCompareTool |
| qe/learning/optimize | LearningOptimizeTool |
| qe/learning/dream | DreamCycleTool |
| qe/analysis/token_usage | TokenUsageTool |
| qe/planning/goap_plan | GOAPPlanTool |
| qe/planning/goap_execute | GOAPExecuteTool |
| qe/planning/goap_status | GOAPStatusTool |
| qe/mincut/health | MinCutHealthTool |
| qe/mincut/analyze | MinCutAnalyzeTool |
| qe/mincut/strengthen | MinCutStrengthenTool |
| qe/embeddings/generate | EmbeddingGenerateTool |
| qe/embeddings/compare | EmbeddingCompareTool |
| qe/embeddings/search | EmbeddingSearchTool |
| qe/embeddings/store | EmbeddingStoreTool |
| qe/embeddings/stats | EmbeddingStatsTool |
| qe/coherence/check | CoherenceCheckTool |
| qe/coherence/audit | CoherenceAuditTool |
| qe/coherence/consensus | CoherenceConsensusTool |
| qe/coherence/collapse | CoherenceCollapseTool |
| qe/qx/analyze | QXAnalyzeTool |
| qe/tests/schedule | TestScheduleTool |
| qe/tests/load | LoadTestTool |
| qe/security/url-validate | VisualSecurityTool |
| qe/workflows/browser-load | BrowserWorkflowTool |

*Note: 30 QE tools minus 11 already-registered = 19 bridged. The table above lists all 26 non-overlapping names (some tools may not be in the 19 bridged count due to MINCUT_TOOLS and COHERENCE_TOOLS spread operators being counted individually).*

## Appendix B: Process.exit() Migration Tracker

| File | Current Count | Target (process.exit -> cleanupAndExit) |
|------|--------------|----------------------------------------|
| `src/cli/commands/learning.ts` | 45 | 45 |
| `src/cli/commands/hooks.ts` | 25 | 25 |
| `src/cli/commands/sync.ts` | 5 | 5 |
| `src/cli/commands/ruvector-commands.ts` | 4 | 4 |
| `src/cli/commands/platform.ts` | 3 | 3 |
| `src/cli/commands/llm-router.ts` | 2 | 2 |
| `src/cli/commands/eval.ts` | 2 | 2 |
| `src/cli/commands/init.ts` | 2 | 2 |
| `src/cli/commands/token-usage.ts` | 1 | 1 |
| **Total** | **89** | **89** |

## Appendix C: Database Schema Tables (40 allowlisted, 33 created)

| Category | Tables |
|----------|--------|
| Core KV | kv_store |
| Vectors | vectors |
| RL | rl_q_values |
| GOAP | goap_goals, goap_actions, goap_plans, goap_plan_signatures |
| Dream | concept_nodes, concept_edges, dream_cycles, dream_insights |
| QE Patterns | qe_patterns, qe_pattern_embeddings, qe_pattern_usage, qe_trajectories |
| Execution | embeddings, execution_results, executed_steps |
| MinCut | mincut_snapshots, mincut_history, mincut_weak_vertices, mincut_alerts, mincut_healing_actions, mincut_observations |
| SONA | sona_patterns |
| Feedback | test_outcomes, routing_outcomes, coverage_sessions |
| Hypergraph (active) | hypergraph_nodes, hypergraph_edges |
| Hypergraph (legacy compat) | hypergraph_vertices, hypergraph_hyperedges, hypergraph_edge_vertices, hypergraph_vertex_properties, hypergraph_edge_properties |
| Witness | witness_chain |
| Experience | captured_experiences, experience_applications |
| Sync | patterns |
| Meta | schema_version |

---

*Report generated by QE Integration Reviewer (qe-integration-reviewer v3.8.3)*
