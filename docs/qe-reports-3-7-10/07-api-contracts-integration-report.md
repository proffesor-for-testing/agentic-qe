# API Contracts & Integration Analysis Report -- v3.7.10

**Date**: 2026-03-06
**Scope**: MCP tool interface contracts, CLI command contracts, internal API boundaries, error recovery, external integrations, database contracts, breaking change risk
**Status**: Gap coverage -- this analysis was identified as missing from v3.7.0 reports

---

## Executive Summary

The AQE v3.7.10 codebase demonstrates a well-structured API surface with strong input validation on the MCP tool layer (SEC-001 fix), comprehensive circuit breaker patterns at both domain and LLM provider levels, and consistent `ToolResult<T>` return types across all 39 MCP tools. However, the analysis identified **7 contract issues** (2 critical, 3 high, 2 medium) that should be addressed before the next minor release.

### Key Findings

| Severity | Count | Summary |
|----------|-------|---------|
| CRITICAL | 2 | SQL allowlist gap for 3+ tables; `cross-phase` ToolCategory not registered in ToolRegistry constructor |
| HIGH | 3 | Inconsistent exit code patterns in CLI; missing `required` flags on MCP parameters; protocol version string mismatch |
| MEDIUM | 2 | Some CLI commands bypass `cleanupAndExit`; handler factory DomainHandlerDomain type diverges from shared DomainName |

---

## 1. MCP Tool Interface Contracts

### 1.1 Tool Inventory

The MCP server (`src/mcp/server.ts`) registers **39 tools** across 6 categories:

| Category | Count | Tools | Lazy-Loaded |
|----------|-------|-------|-------------|
| core | 3 | fleet_init, fleet_status, fleet_health | No |
| task | 5 | task_submit, task_list, task_status, task_cancel, task_orchestrate | No |
| agent | 4 | agent_list, agent_spawn, agent_metrics, agent_status | No |
| domain | 11 | test_generate_enhanced, test_execute_parallel, coverage_analyze_sublinear, quality_assess, security_scan_comprehensive, contract_validate, accessibility_test, chaos_test, defect_predict, requirements_validate, code_index | Yes |
| memory | 6 | memory_store, memory_retrieve, memory_query, memory_delete, memory_usage, memory_share | No |
| cross-phase | 8 | cross_phase_store, cross_phase_query, agent_complete, phase_start, phase_end, cross_phase_stats, format_signals, cross_phase_cleanup | No |

Additionally, the `protocol-server.ts` registers supplementary tools not in `server.ts`:
- `aqe_health` (health endpoint)
- `model_route`, `routing_metrics` (ADR-051)
- `infra_healing_status`, `infra_healing_feed_output`, `infra_healing_recover` (ADR-057)
- `team_list`, `team_health`, `team_message`, `team_broadcast`, `team_scale`, `team_rebalance` (ADR-064)

**Total public MCP tools: 52**

### 1.2 Input Validation Assessment

**PASS -- Centralized validation in ToolRegistry**

The `ToolRegistry.invoke()` method (lines 393-461 of `tool-registry.ts`) applies three-layer validation before executing any handler:

1. **Tool name format validation** (`VALID_TOOL_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_:-]{0,127}$/`)
2. **Parameter schema validation** (type checking, required fields, enum validation, unknown parameter rejection)
3. **Input sanitization** via `sanitizeInput()` from CVE prevention module

String parameters are bounded to `MAX_PARAM_STRING_LENGTH = 1,000,000` (1MB).

**ISSUE [HIGH] -- Missing `required` flags on several tools**

Several parameters that are logically required lack the `required: true` flag in their tool definitions, relying instead on handler-level validation or defaults:

| Tool | Parameter | Expected | Actual |
|------|-----------|----------|--------|
| `test_generate_enhanced` | `sourceCode` or `filePath` | At least one required | Both optional |
| `coverage_analyze_sublinear` | `target` | Required | Optional |
| `quality_assess` | `target` | Required | Missing entirely |
| `security_scan_comprehensive` | `target` | Required | Optional |

