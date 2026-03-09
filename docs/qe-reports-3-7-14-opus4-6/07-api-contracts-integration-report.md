# API Contracts & Integration Report -- AQE v3.7.14

**Agent**: QE Integration Reviewer (contract-testing domain)
**Model**: Claude Opus 4.6
**Date**: 2026-03-09
**Scope**: API contracts, MCP protocol compliance, integration patterns, error recovery
**Baseline**: v3.7.10 Integration Report

---

## Executive Summary

AQE v3.7.14 demonstrates a **mature and well-structured MCP protocol implementation** with strong security foundations (SEC-001 input validation on all tool invocations) and comprehensive circuit breaker patterns at three tiers (LLM provider, HTTP client, DDD domain). However, the analysis reveals **persistent issues carried forward from v3.7.10** that have not been resolved, alongside new scaling concerns.

**Key Findings**:
- **P0-1 (SQL Allowlist)**: NOT RESOLVED -- gap has grown from 3 to 11 missing tables
- **P0-2 (ToolCategory)**: RESOLVED -- all 10 categories now initialized in constructor
- **P0-3 (Missing required)**: PARTIALLY RESOLVED -- 24 params correctly marked, but ~8 params in protocol-server handlers still missing `required: true`
- **P0-4 (process.exit proliferation)**: REGRESSED -- from 20 to 98 calls in src/
- **P0-5 (Protocol version mismatch)**: RESOLVED -- consistent `2025-11-25` everywhere, server version passed from package.json

**Overall Risk**: MEDIUM-HIGH (SQL allowlist gap is the most significant contract violation)

---

## v3.7.10 vs v3.7.14 Comparison

| Finding (v3.7.10) | Severity | v3.7.14 Status | Detail |
|---|---|---|---|
| SQL allowlist gap (3 tables) | CRITICAL | **REGRESSED** (11 tables) | New tables added without allowlist updates |
| ToolCategory mismatch (7/10) | HIGH | **RESOLVED** | All 10 categories initialized |
| Missing `required: true` on MCP params | HIGH | **PARTIALLY RESOLVED** | 24 correct, ~8 still missing |
| 20x process.exit() bypassing cleanup | HIGH | **REGRESSED** (98 calls) | New CLI commands added without refactoring |
| Protocol version string mismatch | MEDIUM | **RESOLVED** | Consistent `2025-11-25` across codebase |
| SEC-001 validation on all tools | STRENGTH | **MAINTAINED** | Still applied on every invocation |
| Three-tier circuit breakers | STRENGTH | **ENHANCED** | Criticality-based presets added (P0/P1/P2) |
| Consistent ToolResult<T> | STRENGTH | **MAINTAINED** | All handlers return ToolResult<T> |
| Idempotent migrations | STRENGTH | **MAINTAINED** | CREATE TABLE IF NOT EXISTS everywhere |

---

## 1. SQL Allowlist Analysis (P0 -- CRITICAL)

### Finding: 11 Tables Missing from ALLOWED_TABLE_NAMES

The `ALLOWED_TABLE_NAMES` set in `src/shared/sql-safety.ts` contains 37 entries. However, 48 unique table names appear in `CREATE TABLE IF NOT EXISTS` statements across the codebase. **11 tables are created but absent from the allowlist.**

**Allowlisted tables (37)**:
`schema_version`, `kv_store`, `vectors`, `rl_q_values`, `goap_goals`, `goap_actions`, `goap_plans`, `goap_plan_signatures`, `concept_nodes`, `concept_edges`, `dream_cycles`, `dream_insights`, `qe_patterns`, `qe_pattern_embeddings`, `qe_pattern_usage`, `qe_trajectories`, `embeddings`, `execution_results`, `executed_steps`, `mincut_snapshots`, `mincut_history`, `mincut_weak_vertices`, `mincut_alerts`, `mincut_healing_actions`, `mincut_observations`, `sona_patterns`, `test_outcomes`, `routing_outcomes`, `coverage_sessions`, `patterns`, `hypergraph_nodes`, `hypergraph_edges`, `hypergraph_vertices` (alias), `hypergraph_hyperedges` (alias), `hypergraph_edge_vertices` (alias), `hypergraph_vertex_properties` (alias), `hypergraph_edge_properties` (alias), `captured_experiences`, `experience_applications`, `witness_chain`

