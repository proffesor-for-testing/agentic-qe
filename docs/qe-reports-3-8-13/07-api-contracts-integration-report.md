# API Contracts & Integration Report - v3.8.13

**Date**: 2026-03-30
**Agent**: qe-integration-reviewer (Agent 07)
**Baseline**: v3.8.3 (2026-03-19)
**Scope**: MCP tool interfaces, CLI command contracts, protocol consistency, cross-service integration health

---

## Executive Summary

v3.8.13 shows good remediation of the v3.8.3 baseline findings (SQL allowlist, HTTP retry, protocol version). However, this analysis uncovered **14 new findings** (2 CRITICAL, 4 HIGH, 5 MEDIUM, 3 LOW) spanning tool contract divergence between the two MCP server implementations, pervasive unsafe type casts, EventEmitter listener leaks, and hardcoded version strings. The dual-server architecture (`server.ts` vs `protocol-server.ts`) remains the primary source of contract drift.

**Weighted Finding Score**: 2 x 3 + 4 x 2 + 5 x 1 + 3 x 0.5 = **20.5** (minimum threshold: 2.0 -- PASSED)

**Overall Score: 5.5 / 10**

---

## v3.8.3 Remediation Verification

| v3.8.3 Finding | Status | Evidence |
|---|---|---|
| SQL allowlist gap (40 tables) | **RESOLVED** | `src/shared/sql-safety.ts` now has 51 entries covering all known tables including hypergraph, feedback loop, witness chain, trajectory, and co-execution tables |
| ToolCategory mismatch (10 categories) | **RESOLVED** | `src/mcp/types.ts` L40-50 defines 10 categories; `src/mcp/tool-registry.ts` L273-276 initializes all 10 in constructor |
| Protocol version mismatch | **RESOLVED** | Unified to `2025-11-25` across `protocol-server.ts` L314, L420 (both occurrences consistent) |
| HTTP client linear retry | **RESOLVED** | `src/shared/http/http-client.ts` L325-327 uses `Math.pow(2, attempt)` exponential backoff |
| Missing `required: true` on MCP params | **PARTIALLY RESOLVED** | Many tools now have `required: true`; new gaps identified below (F-01) |
| process.exit() at 110 lines | **WORSENED** | Now at **41 occurrences** across src/ (see F-06). CLI handler framework properly uses `cleanupAndExit` but many raw `process.exit()` calls remain |
| EventEmitter listener leaks | **NOT RESOLVED** | 124 `.on()` registrations vs only 26 `.removeListener`/`.off`/`.removeAllListeners` calls. Zero `setMaxListeners()` calls in codebase (F-05) |
| learning ToolCategory unused | **RESOLVED** | `session_cache_stats` tool uses `category: 'learning'` (protocol-server.ts L1265) |
| protocol-server/server.ts divergence | **WORSENED** | Divergence has grown -- see F-02 below |
| DomainHandlerDomain type mismatch | **NOT RESOLVED** | `DomainHandlerDomain` in `handler-factory.ts` L32-43 has 11 domains while `DomainName` in `shared/types/index.ts` L32-46 has 14 domains. Missing: `learning-optimization`, `enterprise-integration`, `coordination` (F-07) |

**Remediation Score: 6/10** -- 6 of 10 fully resolved, 1 partially resolved, 2 worsened, 1 unresolved.

---

## New Findings

### CRITICAL

#### F-01: Dual MCP Server Tool Contract Divergence (CRITICAL)

**Files**:
- `/workspaces/agentic-qe/src/mcp/protocol-server.ts` (L529-1306)
- `/workspaces/agentic-qe/src/mcp/server.ts` (L80-803)

**Description**: The codebase maintains two separate MCP server implementations that expose overlapping but **non-identical** tool sets. This creates a contract split where consumers see different capabilities depending on which server they connect to.

**Tools only in `protocol-server.ts`** (accessed via stdio MCP transport):
- `aqe_health` -- health endpoint
- `model_route`, `routing_metrics`, `routing_economics` -- ADR-051 routing tools
- `infra_healing_status`, `infra_healing_feed_output`, `infra_healing_recover` -- ADR-057 healing
- `team_list`, `team_health`, `team_message`, `team_broadcast`, `team_scale`, `team_rebalance` -- ADR-064 team tools
- `session_cache_stats` -- Imp-15 session cache