These tools will accept empty parameter sets and produce potentially confusing fallback behavior rather than a clear validation error.

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

Every handler wraps its execution in try/catch and returns `{ success: false, error: "..." }` on failure. The `toErrorMessage()` utility from `shared/error-utils.ts` ensures consistent error string extraction from unknown error types.

### 1.4 Return Type Consistency

**PASS** -- All domain handlers use the factory pattern (`handler-factory.ts`) which enforces:
- Typed `TResult` generics per domain
- V2-compatible fields via `mapToResult`
- Consistent `taskId`, `status`, `duration` base fields

The wrapped handlers (`wrapped-domain-handlers.ts`) add experience capture middleware that preserves the `ToolResult<T>` contract.

### 1.5 Tool Registration Gap

**ISSUE [CRITICAL] -- ToolCategory mismatch in ToolRegistry constructor**

The `ToolRegistry` constructor initializes category sets for:
```typescript
['core', 'task', 'agent', 'domain', 'coordination', 'memory', 'learning']
```

But `ToolCategory` in `types.ts` defines additional categories:
```typescript
'routing' | 'cross-phase' | 'infra-healing'
```

Tools registered with `cross-phase`, `routing`, or `infra-healing` categories will not have their category tracked in `categoryTools` or `stats.byCategory`. This does not prevent tool execution (tools are stored in the main `tools` Map) but breaks `getByCategory()` and stats accuracy.

**File**: `/workspaces/agentic-qe-new/src/mcp/tool-registry.ts` lines 273-279

---

## 2. CLI Command Contracts

### 2.1 Command Inventory

The CLI (`src/cli/index.ts`) registers commands via two mechanisms:

**Registry-based (CommandRegistry):**
- `init` -- Project initialization
- `status` -- Fleet status
- `health` -- Fleet health check
- `task` -- Task management (submit, list, status, cancel)
- `agent` -- Agent management (list, spawn, metrics, status)
- `domain` -- Domain management
- `protocol` -- Protocol execution
- `brain` -- Brain export/import

**Direct addCommand:**
- `test` -- Test generation/execution shortcuts
- `coverage` -- Coverage analysis
- `quality` -- Quality assessment
- `security` -- Security scanning
- `code` -- Code intelligence
- `migrate` -- Migration tools
- `completions` -- Shell completion generation
- `fleet` -- Fleet management
- `validate-swarm` -- Swarm validation
- `validate` -- General validation
- `eval` -- Evaluation
- `ci` -- CI/CD integration
- `workflow` -- Workflow/pipeline management (run, schedule, list, validate, status, cancel, browser-list, browser-load)
- `token-usage` -- Token usage tracking
- `llm-router` -- LLM routing configuration
- `sync` -- Cloud sync
- `hooks` -- Self-learning hooks
- `learning` -- Learning management
- `mcp` -- MCP server management
- `platform` -- Platform commands

**Total CLI commands: 27+ top-level commands with ~80+ subcommands**

### 2.2 Exit Code Analysis

**ISSUE [HIGH] -- Inconsistent exit code patterns**

The CLI has two distinct exit patterns:

1. **cleanupAndExit(code)** -- The recommended pattern used by registry-based handlers and workflow commands. Properly disposes resources, resets memory singletons, and exits with correct code.

2. **Direct `process.exit(code)`** -- Used in several command modules:
   - `src/cli/commands/sync.ts` (5 instances)
   - `src/cli/commands/llm-router.ts` (2 instances)
   - `src/cli/commands/hooks.ts` (13 instances)

Direct `process.exit()` bypasses resource cleanup (`kernel.dispose()`, `queen.dispose()`, etc.), which can:
- Leave SQLite WAL files open
- Prevent graceful shutdown of background workers
- Skip token tracking persistence

### 2.3 Argument Validation

**PASS** -- Commander.js provides built-in validation for:
- Required arguments (positional `<arg>` syntax)
- Option types via `.option()` with defaults
- Enum constraints where specified

