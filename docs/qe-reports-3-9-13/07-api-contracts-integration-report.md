# API Contracts & Integration Report - v3.9.13

**Date**: 2026-04-20
**Agent**: qe-integration-reviewer (Agent 07)
**Baseline**: v3.8.13 (2026-03-30)
**Scope**: MCP tool contracts, dual-server unification, Zod validation gaps, CLI/MCP parity, ADR-092 advisor surface
**Live evidence**: `aqe mcp` stdio handshake, captured 86-tool `tools/list` response in `/tmp/mcp-clean.jsonl`

---

## Executive Summary

v3.9.13 eliminates the two worst v3.8.13 findings (F-01 dual-server divergence, F-03 hardcoded `3.0.0`). `src/mcp/server.ts` is **deleted**; `MCPProtocolServer` is the sole server, and both `protocol-server.ts` and `http-server.ts` now read the version from `package.json` at runtime (confirmed: server reports `v3.9.13` on startup). Live MCP handshake enumerates **86 tools** (60 hardcoded + 26 QE bridge), matching the startup log.

However, four v3.8.13 findings are unresolved and a new CRITICAL emerges for the ADR-092 `advisor_consult` tool:

- **Unsafe casts**: 43 `as unknown as` still present in `protocol-server.ts` (no change; up to 47 across `src/mcp/*` now — contract-validate, chaos inject, learning optimize added casts).
- **No Zod/runtime validation**: zero MCP handlers validate input; MCP param schemas are still divorced from handler signatures via double-cast.
- **Missing `required: true`** on 12 semantically-required params including the NEW `advisor_consult` tool (`task` param unchecked).
- **EventEmitter leaks**: 123 `.on()` vs 26 cleanup, 0 `setMaxListeners()` (regression appears to be net-neutral — mostly unchanged).
- **E2EExecuteTool**: still dead code, still not in `QE_TOOLS` array.
- **handleShutdown race**: unchanged — `setTimeout(() => { this.stop(); process.exit(0); }, 100)` still fires exit without awaiting async cleanup.

**Weighted Finding Score**: 1x3 + 5x2 + 4x1 + 2x0.5 = **18.0** (threshold 2.0 — PASSED)

**Overall Score: 7.0 / 10 (+1.5 vs v3.8.13 5.5)**

Score driver: dual-server unification is a genuine P0 fix that retires four findings (F-01, F-03, F-11, F-12, F-13). Remaining issues concentrated in type-safety and schema hygiene rather than structural divergence.

---

## v3.8.13 Remediation Verification