**Missing from allowlist (11)**:

| Table | Created In | Risk |
|---|---|---|
| `witness_chain_archive` | `src/audit/witness-chain.ts` | HIGH -- audit trail data |
| `trajectories` | `src/adapters/claude-flow/trajectory-bridge.ts` | MEDIUM |
| `trajectory_steps` | `src/integrations/agentic-flow/reasoning-bank/trajectory-tracker.ts`, `brain-table-ddl.ts` | MEDIUM |
| `learning_daily_snapshots` | `src/learning/metrics-tracker.ts` | MEDIUM |
| `metrics_outcomes` | `src/integrations/agentic-flow/metrics/metrics-tracker.ts` | MEDIUM |
| `experience_consolidation_log` | `src/integrations/agentic-flow/reasoning-bank/experience-replay.ts` | MEDIUM |
| `pattern_evolution_events` | `src/integrations/agentic-flow/reasoning-bank/pattern-evolution.ts`, `brain-table-ddl.ts` | MEDIUM |
| `pattern_relationships` | `src/integrations/agentic-flow/reasoning-bank/pattern-evolution.ts`, `brain-table-ddl.ts` | MEDIUM |
| `pattern_versions` | `src/integrations/agentic-flow/reasoning-bank/pattern-evolution.ts`, `brain-table-ddl.ts` | MEDIUM |
| `qe_pattern_reuse` | `src/learning/sqlite-persistence.ts` | MEDIUM |
| `experiences` | `src/init/migration/data-migrator.ts` | LOW -- migration only |

**Impact**: Any code path that calls `validateTableName()` on these 11 tables will throw, causing runtime failures. Tables that bypass the validator (direct SQL interpolation) are not affected but represent a defense-in-depth gap.

**Secondary Allowlist**: `src/kernel/unified-memory.ts:709` has a separate `ALLOWED_TABLES` array (13 entries) scoped to the `queryCount()` method. This is independent but also incomplete -- it lacks tables like `sona_patterns`, `witness_chain`, and all 11 missing tables.

**Recommendation**: Add all 11 tables to `ALLOWED_TABLE_NAMES` in `src/shared/sql-safety.ts`. Audit `queryCount()` allowlist separately if those tables need count operations.

---

## 2. ToolCategory Registration Analysis (RESOLVED)

### Finding: All 10 Categories Now Initialized

**v3.7.10**: Only 7 of 10 `ToolCategory` values were initialized in the `ToolRegistry` constructor, missing `routing`, `cross-phase`, and `infra-healing`.

**v3.7.14**: The constructor at `src/mcp/tool-registry.ts:273-276` now initializes all 10 categories:

```
'core', 'task', 'agent', 'domain', 'coordination', 'memory', 'learning',
'routing', 'cross-phase', 'infra-healing'
```

This matches the `ToolCategory` type definition at `src/mcp/types.ts:40-50` exactly. Protocol-server.ts also registers tools into all three previously-missing categories:
- `routing`: `model_route`, `routing_metrics`
- `infra-healing`: `infra_healing_status`, `infra_healing_feed_output`, `infra_healing_recover`
- `cross-phase`: No tools registered yet (defined for QCSD future use)

**Status**: RESOLVED.

---

## 3. MCP Tool Definitions & Parameter Contracts

### 3.1 Tool Inventory

| Category | Protocol-Server (hardcoded) | QE Bridge (additional) | Total |
|---|---|---|---|
| core | 4 (fleet_init, fleet_status, fleet_health, aqe_health) | 0 | 4 |
| task | 5 (task_submit, task_list, task_status, task_cancel, task_orchestrate) | 0 | 5 |
| agent | 10 (agent_list/spawn/metrics/status + team_list/health/message/broadcast/scale/rebalance) | 0 | 10 |
| domain | 11 (test_generate_enhanced .. chaos_test) | 21 (via QE bridge) | 32 |
| memory | 6 (store/retrieve/query/delete/usage/share) | 0 | 6 |
| routing | 2 (model_route, routing_metrics) | 0 | 2 |
| infra-healing | 3 (status/feed_output/recover) | 0 | 3 |
| coordination | 0 | 0 | 0 |
| learning | 0 | 0 (learning tools go through domain bridge) | 0 |
| cross-phase | 0 | 0 | 0 |
| **TOTAL** | **42** | **21** | **63** |