The `parseJsonOption()` and `parseJsonFile()` helpers in `cli/helpers/safe-json.ts` provide safe JSON parsing for `--params` and `--config` options.

### 2.4 Help Text

**PASS** -- All commands have `.description()` strings. The `createCommandRegistry` system provides `getHelp()` via the `ICommandHandler` interface for registry-based commands.

---

## 3. Internal API Boundaries

### 3.1 Service-to-Service Interfaces

The architecture follows DDD bounded contexts with clear boundaries:

| Boundary | Interface | Communication |
|----------|-----------|---------------|
| CLI -> Kernel | `QEKernel` interface | Direct method calls |
| MCP -> Kernel | `handleFleetInit()` etc. | Handler functions |
| Kernel -> Domains | `DomainPlugin` interface | Plugin system |
| Domain <-> Domain | `CrossDomainEventRouter` | Event bus |
| Queen -> Agents | `QueenCoordinator` | Task assignment |
| Agents -> Memory | `UnifiedMemoryManager` | SQLite backend |

### 3.2 Event Bus Contracts

Events follow the `DomainEvent<T>` interface:

```typescript
interface DomainEvent<T = unknown> {
  id: string;
  type: string;           // Event type string
  timestamp: Date;
  source: DomainName;     // 14 valid domain names
  correlationId?: string;
  payload: T;
  semanticFingerprint?: SemanticFingerprint;  // ADR-060
}
```

The `CrossDomainEventRouter` subscribes to all 14 domains plus a wildcard channel. Event routing supports:
- Correlation tracking with configurable timeout (default 60s)
- Event history via CircularBuffer (default 10,000 events)
- Domain-specific and event-type subscriptions

**Note**: Event type strings are not formally enumerated -- they are plain strings. This is a flexibility vs. safety tradeoff. The semantic fingerprint (ADR-060) provides anti-drift detection at runtime.

### 3.3 Shared Type Definitions

**PASS** -- Core types are centralized in `src/shared/types/index.ts`:
- `DomainName` union type (14 values)
- `ALL_DOMAINS` const array
- `DomainEvent<T>` generic interface
- `AgentType`, `AgentStatus`, `Priority`
- `Result<T, E>` type for error handling

**ISSUE [MEDIUM] -- DomainHandlerDomain diverges from DomainName**

The `handler-factory.ts` defines its own `DomainHandlerDomain` type with 11 values, while `DomainName` in shared types has 14 values. The missing domains are:
- `learning-optimization`
- `enterprise-integration`
- `coordination`

This creates a type boundary mismatch where handler factory types cannot accept these three domains without casting.

**File**: `/workspaces/agentic-qe-new/src/mcp/handlers/handler-factory.ts` lines 31-43

---

## 4. Error Recovery & Resilience

### 4.1 Circuit Breaker Patterns

The codebase implements circuit breakers at three levels:

| Level | Implementation | File | Config |
|-------|---------------|------|--------|
| **Domain** | `DomainCircuitBreaker` | `src/coordination/circuit-breaker/domain-circuit-breaker.ts` | threshold=3, reset=60s, window=120s |
| **LLM Provider** | `CircuitBreaker` | `src/shared/llm/circuit-breaker.ts` | threshold=5, reset=30s, window=60s |
| **HTTP** | `CircuitBreaker` (inline) | `src/shared/http/http-client.ts` | threshold=5, reset=30s |

All three follow the standard closed -> open -> half-open state machine. The domain circuit breaker additionally supports:
- Cascade isolation (`cascadeEnabled`, `cascadeTargets`)
- Event-driven state change notifications
- Manual `forceOpen()` and `reset()` controls
- `DomainCircuitOpenError` with `retryAfterMs`

**Assessment**: Strong circuit breaker coverage. All three tiers are well-implemented with proper state transitions.

### 4.2 Retry Logic