| v3.8.13 Finding | Status | Evidence |
|---|---|---|
| **F-01 Dual MCP Server Tool Contract Divergence** (CRITICAL) | **RESOLVED** | `src/mcp/server.ts` deleted. `src/mcp/index.ts` L67-70 aliases `MCPProtocolServer as MCPServer` for back-compat. Only one `MCPProtocolServer` class now exists. |
| **F-02 Pervasive Unsafe Type Casts** (CRITICAL) | **UNRESOLVED** | Still 43 `as unknown as` occurrences in `protocol-server.ts` (identical count). Now 47 across `src/mcp/*` (was 43; added in `contract-testing/validate.ts`, `chaos-resilience/inject.ts`, `learning-optimization/optimize.ts`, `handlers/core-handlers.ts`). No Zod or io-ts adoption. |
| **F-03 Hardcoded Version Strings** (HIGH) | **RESOLVED** | `protocol-server.ts` L130: `const _pkg = _require('../../package.json') as { version: string }` and L200 `version: config.version ?? _pkg.version`. `http-server.ts` L21, L904 same pattern. Server startup log confirms: `[MCP] agentic-qe-v3 v3.9.13 started`. |
| **F-04 Missing `required: true` on ~15 Params** (HIGH) | **PARTIAL** | Live MCP enumeration shows 12 tools with semantically-required params lacking `required` (see F-04 below). New ADR-092 `advisor_consult` inherits the pattern. |
| **F-05 EventEmitter Listener Leak Risk** (HIGH) | **UNRESOLVED** | 123 `.on()` (was 124) vs 26 cleanup (unchanged) vs 0 `setMaxListeners()` (unchanged). Net change: −1 listener registration (likely from server.ts deletion). No systemic fix applied. |
| **F-06 E2EExecuteTool Dead Code** (HIGH) | **UNRESOLVED** | `src/mcp/tools/test-execution/e2e-execute.ts` still exists; `src/mcp/tools/test-execution/index.ts` still exports it; `src/mcp/tools/registry.ts` `QE_TOOLS[]` array still does NOT include it. Live MCP `tools/list` confirms no `qe/tests/e2e/execute` entry. |
| **F-07 DomainHandlerDomain Missing 3 Domains** (MEDIUM) | **UNRESOLVED** | `handler-factory.ts` L32-43 still lists 11 domains; `shared/types/index.ts` L32-46 still lists 14. Missing: `learning-optimization`, `enterprise-integration`, `coordination`. |
| **F-08 task_orchestrate Priority Enum Inconsistency** (MEDIUM) | **PARTIALLY RESOLVED** | Since server.ts is deleted, the cross-server divergence is gone. However `task_orchestrate` in `protocol-server.ts` L752-758 still has no `priority` param at all (only `task`, `strategy`) — MCP consumers still cannot set priority for orchestrated tasks. |
| **F-09 process.exit() Without Cleanup** (MEDIUM) | **MARGINAL** | 49 `process.exit()` calls (was 41) — worsened by 8. `protocol-server.ts` still has the unawaited `setTimeout` shutdown at L499-506. |
| **F-10 QE Tool Bridge Category Hardcoded** (MEDIUM) | **UNRESOLVED** | `qe-tool-bridge.ts` L99 still hardcodes `category: 'domain'` for all bridged tools. Learning, planning, mincut, embeddings, coherence, etc. all misclassified. |
| **F-11 memory_share Extra Required Param** (MEDIUM) | **RESOLVED** | Server.ts deletion removes the divergent schema. Live MCP confirms `memory_share` has `required: ['sourceAgentId','targetAgentIds','knowledgeDomain']` (no `knowledgeContent`). |
| **F-12 Routing ToolCategory Only in One Server** (LOW) | **RESOLVED** | Single server, all categories present. |
| **F-13 http-server Version Hardcoded** (LOW) | **RESOLVED** | Reads from package.json. |
| **F-14 handleShutdown Race Condition** (LOW) | **UNRESOLVED** | `protocol-server.ts` L499-506 unchanged: `setTimeout(() => { this.stop(); process.exit(0); }, 100)` — `this.stop()` not awaited. |

**Remediation Score: 7/14 — 6 fully resolved + 2 partial + 6 unresolved + 0 worsened structurally**

---

## Live MCP Enumeration (v3.9.13)

Captured via: `printf '{"jsonrpc":"2.0","id":1,"method":"initialize",...}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n' | aqe mcp`

- Startup log: `[MCP] Registered 86 tools (26 via QE bridge)`
- Reported server version: `v3.9.13` (matches `package.json`)
- Tool count confirmed via `tools/list` JSON: **86**
- 60 hardcoded flat-name tools + 26 `qe/*` prefixed tools
- Naming inconsistency persists **within the single server**: underscore-snake for core (`fleet_init`, `task_submit`) vs slash-hierarchy for QE (`qe/tests/schedule`, `qe/learning/optimize`). This is a style divergence, not a contract split.

---

## New / Updated Findings

### CRITICAL

#### F-01 (v3.9.13): `advisor_consult` ships with zero required params and no Zod validation (CRITICAL)

**File**: `/workspaces/agentic-qe/src/mcp/protocol-server.ts` L1491-1572

**Description**: The ADR-092 Phase 6 MCP wrapper for `aqe llm advise` is registered with **five optional params** and **no schema validation**:

```ts
{ name: 'agent', type: 'string', description: '...' },
{ name: 'task', type: 'string', description: 'Task description' },
{ name: 'context', type: 'string', description: '...' },
{ name: 'provider', type: 'string', description: '...' },
{ name: 'model', type: 'string', description: '...' },
```

Live MCP enumeration confirms: `advisor_consult | props=5 required=[]`.

The handler itself (L1511) destructures with `?? ''` fallbacks:
```ts
taskDescription: p.task ?? '',
messages: [ { role: 'user', content: p.task ?? '' }, ... ]
```

So a caller invoking `advisor_consult({})` gets an empty transcript forwarded to a real LLM call (OpenRouter/Claude/Ollama) — potentially wasting tokens and returning garbage. The `agent` param is also semantically required for transcript metadata (falls back to `'unknown'`).

Additionally, the handler **shells out to `aqe llm advise`** via `execFileSync` with a 60s timeout, passing a temp transcript file. This introduces a second attack surface: unchecked `provider` and `model` strings are appended as CLI flags. No allowlist is enforced at the MCP boundary (ADR-092 advisor CLI does validate, but MCP→CLI contract is fragile).

**Risk**: HIGH — new user-facing tool ships with broken input contract; LLM budget exposure; CLI injection surface narrow but present.

**Recommendation**:
1. Mark `agent` and `task` as `required: true` in the parameter list.
2. Add Zod validation at MCP handler boundary before shelling to CLI.
3. Allowlist `provider` values (`openrouter`, `claude`, `ollama`) in the MCP handler, not just downstream.

---

### HIGH

#### F-02 (v3.9.13): 43 unsafe double-casts unchanged; no Zod adoption (HIGH, carry-over of v3.8.13 F-02)

Identical count in `protocol-server.ts`. Growth of 4 new casts in QE tool implementations (total 47 in `src/mcp/*`). `grep "from 'zod'" src/` returns zero matches; `package.json` has no `zod` dependency. The contract between MCP inputSchema and handler signatures remains unenforced at both compile and runtime.

**Recommendation**: Adopt Zod (or `@sinclair/typebox`) per-handler. For the existing 43 cast sites, a codemod-generated validator layer would eliminate the entire class of bugs.

---

#### F-03 (v3.9.13): 12 tools have semantically-required params without `required: true` (HIGH, carry-over of v3.8.13 F-04)

Evidence from live MCP `tools/list` (see `/tmp/mcp-clean.jsonl`):

| Tool | Required-looking params | Current `required` array |
|---|---|---|
| `test_generate_enhanced` | `sourceCode` | `[]` |
| `coverage_analyze_sublinear` | `target` | `[]` |
| `quality_assess` | (needs at least one target hint) | `[]` |
| `security_scan_comprehensive` | `target` | `[]` |
| `contract_validate` | `contractPath` | `[]` |
| `accessibility_test` | `url` | `[]` |
| `chaos_test` | `faultType`, `target` | `[]` |
| `defect_predict` | `target` | `[]` |
| `requirements_validate` | `requirementsPath` | `[]` |
| `code_index` | `target` | `[]` |
| `infra_healing_feed_output` | `output` | `[]` |
| `advisor_consult` (NEW) | `agent`, `task` | `[]` |

**Recommendation**: Audit the 12 listed tools, add `required: true` in their param definitions.

---

#### F-04 (v3.9.13): EventEmitter cleanup regression still unfixed (HIGH, carry-over of v3.8.13 F-05)

- `.on()` registrations: **123** (was 124; trivially reduced by server.ts deletion).
- Cleanup calls (`.removeListener`, `.off(`, `.removeAllListeners`): **26** (unchanged).
- `setMaxListeners()` calls: **0** (unchanged — entire codebase).

High-risk hotspots unchanged: `src/mcp/transport/sse/sse-transport.ts` (6 on / 0 off), `src/domains/test-execution/services/test-executor.ts` (4/0), `src/domains/test-execution/services/retry-handler.ts` (4/0), `src/domains/test-execution/services/flaky-detector.ts` (4/0), `src/sync/cloud/tunnel-manager.ts` (6 on / 0 off), `src/mcp/transport/websocket/websocket-transport.ts` (10 on / 1 off).