### 3.2 Missing `required: true` Analysis (PARTIALLY RESOLVED)

**Correctly marked required (24 params in protocol-server.ts)**:
- `task_submit.type`, `task_status.taskId`, `task_cancel.taskId`, `task_orchestrate.task`
- `agent_spawn.domain`, `agent_status.agentId`
- `team_health.domain`, `team_message.from/to/type/payload`, `team_broadcast.domain/type/payload`, `team_scale.domain/targetSize`
- `memory_store.key/value`, `memory_retrieve.key`, `memory_delete.key`, `memory_share.sourceAgentId/targetAgentIds/knowledgeDomain`
- `model_route.task`

**Missing `required: true` in protocol-server.ts (should be required based on QE schemas or handler contracts)**:

| Tool | Parameter | QE Schema Requires? | Handler Expects? |
|---|---|---|---|
| `chaos_test` | `faultType` | Yes (`CHAOS_INJECT_SCHEMA`) | Yes |
| `chaos_test` | `target` | Yes (`CHAOS_INJECT_SCHEMA`) | Yes |
| `infra_healing_feed_output` | `output` | N/A (hardcoded only) | Yes (typed as `{ output: string }`) |
| `test_generate_enhanced` | `sourceCode` | Yes (`TEST_GENERATE_SCHEMA: required: ['sourceFiles']`) | Functionally yes |
| `defect_predict` | `target` | No explicit required | Functionally yes |
| `code_index` | `target` | No explicit required | Functionally yes |
| `requirements_validate` | `requirementsPath` | Underlying tool requires `requirements` array | Functionally yes |

**Additionally, QE bridge tools correctly pass `required` through**: The `schemaToParameters()` function in `src/mcp/qe-tool-bridge.ts:56-64` propagates the `required` set from each tool's JSON schema to the `required` field on parameters. This means the 21 bridged tools have correct `required` annotations.

**Impact**: Parameters that are functionally required but not marked as such will bypass `validateParamValue()` in `tool-registry.ts:66-71`, allowing undefined values to reach handlers. This can cause runtime errors instead of clean validation errors.

**Recommendation**: Add `required: true` to the 7 parameters listed above.

### 3.3 Tools Without Any `required` Array (QE Schemas)

Several QE tool schemas define all parameters as optional. This is by design for some (e.g., coverage analysis can scan the whole project), but others should have required fields:

| Schema | Has `required` Array | Assessment |
|---|---|---|
| `COVERAGE_ANALYZE_SCHEMA` | No | Acceptable -- default behavior scans project root |
| `COVERAGE_GAPS_SCHEMA` | No | Acceptable -- same reasoning |
| `CONTRACT_VALIDATE_SCHEMA` | No | Questionable -- contractPath should arguably be required |
| `SECURITY_SCAN_SCHEMA` | No | Acceptable -- defaults to SAST on current project |
| `DEFECT_PREDICT_SCHEMA` | No | Questionable -- target path should be required |
| `QUALITY_EVALUATE_SCHEMA` | No | Acceptable -- evaluates full project |
| `TEST_EXECUTE_SCHEMA` | No | Acceptable -- runs all tests by default |
| `MINCUT schemas` (3 tools) | No | Acceptable -- operate on shared graph state |
| `LOAD_TEST schema` | No | Questionable -- needs target info |
| `TEST_SCHEDULE schema` | No | Acceptable |
| `BROWSER_WORKFLOW schema` | No | Questionable -- needs workflow identifier |

---

## 4. Protocol Version Compliance (RESOLVED)

### MCP Protocol Version: `2025-11-25`

All protocol version references are consistent:

| Location | Value | Status |
|---|---|---|
| `protocol-server.ts:291` (getServerInfo) | `'2025-11-25'` | Correct |
| `protocol-server.ts:397` (handleInitialize return) | `'2025-11-25'` | Correct |
| `protocol-server.ts:1` (header comment) | `MCP 2025-11-25` | Correct |

### Server Version: Partially Resolved

| Location | Value | Status |
|---|---|---|
| `entry.ts:29` | Reads from `package.json` (3.7.14) | Correct |
| `entry.ts:171-173` | Passes `version` to `quickStart()` | Correct |
| `protocol-server.ts:147` | Default `'3.0.0'` if no config | Stale default |

**Residual Issue**: The default `version: config.version ?? '3.0.0'` at `protocol-server.ts:147` is stale. While `entry.ts` correctly passes the real version, any code constructing `MCPProtocolServer` without config will report `3.0.0`. This is a minor consistency issue since the entry point always passes the correct version.

**Recommendation**: Update the default to read from `package.json` or remove the default to force explicit version passing.

---

## 5. process.exit() Analysis (REGRESSED)

### Finding: 98 Calls in src/ (Up From ~20 in v3.7.10)

**Distribution by file**:

| File | Count | Category | Appropriate? |
|---|---|---|---|
| `cli/commands/learning.ts` | 36 | CLI command exits | Mostly acceptable |
| `cli/commands/hooks.ts` | 25 | CLI command exits | Mostly acceptable |
| `cli/commands/sync.ts` | 5 | CLI command exits | Acceptable |
| `mcp/entry.ts` | 3 | Signal handlers + fatal | Acceptable |
| `performance/run-gates.ts` | 3 | CLI tool | Acceptable |
| `cli/commands/platform.ts` | 3 | CLI command | Acceptable |
| `cli/commands/mcp.ts` | 3 | CLI command | Acceptable |
| `cli/commands/llm-router.ts` | 3 | CLI command | Acceptable |
| `kernel/unified-persistence.ts` | 2 | Signal handlers | Acceptable |
| `kernel/unified-memory.ts` | 2 | Signal handlers | Acceptable |
| `init/phases/10-workers.ts` | 2 | Daemon management | Acceptable |
| `cli/index.ts` | 2 | CLI main exit | Acceptable |
| `cli/commands/init.ts` | 2 | CLI command | Acceptable |
| `cli/commands/eval.ts` | 2 | CLI command | Acceptable |
| `benchmarks/run-benchmarks.ts` | 2 | CLI tool | Acceptable |
| `mcp/protocol-server.ts` | 1 | Shutdown handler | PROBLEMATIC |
| `integrations/browser/web-content-fetcher.ts` | 1 | Error handler | PROBLEMATIC |
| `cli/commands/token-usage.ts` | 1 | CLI command | Acceptable |

**Assessment**: The raw count increased from ~20 to 98, but this is largely due to new CLI commands (`learning.ts` alone has 36). CLI commands using `process.exit(0)` / `process.exit(1)` after completion is standard Node.js CLI practice. The problematic cases are:

1. **`protocol-server.ts:408`**: `process.exit(0)` in `handleShutdown()` runs inside a `setTimeout(100)` -- bypasses connection pool cleanup
2. **`web-content-fetcher.ts:495`**: `process.exit(1)` in error handler -- should throw instead

**Recommendation**: Refactor `protocol-server.ts` shutdown to use the existing `stop()` method which properly calls `shutdownConnectionPool()`. The CLI command exits are idiomatic and acceptable.

---

## 6. SEC-001 Security Validation (MAINTAINED)

### Architecture Review

SEC-001 input validation is enforced at two layers:

**Layer 1: ToolRegistry.invoke()** (`src/mcp/tool-registry.ts:394-462`)
1. `validateToolName()` -- regex check against `/^[a-zA-Z][a-zA-Z0-9_:-]{0,127}$/`
2. `validateParams()` -- checks required fields, type matching, enum validation, unknown param rejection
3. `sanitizeParams()` -- recursively sanitizes all string values via `sanitizeInput()`

**Layer 2: MCPToolBase.validate()** (`src/mcp/tools/base.ts:283-316`)
1. Required field checking
2. Type validation with min/max constraints
3. Enum validation