**Tools only in `server.ts`** (accessed via `MCPServer` class):
- `heartbeat_status`, `heartbeat_trigger`, `heartbeat_log` -- Imp-10 heartbeat scheduler
- `hypergraph_query` -- code knowledge hypergraph

**Naming convention divergence**: `server.ts` uses prefixed names (`mcp__agentic_qe__fleet_init`) while `protocol-server.ts` uses flat names (`fleet_init`). Same handler, different contract surface.

**Parameter divergence examples**:
- `task_orchestrate` in `server.ts` includes `priority` (enum: low/medium/high/critical), `maxAgents`, `context`, `codeContext`, `filePaths`, `manualTier` params. In `protocol-server.ts` it only has `task` and `strategy`.
- `fleet_init` in `server.ts` includes `testingFocus`, `frameworks`, `environments`, `memoryBackend` params not present in `protocol-server.ts`.
- `fleet_status` in `server.ts` has `includeDomains` and `includeMetrics` params not in `protocol-server.ts`.
- `quality_assess` in `server.ts` has additional `target` param.
- `memory_share` in `server.ts` has additional `knowledgeContent` param (required: true).

**Risk**: HIGH -- consumers cannot rely on a single tool schema. Parameter omissions mean some features are inaccessible depending on transport, and missing `required` annotations could cause silent failures.

**Consumer Impact**: All MCP consumers (Claude Code, OpenCode, any MCP client)