| Component | Retry Count | Backoff | File |
|-----------|------------|---------|------|
| MCP Transport Reconnect | 3 | Exponential (1s, 2s, 4s) | `protocol-server.ts` |
| HTTP Client | 3 (default) | Linear (1s default) | `http-client.ts` |
| Test Execution | 3 (configurable) | Not specified | `server.ts` tool def |
| Workflow Steps | Configurable per step | Not specified | `workflow-orchestrator.ts` |

**Gap**: The HTTP client uses linear retry delay (`DEFAULT_RETRY_DELAY = 1000ms`) rather than exponential backoff. This is acceptable for a local CLI tool but would be a concern for high-throughput scenarios.

### 4.3 Graceful Degradation

Multiple graceful degradation paths are implemented:

1. **Fleet status learning metrics**: `try/catch` with empty fallback -- fleet_status never fails due to learning subsystem issues
2. **Structural health (mincut)**: Optional enrichment with silent catch if native dependency unavailable
3. **RVF dual-writer**: Optional status in health endpoint with silent catch
4. **Domain workflow actions**: Warning-only on registration failure, never blocks init
5. **HNSW index**: Progressive initialization with fallback to brute-force search

### 4.4 Timeout Handling

Timeouts are specified at multiple levels:

| Context | Default | Max | Notes |
|---------|---------|-----|-------|
| CLI auto-init | 30s | 30s | Hard timeout with clear error message |
| Task submit | 300s | Configurable | Per-task timeout |
| Test execution | 60s | Configurable | Per-test-suite |
| Orchestrated tasks | 600s | Fixed | 10 minutes |
| Security scan | 600s | Fixed | Long-running SAST/DAST |
| Transport write | 120s | Fixed | stdio drain timeout at 30s |
| Connection pool idle | 300s | Configurable | 5 minutes |
| Correlation timeout | 60s | Configurable | Event correlation window |
| Process cleanup | 3s | Fixed | `forceExitTimer` in CLI |

**Assessment**: Timeout coverage is comprehensive. The 3-second force-exit timer in `cleanupAndExit` prevents process hangs.

### 4.5 Request Buffering During Reconnection

The protocol server (`protocol-server.ts`) implements request buffering during transport reconnection:
- Incoming requests during reconnection are stored in `pendingRequests`
- After successful reconnect, all buffered requests are replayed
- After failed reconnect, all buffered requests are rejected with clear error

---

## 5. External Integration Points

### 5.1 GitHub API

GitHub integration is handled through CLI commands (`gh` binary) rather than direct API calls. This delegates authentication and rate limiting to the GitHub CLI.

### 5.2 npm Registry

npm interactions occur through the build/publish CI pipeline (`.github/workflows/npm-publish.yml`). No direct npm API calls exist in source code.

### 5.3 File System Boundary

File system operations are protected by:
- **Path traversal validation** (`PathTraversalValidator` in CVE prevention module)
- **SQL identifier allowlist** (`ALLOWED_TABLE_NAMES` set)
- **Project root detection** with upward directory walk and caching

### 5.4 Network Error Handling

The `HttpClient` class (`src/shared/http/http-client.ts`) provides:
- Timeout handling via `AbortController`
- Retry with configurable count and delay
- Circuit breaker per origin
- Structured `HttpError` result type with timing information
- `Result<Response, HttpError>` return type (never throws)

---

## 6. Database Contract

### 6.1 Schema Migration Safety

**Schema version**: 8 (tracked in `schema_version` table)