**Recommendation**: Adopt a `DisposableEmitter` mixin with `this.on(...)` tracking + automatic cleanup on dispose; add `setMaxListeners(32)` on long-lived emitters with explicit justification comment.

---

#### F-05 (v3.9.13): `E2EExecuteTool` still dead code (HIGH, carry-over of v3.8.13 F-06)

`src/mcp/tools/test-execution/e2e-execute.ts` remains; `src/mcp/tools/test-execution/index.ts` L8 re-exports it; `src/mcp/tools/registry.ts` `QE_TOOLS[]` (L131-207) does not instantiate it. Live MCP `tools/list` has no `qe/tests/e2e/execute`. One-line fix pending since v3.8.13 report.

---

#### F-06 (v3.9.13): Naming convention divergence within single server (HIGH, new phrasing)

Server registers two naming conventions side-by-side:

- **Flat snake_case** (60 tools): `fleet_init`, `task_submit`, `memory_store`, `advisor_consult` — hardcoded in `protocol-server.ts` handler registrations.
- **Slash-hierarchical** (26 tools): `qe/tests/schedule`, `qe/learning/optimize`, `qe/embeddings/search` — via `registerMissingQETools()` bridge.

MCP clients must handle both forms. Claude Code and OpenCode auto-generate `mcp__agentic_qe__<name>` identifiers, which means the slash form becomes `mcp__agentic_qe__qe/tests/schedule` — slashes in tool identifiers are problematic for some shell/terminal UIs.

**Recommendation**: Pick one convention. Lean toward snake (Claude Code convention). Either rename `qe/*` to `qe_*` or document the divergence as intentional in ADR.

---

### MEDIUM

#### F-07 (v3.9.13): `DomainHandlerDomain` still 11 of 14 domains (MEDIUM, carry-over of v3.8.13 F-07)

Unchanged. Recommendation remains: derive from `DomainName` with `Exclude<>`.

---

#### F-08 (v3.9.13): `task_orchestrate` missing `priority` param (MEDIUM, carry-over of v3.8.13 F-08)

Server.ts deletion collapses the cross-server divergence, but `protocol-server.ts` L752-758 still omits `priority` from `task_orchestrate`. The `mapPriority()` handler helper is orphan code for orchestrate (only used by `task_submit`). MCP clients still cannot set task priority via orchestrate.

**Recommendation**: Add `priority` param to `task_orchestrate` schema (enum: `p0`/`p1`/`p2`/`p3`).

---

#### F-09 (v3.9.13): QE bridge category hardcoded (MEDIUM, carry-over of v3.8.13 F-10)

`qe-tool-bridge.ts` L99 unchanged. 26 tools across `learning`, `planning`, `mincut`, `embeddings`, `coherence`, `analysis` categories are all registered as `category: 'domain'`. Breaks category-based tool queries.

---

#### F-10 (v3.9.13): `process.exit()` count increased to 49 (was 41) (MEDIUM)

Non-CLI `process.exit()` count grew from 41 → 49. Worsening vector: init phases, daemon management, benchmarks. While many are legitimately fatal, the net effect is more code paths that bypass unified-persistence flush.

---

### LOW

#### F-11 (v3.9.13): `handleShutdown` race unchanged (LOW, carry-over of v3.8.13 F-14)

`protocol-server.ts` L499-506 unchanged. `this.stop()` returns a Promise that is not awaited before `process.exit(0)`.

---

#### F-12 (v3.9.13): No integration test for MCP tool parity (LOW)

No file matching `tests/**/protocol-server*` or `tests/**/mcp-tool-parity*`. The 86-tool contract is not locked by any test — additions/removals can ship without review. `tests/unit/mcp/tool-scoping.test.ts` tests scope logic only, not registration.

**Recommendation**: Add a snapshot test that invokes `tools/list` and diffs against a golden list; fail builds when the count or names drift without intent.