**Recommendation**:
1. Designate `protocol-server.ts` as the canonical MCP interface (it's the stdio transport that Claude Code connects to)
2. Make `server.ts` a thin wrapper that delegates to the same tool registration
3. Backfill missing tools in each direction (heartbeat/hypergraph into protocol-server, team/routing/aqe_health into server.ts)

---

#### F-02: Pervasive Unsafe Type Casts in Protocol Server (CRITICAL)

**File**: `/workspaces/agentic-qe/src/mcp/protocol-server.ts`

**Description**: **43 instances** of `as unknown as` double-cast pattern in handler registrations. Every handler call follows this pattern:

```typescript
handler: (params) => handleFleetInit(params as unknown as Parameters<typeof handleFleetInit>[0])
```

This bypasses TypeScript's type system entirely. If the MCP inputSchema defines parameters that don't match the handler's expected type (e.g., a missing required field, wrong type), the error will manifest at runtime with no compile-time safety net.

By contrast, `server.ts` uses a single widened `any` handler signature, which is equally unsafe but at least honest about it.

**Total unsafe casts across src/**: 142 occurrences of `as unknown as` or `as any` across 53 files.

**Risk**: HIGH -- type mismatches between MCP schemas and handler interfaces are invisible to the compiler. Combined with F-01's parameter divergence, this means schema changes can silently break handlers.

**Recommendation**:
1. Create properly typed wrapper functions for each handler that validate and map MCP params
2. Use `zod` or `io-ts` runtime validation at the handler boundary
3. Remove `as unknown as` casts and let TypeScript enforce type compatibility

---

### HIGH

#### F-03: Hardcoded Version Strings Diverge from package.json (HIGH)

**Files**:
- `/workspaces/agentic-qe/src/mcp/protocol-server.ts` L170: `version: config.version ?? '3.0.0'`
- `/workspaces/agentic-qe/src/mcp/http-server.ts` L901: `version: '3.0.0'`

**Description**: The package version is `3.8.13` but two server implementations report `3.0.0` to clients. The protocol-server allows override via config but defaults to `3.0.0`. The http-server hardcodes `3.0.0` with no override mechanism.

**Risk**: MEDIUM-HIGH -- version reporting to clients is incorrect. Debugging integration issues becomes difficult when the reported version doesn't match the actual deployed version. MCP clients relying on version negotiation may behave incorrectly.

**Recommendation**: Read version from `package.json` at build time or use a shared constant.

---

#### F-04: Missing `required: true` on Semantically Required Parameters (HIGH)

**File**: `/workspaces/agentic-qe/src/mcp/protocol-server.ts`

**Description**: Multiple tool definitions omit `required: true` on parameters that handlers actually require:

| Tool | Parameter | Has `required`? | Handler Expects |
|---|---|---|---|
| `fleet_init` | `topology` | No | Optional (OK) |
| `model_route` | `task` | **Yes** | Required |
| `infra_healing_feed_output` | `output` | No | Required by handler |
| `test_generate_enhanced` | `sourceCode` | No | Needs either `sourceCode` or file context |
| `accessibility_test` | `url` | No | Required for meaningful test |
| `chaos_test` | `faultType`, `target` | No | Required for injection |
| `defect_predict` | `target` | No | Required for analysis |
| `requirements_validate` | `requirementsPath` | No | Required for validation |
| `code_index` | `target` | No | Required for indexing |

Of 55+ tool parameters that are semantically required for operation, approximately 15 lack the `required: true` annotation. The `buildInputSchema` method at L1313-1351 correctly propagates `required` to the JSON Schema output, so the fix is simply adding the annotation.

**Recommendation**: Audit all tool parameters and add `required: true` where handlers would fail without the parameter.

---

#### F-05: EventEmitter Listener Leak Risk (HIGH)

**Description**: Across the `src/` directory:
- **124** `.on()` listener registrations across 35 files
- **26** cleanup calls (`.removeListener`, `.off`, `.removeAllListeners`) across 13 files
- **0** `setMaxListeners()` calls anywhere

**High-risk files** (listeners without cleanup):
- `src/mcp/transport/stdio.ts` -- 3 `.on()`, 0 cleanup (readline listeners)
- `src/mcp/entry.ts` -- 4 `process.on()`, 0 removal (signal handlers)
- `src/mcp/transport/sse/sse-transport.ts` -- 6 `.on()`, 0 cleanup
- `src/domains/test-execution/services/test-executor.ts` -- 4 `.on()`, 0 cleanup
- `src/domains/test-execution/services/retry-handler.ts` -- 4 `.on()`, 0 cleanup
- `src/domains/test-execution/services/flaky-detector.ts` -- 4 `.on()`, 0 cleanup
- `src/sync/cloud/tunnel-manager.ts` -- 6 `.on()`, 0 cleanup

**Risk**: In long-running MCP server processes, listener accumulation can cause memory leaks and Node.js `MaxListenersExceededWarning` warnings. The test-execution domain is particularly vulnerable as it creates listeners per test run.

**Recommendation**:
1. Add `setMaxListeners()` to EventEmitter subclasses that legitimately need many listeners
2. Ensure `.on()` calls in per-request/per-test contexts have corresponding cleanup in `finally`/`dispose` blocks
3. Prefer `once()` for one-shot event patterns

---

#### F-06: E2EExecuteTool Not Registered in QE_TOOLS Array (HIGH)

**File**: `/workspaces/agentic-qe/src/mcp/tools/registry.ts`

**Description**: `E2EExecuteTool` class exists at `src/mcp/tools/test-execution/e2e-execute.ts` with name `qe/tests/e2e/execute`, but it is NOT included in the `QE_TOOLS` array in `registry.ts`. This means it is never registered via either the `registerAllQETools` function or the `registerMissingQETools` bridge. The tool is effectively dead code -- implemented but inaccessible to any MCP consumer.

**Recommendation**: Add `new E2EExecuteTool()` to the `QE_TOOLS` array in `registry.ts`.

---

### MEDIUM

#### F-07: DomainHandlerDomain Missing 3 Domains vs DomainName (MEDIUM)

**Files**:
- `/workspaces/agentic-qe/src/mcp/handlers/handler-factory.ts` L32-43
- `/workspaces/agentic-qe/src/shared/types/index.ts` L32-46

**Description**: `DomainHandlerDomain` is a manually-maintained subset of `DomainName`:

```
DomainName (14 domains):          DomainHandlerDomain (11 domains):
  test-generation                   test-generation
  test-execution                    test-execution
  coverage-analysis                 coverage-analysis
  quality-assessment                quality-assessment
  defect-intelligence               defect-intelligence
  requirements-validation           requirements-validation
  code-intelligence                 code-intelligence
  security-compliance               security-compliance
  contract-testing                  contract-testing
  visual-accessibility              visual-accessibility
  chaos-resilience                  chaos-resilience
  learning-optimization           * MISSING
  enterprise-integration          * MISSING
  coordination                    * MISSING
```

While `learning-optimization` and `enterprise-integration` are user-facing QE domains with handlers, they cannot be routed through the handler factory's type system. Any handler factory usage for these domains requires a type cast.

**Recommendation**: Either extend `DomainHandlerDomain` to include all 14 domains, or derive it from `DomainName` with `Exclude<>` for intentionally unsupported domains.

---

#### F-08: task_orchestrate Priority Enum Inconsistency (MEDIUM)

**Files**:
- `/workspaces/agentic-qe/src/mcp/server.ts` L200-201
- `/workspaces/agentic-qe/src/mcp/protocol-server.ts` L624-633
- `/workspaces/agentic-qe/src/mcp/handlers/task-handlers.ts` L872-885

**Description**: Three different priority enum conventions coexist:

| Location | Enum Values |
|---|---|
| `task_submit` (both servers) | `p0`, `p1`, `p2`, `p3` |
| `task_orchestrate` in `server.ts` | `low`, `medium`, `high`, `critical` |
| `task_orchestrate` in `protocol-server.ts` | (no priority param at all) |
| Handler `mapPriority()` | Accepts `low/medium/high/critical`, maps to `p0/p1/p2/p3` |

The handler has a `mapPriority()` function that converts human-readable names to internal codes, so both conventions work at runtime. But the protocol-server omits the priority parameter entirely, meaning MCP consumers cannot set task priority when using the stdio transport.

**Recommendation**: Standardize on a single priority convention. Add `priority` param to `task_orchestrate` in `protocol-server.ts`.

---

#### F-09: process.exit() Without Cleanup in Non-CLI Code (MEDIUM)

**Description**: 41 `process.exit()` calls found in `src/`. While CLI handler code properly uses the `cleanupAndExit` pattern (via `command-registry.ts`), several non-CLI files call `process.exit()` without cleanup:

| File | Line(s) | Context |
|---|---|---|
| `src/mcp/protocol-server.ts` | 431 | `handleShutdown` -- exits with 100ms delay but no fleet/connection cleanup before exit |
| `src/kernel/unified-persistence.ts` | 324, 329 | Signal handlers -- no DB flush before exit |
| `src/performance/run-gates.ts` | 114, 122, 134 | Quality gate failures -- no resource cleanup |
| `src/benchmarks/run-benchmarks.ts` | 288, 295 | Benchmark failures |
| `src/integrations/browser/web-content-fetcher.ts` | 495 | Puppeteer error |
| `src/mcp/entry.ts` | 56, 71, 223 | Signal handlers (these DO call `server.stop()` first -- OK) |
| `src/init/phases/10-workers.ts` | 155, 209 | Daemon management |

The `protocol-server.ts` L429-432 `handleShutdown` is notable: it calls `this.stop()` (which includes `disposeFleet()` and `shutdownConnectionPool()`) but wraps it in `setTimeout(() => { this.stop(); process.exit(0); }, 100)`. If `this.stop()` takes longer than 100ms (which is likely given it involves DB operations), the process exits before cleanup completes.

**Recommendation**: Use `await this.stop()` before `process.exit()` in `handleShutdown`. For non-CLI code, add a shared `gracefulExit()` utility.

---

#### F-10: QE Tool Bridge Category Hardcoded to 'domain' (MEDIUM)

**File**: `/workspaces/agentic-qe/src/mcp/qe-tool-bridge.ts` L96-101

**Description**: The bridge registers all non-overlapping QE tools with `category: 'domain'` regardless of their actual category. Tools like `qe/learning/optimize`, `qe/learning/dream`, `qe/planning/*`, `qe/mincut/*`, `qe/embeddings/*`, and `qe/coherence/*` are not "domain" tools -- they span `learning`, `coordination`, and `core` categories.

This means the tool registry's `getByCategory()` method returns incorrect results, and lazy loading by category will not properly load these tools.

**Recommendation**: Expose the category from `MCPToolBase` and use it in the bridge.

---

#### F-11: server.ts memory_share Has Extra Required Param Not in protocol-server.ts (MEDIUM)

**Files**:
- `/workspaces/agentic-qe/src/mcp/server.ts` L599: `{ name: 'knowledgeContent', type: 'object', description: 'Knowledge content', required: true }`
- `/workspaces/agentic-qe/src/mcp/protocol-server.ts` L984-991: no `knowledgeContent` param

**Description**: The `memory_share` tool in `server.ts` requires a `knowledgeContent` parameter that doesn't exist in `protocol-server.ts`. The handler signature in `handleMemoryShare` accepts `{ sourceAgentId, targetAgentIds, knowledgeDomain, knowledgeContent? }`. When called via protocol-server (no `knowledgeContent`), the handler operates with undefined content, which may produce incomplete knowledge sharing.

**Recommendation**: Align parameter definitions between both servers.

---

### LOW

#### F-12: Routing ToolCategory Only in protocol-server.ts (LOW)

**Description**: The `routing` and `infra-healing` ToolCategories are only used in `protocol-server.ts`. The `server.ts` doesn't register any routing or infra-healing tools, meaning the tool registry's category tracking is inconsistent between the two server implementations.

**Impact**: Low -- this is a subset of the broader F-01 divergence.

---

#### F-13: http-server.ts Version Hardcoded Without Override Mechanism (LOW)

**File**: `/workspaces/agentic-qe/src/mcp/http-server.ts` L901

**Description**: The health endpoint returns `version: '3.0.0'` with no way to override. Unlike `protocol-server.ts` which accepts a `version` config parameter (even though it defaults to `3.0.0`), the http-server provides no mechanism to set the correct version.

**Recommendation**: Accept version in constructor config, read from package.json, or share a version constant.

---

#### F-14: protocol-server.ts handleShutdown Race Condition (LOW)

**File**: `/workspaces/agentic-qe/src/mcp/protocol-server.ts` L426-433

```typescript
private async handleShutdown(): Promise<Record<string, never>> {
    console.error('[MCP] Shutdown requested');
    setTimeout(() => {
      this.stop();  // async but not awaited
      process.exit(0);
    }, 100);
    return {};
}
```

`this.stop()` is an async function that calls `disposeFleet()` and `shutdownConnectionPool()`, but it's invoked without `await` inside the `setTimeout` callback. The `process.exit(0)` executes immediately after the synchronous parts of `stop()`, potentially before async cleanup (DB writes, connection draining) completes.

**Recommendation**: `await this.stop()` before exit, or increase the delay and check completion.

---

## Integration Test Coverage Gaps

| Integration Point | Test Coverage | Gap |
|---|---|---|
| protocol-server.ts tool registration (55+ tools) | No integration test verifying all tools appear in `tools/list` | **CRITICAL GAP** |
| server.ts vs protocol-server.ts parity | No test comparing tool definitions | **HIGH GAP** |
| QE tool bridge registration | No test verifying bridged tools are callable | **MEDIUM GAP** |
| Handler type safety (43 `as unknown as` casts) | No contract test validating param schemas match handlers | **HIGH GAP** |
| EventEmitter cleanup in test-execution domain | No test for listener leak | **MEDIUM GAP** |

---

## Files Examined

| File | Purpose | Findings |
|---|---|---|
| `src/mcp/protocol-server.ts` | Stdio MCP server (primary) | F-01, F-02, F-03, F-04, F-08, F-09, F-14 |
| `src/mcp/server.ts` | Class-based MCP server | F-01, F-08, F-11 |
| `src/mcp/types.ts` | MCP type definitions | Verified ToolCategory completeness |
| `src/mcp/tool-registry.ts` | Tool registration and validation | SEC-001 validation verified |
| `src/mcp/qe-tool-bridge.ts` | Bridge for QE domain tools | F-10 |
| `src/mcp/tools/registry.ts` | QE tool instances | F-06 |
| `src/mcp/http-server.ts` | HTTP/AG-UI server | F-03, F-13 |
| `src/mcp/handlers/handler-factory.ts` | Domain handler factory | F-07 |
| `src/mcp/handlers/core-handlers.ts` | Fleet/status handlers | Verified |
| `src/mcp/handlers/task-handlers.ts` | Task handlers | F-08 (mapPriority) |
| `src/mcp/entry.ts` | MCP entry point | Signal handler review |
| `src/mcp/transport/stdio.ts` | Stdio transport | F-05 (listener leak) |
| `src/mcp/transport/sse/sse-transport.ts` | SSE transport | F-05 (listener leak) |
| `src/mcp/transport/websocket/websocket-transport.ts` | WebSocket transport | Partial cleanup |
| `src/shared/types/index.ts` | DomainName definition | F-07 baseline |
| `src/shared/sql-safety.ts` | SQL allowlist | Verified 51 tables |
| `src/shared/http/http-client.ts` | HTTP client | Verified exponential backoff |
| `src/mcp/tools/test-execution/e2e-execute.ts` | E2E execute tool | F-06 (dead code) |
| `src/cli/command-registry.ts` | CLI command registration | Verified cleanupAndExit pattern |

---

## Dependency Graph: MCP Tool Resolution

```
Claude Code / MCP Client
    |
    +--> stdio transport --> protocol-server.ts (55+ flat-named tools)
    |       |                    |
    |       |                    +--> handlers/* (shared)
    |       |                    +--> qe-tool-bridge.ts --> tools/registry.ts (QE_TOOLS)
    |       |                            |
    |       |                            +--> 11 ALREADY_REGISTERED (skip)
    |       |                            +--> ~15 bridged tools (category='domain')
    |       |
    |       +--> tool-registry.ts (SEC-001 validation, lazy loading)
    |
    +--> MCPServer class --> server.ts (46 prefixed tools)
            |
            +--> handlers/* (shared)
            +--> tool-registry.ts (same validation)
```

**Key Observation**: Both servers share the same handlers but define different parameter schemas. The bridge adds ~15 QE tools to `protocol-server.ts` only. This creates a **superset/subset relationship** that is not formally documented or tested.

---

## Findings Summary

| ID | Severity | Title | Weight |
|---|---|---|---|
| F-01 | CRITICAL | Dual MCP Server Tool Contract Divergence | 3 |
| F-02 | CRITICAL | Pervasive Unsafe Type Casts (43 in protocol-server) | 3 |
| F-03 | HIGH | Hardcoded Version Strings (3.0.0 vs 3.8.13) | 2 |
| F-04 | HIGH | Missing `required: true` on ~15 Parameters | 2 |
| F-05 | HIGH | EventEmitter Listener Leak Risk (124 on vs 26 off) | 2 |
| F-06 | HIGH | E2EExecuteTool Not Registered (dead code) | 2 |
| F-07 | MEDIUM | DomainHandlerDomain Missing 3 Domains | 1 |
| F-08 | MEDIUM | task_orchestrate Priority Enum Inconsistency | 1 |
| F-09 | MEDIUM | process.exit() Without Cleanup in Non-CLI Code | 1 |
| F-10 | MEDIUM | QE Tool Bridge Category Hardcoded to 'domain' | 1 |
| F-11 | MEDIUM | memory_share Extra Required Param Divergence | 1 |
| F-12 | LOW | Routing ToolCategory Only in One Server | 0.5 |
| F-13 | LOW | http-server Version Hardcoded Without Override | 0.5 |
| F-14 | LOW | handleShutdown Race Condition | 0.5 |

**Total**: 2 CRITICAL + 4 HIGH + 5 MEDIUM + 3 LOW = **14 findings**
**Weighted Score**: 6 + 8 + 5 + 1.5 = **20.5**

---

## Recommendations (Priority Order)

1. **[P0] Unify MCP server tool registration** -- Extract tool definitions into a shared registry consumed by both `server.ts` and `protocol-server.ts`. This eliminates F-01, F-08, F-11, F-12 in one change.

2. **[P0] Add runtime schema validation at handler boundary** -- Replace `as unknown as` casts with `zod` schemas that validate MCP input before passing to handlers. Eliminates F-02 and strengthens F-04.

3. **[P1] Version string management** -- Read version from `package.json` or a build-time constant. Fixes F-03, F-13.

4. **[P1] EventEmitter lifecycle audit** -- Add `setMaxListeners()` to long-lived emitters, ensure per-request emitters are cleaned up. Fixes F-05.

5. **[P2] Register E2EExecuteTool** -- One-line fix in `registry.ts`. Fixes F-06.

6. **[P2] Align DomainHandlerDomain with DomainName** -- Derive from shared type. Fixes F-07.

7. **[P2] Integration test for tool parity** -- Write a test that verifies both servers expose the same tools with compatible schemas.

---

## Score Justification: 5.5 / 10

| Dimension | Score | Rationale |
|---|---|---|
| Protocol Consistency | 7/10 | Protocol version unified at 2025-11-25; but server version strings still wrong |
| Tool Interface Consistency | 3/10 | Dual servers with divergent schemas, missing params, incorrect categories |
| Type Safety | 3/10 | 43 unsafe casts in protocol-server alone; DomainHandlerDomain gap |
| Error Handling | 6/10 | Consistent try/catch in handlers; but shutdown race condition exists |
| Resource Management | 5/10 | HTTP backoff fixed; but EventEmitter leaks persist |
| v3.8.3 Remediation | 6/10 | 6/10 fully resolved, but listener leaks and server divergence worsened |
| Test Coverage | 4/10 | No integration tests for tool registration parity |
| **Overall** | **5.5/10** | Structural improvements in security and SQL safety offset by growing dual-server divergence |