**Layer 3: CVE Prevention** (`src/mcp/security/cve-prevention.ts`)
- Path traversal prevention
- ReDoS prevention via regex safety validation
- Timing-safe comparison for auth
- Command injection prevention via `validateCommand()`
- Prototype pollution prevention (`src/shared/safe-json.ts`)

**Coverage**: All 63 MCP tools pass through Layer 1 validation. The 32 QE tools also pass through Layer 2. The security facade provides defense-in-depth.

**Assessment**: STRONG. No gaps identified.

---

## 7. Error Recovery Patterns

### 7.1 Circuit Breaker Architecture (THREE-TIER)

| Tier | Location | Purpose | Config |
|---|---|---|---|
| **LLM Provider** | `src/shared/llm/circuit-breaker.ts` | Protect against LLM API failures | threshold=5, reset=30s, window=60s |
| **HTTP Client** | `src/shared/http/http-client.ts` | Protect against upstream HTTP failures | threshold=5, reset=30s, per-origin |
| **DDD Domain** | `src/coordination/circuit-breaker/domain-circuit-breaker.ts` | Isolate failing QE domains from fleet | threshold=3, reset=60s, window=120s |

All three implement the standard closed -> open -> half-open state machine with:
- Sliding failure window
- Configurable success threshold for half-open -> closed
- Automatic time-based open -> half-open transition
- Event emission for state changes

**Enhancement in v3.7.14**: The `DomainBreakerRegistry` (`src/coordination/circuit-breaker/breaker-registry.ts`) adds criticality-based presets:
- **Critical (P0)**: threshold=2, reset=30s, window=60s -- for core QE domains
- **Standard (P1)**: threshold=3, reset=60s, window=120s -- for important domains
- **Lenient (P2)**: threshold=5, reset=120s, window=300s -- for auxiliary domains

Cascade support is defined in the type system (`cascadeEnabled`, `cascadeTargets`) but currently disabled for all presets.

### 7.2 Retry Patterns

Retry with backoff is implemented in:
- **HTTP Client** (`src/shared/http/http-client.ts`): 3 retries, 1s base delay
- **MCP Transport** (`src/mcp/protocol-server.ts:219-262`): Exponential backoff reconnect (1s, 2s, 4s) with request buffering and replay
- **LLM Providers** (6 providers): All support retry via `retryCount` config
- **Embedding clients**: Configurable retry with exponential backoff

**Transport Recovery Pattern** (v3.7.14 enhancement):
```
Transport error -> Buffer pending requests ->
Exponential backoff reconnect (3 attempts) ->
  Success: Replay buffered requests
  Failure: Reject all buffered requests with error
```

### 7.3 Graceful Degradation

- **Shared Memory Backend**: Falls back to in-memory store if SQLite initialization fails (`enableFallback: true`)
- **RVF Integration**: Lazy `require()` with try/catch for optional native modules
- **Infra-Healing**: Non-fatal initialization -- MCP server continues without healing if init fails
- **Fleet Auto-Init**: Non-fatal -- tools prompt user to call `fleet_init` manually if auto-init fails
- **Uncaught Exception Handler**: Logs but does NOT exit -- keeps MCP connection alive

**Assessment**: STRONG error recovery architecture with defense-in-depth.

---

## 8. API Consistency Analysis

### 8.1 Naming Conventions

**Protocol-server (42 hardcoded tools)**:
- Pattern: `snake_case` (e.g., `fleet_init`, `task_submit`, `memory_store`)
- Consistent across all 42 tools

**QE Tools (32 via bridge)**:
- Pattern: `qe/domain/action` with forward slashes (e.g., `qe/tests/generate`, `qe/coverage/analyze`)
- Consistent across all 32 tools

**Inconsistency**: Two naming conventions coexist. The protocol-server tools use `snake_case` while QE tools use `slash/namespace/action`. This is by design (the QE bridge maintains the namespaced names to avoid collision with flat names), but it creates a mixed API surface for consumers.

**Tool Aliasing**: 11 QE tools have both a flat name (protocol-server) and a namespaced name (QE bridge):
- `test_generate_enhanced` = `qe/tests/generate`
- `coverage_analyze_sublinear` = `qe/coverage/analyze`
- etc.