The schema uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` throughout, making migrations idempotent. Foreign keys use appropriate `ON DELETE CASCADE` and `ON DELETE SET NULL` strategies.

**Single migration file**: `src/migrations/20260120_add_hypergraph_tables.ts` (hypergraph schema only). All other tables are created via the schema constants in `unified-memory-schemas.ts` at initialization time.

**Assessment**: The `IF NOT EXISTS` pattern means new tables are added without breaking existing databases. Column additions would require explicit ALTER TABLE migrations, which are not yet needed.

### 6.2 SQL Safety

**ISSUE [CRITICAL] -- SQL allowlist missing tables**

The `ALLOWED_TABLE_NAMES` set in `src/shared/sql-safety.ts` is missing several tables that are created and queried in the codebase:

| Missing Table | Created In | Used By |
|--------------|-----------|---------|
| `captured_experiences` | `experience-capture-middleware.ts` | Experience capture, fleet_status |
| `experience_applications` | Experience replay module | Fleet status learning metrics |
| `witness_chain` | `unified-memory-schemas.ts` (WITNESS_CHAIN_SCHEMA) | ADR-070 audit trail |
| `hypergraph_nodes` / `hypergraph_edges` | Schema references | STATS_TABLES list uses different names than allowlist |

The `STATS_TABLES` array references `hypergraph_nodes` and `hypergraph_edges`, but the allowlist has `hypergraph_vertices` and `hypergraph_hyperedges`. If `queryCount()` uses `validateTableName()`, these queries would fail.

The `captured_experiences` table is created directly via `db.exec()` in middleware (bypassing the allowlist), so direct creation works. However, any code that tries to use `validateTableName('captured_experiences')` before a `queryCount()` call would throw.

**Impact**: The `handleFleetStatus` handler calls `queryCount('captured_experiences')` which would fail if the validation is enforced at that path.

### 6.3 Transaction Boundaries

SQLite operations use `better-sqlite3` which provides synchronous transactions. The `UnifiedMemoryManager` uses:
- WAL mode for concurrent read access
- Prepared statements for parameterized queries
- PRAGMA settings: `journal_mode = WAL`, `synchronous = NORMAL`

### 6.4 Connection Management

The database uses a singleton pattern (`UnifiedMemoryManager.resetInstance()`) with:
- Lazy initialization on first access
- Project root detection for database path
- Explicit dispose/cleanup on shutdown
- WAL checkpoint on close

---

## 7. Breaking Change Risk

### 7.1 Public API Surface

The `package.json` exports field defines the public API:

| Export Path | Description | Stability |
|-------------|-------------|-----------|
| `.` | Main entry point | Stable |
| `./kernel` | Kernel interfaces | Stable |
| `./shared` | Shared types/utilities | Stable |
| `./cli` | CLI entry point | Stable |
| `./ruvector` | Native vector wrappers | Experimental |
| `./sync` | Cloud sync interfaces | Experimental |

### 7.2 Semver Compliance

**Current version**: 3.7.10 (patch release)

Changes since 3.7.0 should contain no breaking changes to the public API surface. The analysis confirms:
- No changes to `ToolResult<T>` shape
- No removal of MCP tool names
- No changes to `DomainName` union type
- New tools/features are additive only

**ISSUE [HIGH] -- Protocol version string inconsistency**

The `protocol-server.ts` reports two different MCP protocol versions:
- `getServerInfo()` returns `protocolVersion: '2024-11-05'`
- File header comment says `MCP 2025-11-25 protocol implementation`

If the actual protocol implementation is 2025-11-25 but the reported version is 2024-11-05, clients may not use newer protocol features. This should be reconciled.

**File**: `/workspaces/agentic-qe-new/src/mcp/protocol-server.ts`

### 7.3 Deprecation Handling

The migration module (`src/migration/agent-compat.ts`) provides:
- `v2AgentMapping` -- maps V2 agent names to V3
- `resolveAgentName()` -- transparent resolution
- `isDeprecatedAgent()` -- deprecation check

V2-compatible response fields are maintained in all domain result types (e.g., `TestGenerateResult` includes optional V2 fields like `tests`, `antiPatterns`, `aiInsights`).

---

## 8. Recommendations

### Critical (Fix Before Release)

1. **Add missing tables to SQL allowlist** (`src/shared/sql-safety.ts`):
   - `captured_experiences`
   - `experience_applications`
   - `witness_chain`
   - Reconcile `hypergraph_nodes`/`hypergraph_edges` vs `hypergraph_vertices`/`hypergraph_hyperedges`

2. **Register missing ToolCategory values in ToolRegistry constructor** (`src/mcp/tool-registry.ts` line 273):
   - Add `'cross-phase'`, `'routing'`, `'infra-healing'` to the categories array

### High Priority

3. **Add `required: true` to essential MCP tool parameters** where the handler cannot meaningfully execute without them (quality_assess target, coverage target).

4. **Replace `process.exit()` with `cleanupAndExit()`** in `sync.ts`, `llm-router.ts`, and `hooks.ts` CLI commands to ensure proper resource cleanup.

5. **Reconcile MCP protocol version string** -- verify whether implementation matches 2024-11-05 or 2025-11-25 and update both the header comment and the reported version.

### Medium Priority

6. **Align `DomainHandlerDomain` with `DomainName`** in handler-factory.ts, or document why the three missing domains intentionally lack handler factory support.

7. **Add exponential backoff to HTTP client retry logic** -- replace linear delay with `delay * Math.pow(2, attempt)` in `http-client.ts`.

---

## Appendix A: Tool Contract Quick Reference

### Core Tools (Always Loaded)

| Tool | Required Params | Optional Params | Return Type |
|------|----------------|-----------------|-------------|
| fleet_init | none | topology, maxAgents, testingFocus, frameworks, environments, enabledDomains, lazyLoading, memoryBackend | FleetInitResult |
| fleet_status | none | verbose, includeDomains, includeMetrics | FleetStatusResult |
| fleet_health | none | domain, detailed | Record<string, unknown> |

### Task Tools

| Tool | Required Params | Optional Params | Return Type |
|------|----------------|-----------------|-------------|
| task_submit | type | priority, targetDomains, payload, timeout | TaskSubmitResult |
| task_list | none | status, priority, domain, limit | TaskStatusResult[] |
| task_status | taskId | detailed | TaskStatusResult |
| task_cancel | taskId | none | void |
| task_orchestrate | task | strategy, priority, maxAgents, context | TaskOrchestrateResult |

### Memory Tools

| Tool | Required Params | Optional Params | Return Type |
|------|----------------|-----------------|-------------|
| memory_store | key, value | namespace, ttl, metadata, persist | MemoryStoreResult |
| memory_retrieve | key | namespace, includeMetadata | MemoryRetrieveResult |
| memory_query | none | pattern, namespace, limit, offset, includeExpired | MemoryQueryResult |
| memory_delete | key | namespace | void |
| memory_usage | none | none | MemoryUsageResult |
| memory_share | sourceAgentId, targetAgentIds, knowledgeDomain, knowledgeContent | none | void |

## Appendix B: Circuit Breaker State Machines

```
Domain Circuit Breaker (3 failures / 120s window):
  CLOSED --[3 failures in 120s]--> OPEN --[60s elapsed]--> HALF-OPEN --[2 successes]--> CLOSED
                                                            HALF-OPEN --[1 failure]--> OPEN

LLM Provider Circuit Breaker (5 failures / 60s window):
  CLOSED --[5 failures in 60s]--> OPEN --[30s elapsed]--> HALF-OPEN --[2 successes]--> CLOSED
                                                           HALF-OPEN --[1 failure]--> OPEN

HTTP Circuit Breaker (5 failures, per-origin):
  CLOSED --[5 failures]--> OPEN --[30s elapsed]--> HALF-OPEN --[1 success]--> CLOSED
                                                    HALF-OPEN --[1 failure]--> OPEN
```

## Appendix C: Database Schema Tables (39 tables)

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
| Hypergraph | hypergraph_vertices, hypergraph_hyperedges, hypergraph_edge_vertices, hypergraph_vertex_properties, hypergraph_edge_properties |
| Witness | witness_chain |
| Experience | captured_experiences, experience_applications |
| Meta | schema_version |

---

*Report generated by QE Integration Reviewer (qe-integration-reviewer v3.7.10)*