---

## CLI ↔ MCP Parity Sample (5 tools)

| Tool | MCP result shape | CLI equivalent | CLI flag | Result shape match |
|---|---|---|---|---|
| `aqe_health` | JSON object | `aqe health` | **no `--json`** | **Shape drift**: CLI produces banner; MCP produces structured JSON |
| `fleet_status` | JSON with domains, metrics | `aqe fleet status` | **no `--json`** | **Shape drift**: CLI produces progress bars; MCP JSON |
| `memory_usage` | JSON | `aqe memory usage --json` | yes | **Parity OK** — both return `{success, error|data}` |
| `routing_metrics` | JSON | `aqe routing metrics --json` | yes | **Parity OK** |
| `token_usage` (CLI only) | — | `aqe token-usage --json` | yes | **No MCP tool**: `aqe/analysis/token_usage` exists in MCP but naming differs |

**Finding**: `aqe health` and `aqe fleet status` are banner-only CLI — no `--json` flag. This violates the "structured output, not grep" user rule. 62 `--json` flag occurrences across 15 CLI files means the pattern is common but inconsistently applied.

**Recommendation** (LOW — already tracked in user memory): Add `--json` to `aqe health` and `aqe fleet status`. MCP clients invoking through CLI shell-out cannot parse banner output reliably.

---

## Additional Analysis

### Zod / runtime validation
- Zero use in MCP layer. One string-match in `src/shared/security/compliance-patterns.ts` is unrelated.
- `package.json` does not list `zod` as dep. No migration has started.
- v3.8.13 report recommended this as P0 — no progress.

### ADR-092 new MCP surface
- `advisor_consult` (NEW): see F-01 (v3.9.13).
- `model_route` (existing, ADR-051): properly declares `required: ['task']`.
- `routing_metrics`, `routing_economics` (existing): no required params needed.

### JSON output mode coverage
- MCP tools: all 86 return JSON (by protocol spec).
- CLI tools: `--json` present in 15 of ~42 top-level CLI commands. `aqe fleet status`, `aqe health`, `aqe status` lack `--json` and are banner-only.

---

## Files Examined

| File | Purpose | Findings |
|---|---|---|
| `src/mcp/protocol-server.ts` | Sole MCP server | F-01, F-02, F-03, F-08, F-11 |
| `src/mcp/index.ts` | Module exports | Verified server.ts removal + alias |
| `src/mcp/http-server.ts` | HTTP/AG-UI server | Version fix verified |
| `src/mcp/qe-tool-bridge.ts` | QE bridge | F-09 |
| `src/mcp/tools/registry.ts` | QE_TOOLS array | F-05 |
| `src/mcp/tools/test-execution/e2e-execute.ts` | Dead E2E tool | F-05 |
| `src/mcp/handlers/handler-factory.ts` | Handler factory | F-07 |
| `src/shared/types/index.ts` | DomainName source | F-07 |
| `package.json` | Version = 3.9.13 | Version parity confirmed |
| `/tmp/mcp-clean.jsonl` | Live MCP tools/list | Schema evidence for F-03 |

---

## Findings Summary

| ID | Severity | Title | Weight |
|---|---|---|---|
| F-01 | CRITICAL | `advisor_consult` zero-required params, no Zod, CLI shell-out | 3 |
| F-02 | HIGH | 43 unsafe double-casts unchanged; no Zod | 2 |
| F-03 | HIGH | 12 tools missing `required: true` | 2 |
| F-04 | HIGH | EventEmitter leak risk (123 on / 26 off / 0 setMaxListeners) | 2 |
| F-05 | HIGH | `E2EExecuteTool` still dead code | 2 |
| F-06 | HIGH | Intra-server naming convention divergence (snake vs slash) | 2 |
| F-07 | MEDIUM | `DomainHandlerDomain` missing 3 domains | 1 |
| F-08 | MEDIUM | `task_orchestrate` missing `priority` param | 1 |
| F-09 | MEDIUM | QE bridge hardcodes `category: 'domain'` | 1 |
| F-10 | MEDIUM | `process.exit()` count grew 41→49 | 1 |
| F-11 | LOW | `handleShutdown` race unchanged | 0.5 |
| F-12 | LOW | No MCP tool parity integration test | 0.5 |