These aliases invoke the same handler but have different parameter schemas (the flat versions are simpler). This is documented in `src/mcp/qe-tool-bridge.ts:26-38` but could confuse consumers.

### 8.2 Response Format Consistency

All handlers return `ToolResult<T>`:
```typescript
interface ToolResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: ToolResultMetadata;
}
```

`ToolResultMetadata` consistently includes:
- `executionTime`: milliseconds
- `timestamp`: ISO 8601 string
- `requestId`: UUID v4
- `domain?`: DomainName
- `toolName?`: tool identifier
- `dataSource?`: `'real' | 'demo' | 'fallback'`

**Assessment**: Response format is highly consistent. The `dataSource` field for transparency is a notable strength -- consumers can distinguish real results from demo/fallback data.

---

## 9. Integration Contract Patterns

### 9.1 Contract Testing Infrastructure

| Component | Location | Status |
|---|---|---|
| Contract domain | `src/domains/contract-testing/` | Implemented |
| Contract validator | `src/domains/contract-testing/coordinator.ts` | Active |
| MCP tool | `qe/contracts/validate` + `contract_validate` | Registered |
| Unit tests | `tests/unit/domains/contract-testing/contract-validator.test.ts` | Present |

The contract testing domain implements:
- OpenAPI schema validation
- Breaking change detection between schema versions
- Consumer-provider contract checking
- Backward compatibility verification

### 9.2 Internal API Versioning

- **MCP Protocol**: Version `2025-11-25` is explicitly tracked
- **Schema Version**: `SCHEMA_VERSION = 8` in `unified-memory-schemas.ts` with migration tracking
- **Package Version**: Read from `package.json` at startup
- **V2 Compatibility**: Maintained through optional V2-compatible fields on result types (e.g., `TestGenerateResult` has both V3 fields and V2 optional fields)

### 9.3 Cross-Service Integration Patterns

| Pattern | Implementation | Quality |
|---|---|---|
| Event-driven | Queen coordinator publishes domain events | GOOD |
| Shared types | `src/shared/types/index.ts` with DomainName, Priority | GOOD |
| Memory namespace isolation | Domains use separate namespaces in unified DB | GOOD |
| Tool registry isolation | Each tool belongs to exactly one category/domain | GOOD |
| AG-UI streaming | EventAdapter bridges MCP to SSE for HTTP clients | GOOD |

---

## 10. Migration & Schema Patterns

### 10.1 Schema Versioning

- Current schema version: **8** (feedback loop persistence tables)
- Migration tracking via `schema_version` table with `id=1` single-row constraint
- All tables use `CREATE TABLE IF NOT EXISTS` for idempotency

### 10.2 Migration Safety

| Feature | Status |
|---|---|
| `IF NOT EXISTS` on all tables | Yes -- 100% |
| Backup before migration | Yes -- `createBackups: true` default |
| Dry run support | Yes -- `dryRun` option |
| Delete source after migration | No (disabled by default) |
| Rollback capability | Partial -- backup-based only |
| Schema version tracking | Yes -- `schema_version` table |
| Row count verification | Not enforced in code |

**Gap**: The `MigrationResult` interface has a typo: `tableseMigrated` (should be `tablesMigrated`). This is a cosmetic issue but indicates the migration code may have limited test coverage.

**Recommendation**: Add automated row count verification after migration (compare source vs destination counts).

---

## Recommendations (Prioritized)

### P0 -- Critical (Must Fix Before Release)

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | SQL allowlist missing 11 tables | Runtime crashes when `validateTableName()` is called on these tables | Add all 11 tables to `ALLOWED_TABLE_NAMES` in `src/shared/sql-safety.ts` |

### P1 -- High (Fix in Next Sprint)

| # | Issue | Impact | Fix |
|---|---|---|---|
| 2 | Missing `required: true` on 7 protocol-server params | Undefined values reach handlers causing runtime errors | Add `required: true` to `chaos_test.faultType/target`, `infra_healing_feed_output.output`, and 4 others |
| 3 | `protocol-server.ts:408` process.exit in shutdown | Bypasses connection pool and memory backend cleanup | Call `this.stop()` instead of raw `process.exit(0)` |
| 4 | Stale default version `'3.0.0'` in MCPProtocolServer constructor | Misleading version in serverInfo if instantiated without config | Read from package.json or remove default |

### P2 -- Medium (Track for Future)

| # | Issue | Impact | Fix |
|---|---|---|---|
| 5 | 11 tool aliases (flat + namespaced names) | Consumer confusion, doubled API surface | Document the aliasing or consolidate to one naming convention |
| 6 | `queryCount()` has separate incomplete allowlist | Inconsistent validation at two layers | Unify with ALLOWED_TABLE_NAMES or remove duplication |
| 7 | Circuit breaker cascade support defined but unused | False sense of capability | Remove cascade fields from config or implement cascade propagation |
| 8 | `MigrationResult.tableseMigrated` typo | Cosmetic but indicates low coverage | Fix typo, add type-level test |

### P3 -- Low (Backlog)

| # | Issue | Impact | Fix |
|---|---|---|---|
| 9 | 61 CLI process.exit() calls in learning.ts + hooks.ts | Not inherently wrong for CLI, but makes testing harder | Consider returning exit codes from command functions |
| 10 | `cross-phase` category has no tools registered | Unused category in registry | Either register planned tools or defer category creation |
| 11 | No automated consumer notification for breaking changes | Manual process for contract changes | Implement webhook/event when contract validation detects breaks |

---

## Strengths Maintained from v3.7.10

1. **SEC-001 Defense-in-Depth**: Three-layer input validation (tool registry, MCPToolBase, CVE prevention) remains robust. No bypass paths identified.

2. **Consistent ToolResult<T> Contract**: All 63 tools return the same response envelope with metadata including `dataSource` transparency.

3. **Idempotent Migrations**: 100% of table creation uses `CREATE TABLE IF NOT EXISTS`.

4. **Three-Tier Circuit Breakers**: Now enhanced with criticality-based presets (P0/P1/P2 domains).

5. **Transport Recovery**: New in v3.7.14 -- exponential backoff reconnect with request buffering preserves MCP connection stability.

6. **V2 Backward Compatibility**: Result types maintain optional V2-compatible fields without breaking V3 consumers.

---

## Integration Impact Summary

| Integration Point | Count | Breaking Changes | Risk |
|---|---|---|---|
| MCP Tools (protocol-server) | 42 | 0 | LOW |
| MCP Tools (QE bridge) | 21 | 0 | LOW |
| SQL Table Contracts | 48 | 11 missing from allowlist | HIGH |
| Circuit Breaker Config | 3 tiers | 0 | LOW |
| Protocol Version | 1 (`2025-11-25`) | 0 (resolved) | LOW |
| Schema Version | 8 | 0 | LOW |

---

## Files Analyzed

| File | Purpose |
|---|---|
| `src/shared/sql-safety.ts` | SQL allowlist and validation |
| `src/kernel/unified-memory-schemas.ts` | All table DDL definitions |
| `src/kernel/unified-memory.ts` | queryCount allowlist |
| `src/mcp/types.ts` | ToolCategory type definition |
| `src/mcp/tool-registry.ts` | Tool registration, SEC-001 validation |
| `src/mcp/protocol-server.ts` | MCP protocol implementation, 42 tools |
| `src/mcp/tools/registry.ts` | 32 QE tool instances |
| `src/mcp/tools/base.ts` | MCPToolBase validation framework |
| `src/mcp/qe-tool-bridge.ts` | Bridge for 21 additional tools |
| `src/mcp/entry.ts` | MCP server entry point |
| `src/mcp/security/cve-prevention.ts` | Security facade |
| `src/coordination/circuit-breaker/domain-circuit-breaker.ts` | Domain circuit breaker |
| `src/coordination/circuit-breaker/breaker-registry.ts` | Criticality presets |
| `src/shared/llm/circuit-breaker.ts` | LLM circuit breaker |
| `src/shared/http/http-client.ts` | HTTP circuit breaker |
| `src/kernel/unified-memory-migration.ts` | Migration framework |
| 13 additional source files | Table creation statements |