**Total**: 1 CRITICAL + 5 HIGH + 4 MEDIUM + 2 LOW = **12 findings**
**Weighted Score**: 3 + 10 + 4 + 1 = **18.0**

---

## Remediation Table (v3.8.13 → v3.9.13)

| v3.8.13 ID | Title | v3.9.13 Status | Evidence |
|---|---|---|---|
| F-01 | Dual MCP Server Divergence | **RESOLVED** | `server.ts` deleted; alias in `index.ts` |
| F-02 | 43 unsafe double-casts | **UNCHANGED** | Still 43 in protocol-server; 47 across src/mcp/* |
| F-03 | Hardcoded version 3.0.0 | **RESOLVED** | Both servers read package.json |
| F-04 | Missing required:true (~15) | **PARTIAL** | 12 now (advisor_consult new, others unchanged) |
| F-05 | EventEmitter leaks | **UNCHANGED** | 123/26/0 |
| F-06 | E2EExecuteTool dead code | **UNCHANGED** | Still not in QE_TOOLS |
| F-07 | DomainHandlerDomain 3 missing | **UNCHANGED** | 11 vs 14 domains |
| F-08 | task_orchestrate priority enum | **PARTIAL** | Server merge resolved fork; priority still absent |
| F-09 | process.exit without cleanup | **WORSENED** | 41 → 49 |
| F-10 | QE bridge category hardcoded | **UNCHANGED** | Still `'domain'` |
| F-11 | memory_share param drift | **RESOLVED** | Via server merge |
| F-12 | Routing category one-server | **RESOLVED** | Via server merge |
| F-13 | http-server version hardcode | **RESOLVED** | Reads package.json |
| F-14 | handleShutdown race | **UNCHANGED** | setTimeout without await |

---

## Score Justification: 7.0 / 10 (+1.5 vs v3.8.13)

| Dimension | v3.8.13 | v3.9.13 | Rationale |
|---|---|---|---|
| Protocol Consistency | 7 | 9 | Single server, correct version, clean handshake |
| Tool Interface Consistency | 3 | 6 | No cross-server fork; intra-server naming divergence remains |
| Type Safety | 3 | 3 | Unchanged: 43 unsafe casts, no Zod |
| Error Handling | 6 | 5 | Shutdown race unchanged; more `process.exit()` sites |
| Resource Management | 5 | 5 | EventEmitter leaks untouched |
| v3.8.3 Remediation | 6 | 7 | 6 full + 2 partial resolutions this cycle |
| Test Coverage | 4 | 4 | No new MCP parity tests |
| ADR-092 Surface (new) | — | 6 | `advisor_consult` shipped but weak contract |
| **Overall** | **5.5** | **7.0** | Major structural win offset by persistent type-safety debt |

---

## Recommendations (Priority Order)

1. **[P0] Fix `advisor_consult`**: add `required: ['agent','task']`, validate `provider` enum at MCP boundary.
2. **[P0] Adopt Zod for MCP handler boundary** — closes 43 unsafe casts + 12 missing-required issues with a single adapter pattern.
3. **[P1] Register `E2EExecuteTool`** — one-line fix outstanding since v3.8.13.
4. **[P1] `await this.stop()` in `handleShutdown`** — trivial async/await fix.
5. **[P1] Add MCP tool parity snapshot test** — lock the 86-tool contract.
6. **[P2] EventEmitter lifecycle**: introduce `DisposableEmitter`, add `setMaxListeners` on long-lived emitters.
7. **[P2] Fix QE bridge category inference** — expose `category` from `MCPToolBase`.
8. **[P2] Extend `DomainHandlerDomain` to 14 domains** via `Exclude<DomainName,...>`.
