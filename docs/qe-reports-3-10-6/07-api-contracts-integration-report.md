# API Contracts & Integration Report - v3.10.6

**Date**: 2026-06-12
**Agent**: qe-integration-reviewer (Agent 07)
**Analyzed version**: v3.10.6 (package.json source of truth; running dist binary self-reports v3.10.4 — see N-04)
**Baseline for deltas**: v3.9.13 (`docs/qe-reports-3-9-13/07-api-contracts-integration-report.md`)
**Scope**: MCP tool inventory, ADR-105..110 surface (`validation_pipeline`), Zod/type-safety, `required:true` hygiene, EventEmitter leaks, `advisor_consult` contract (ADR-092 F-01), shutdown race, MCP↔CLI parity, error-shape consistency
**Live evidence**: stdio handshake captured at `/tmp/mcp-out.jsonl` (86-tool `tools/list`), startup log at `/tmp/mcp-stderr.log`

---

## Executive Summary

v3.10.6 lands the single most important contract fix outstanding since v3.8.13: the **ADR-092 `advisor_consult` empty-string contract bug (prior F-01 CRITICAL) is now FIXED**. The tool declares `required: true` on `agent` and `task` (protocol-server.ts L1597-1598), the live `tools/list` schema emits `required: ["agent","task"]`, AND the handler enforces non-empty trimmed strings before shelling to the CLI (L1614-1621). It was also re-categorised from `'domain'` to `'routing'` (L1595), fixing its misclassification.

A new MCP tool landed with the ADR-105..110 pattern-space work: **`validation_pipeline`** (L1432), backed by `src/mcp/handlers/validation-pipeline-handler.ts`, which carries the `evidenceClass` / `needsVerification` contract fields (handler L54, L63, L180, L186-190) referenced in recent commits. The total live tool count is **unchanged at 86** (60 flat + 26 QE bridge) — `validation_pipeline` replaced/occupied a slot rather than growing the inventory; the startup log still reads `Registered 86 tools (26 via QE bridge)`.

The persistent type-safety debt is **unchanged**: 43 `as unknown as` in protocol-server.ts, 47 across `src/mcp/*`, and still **zero Zod** (no `zod` in package.json, no `from 'zod'` in src). EventEmitter leaks regressed slightly (135 `.on()` vs 27 cleanup vs 0 `setMaxListeners`). MCP↔CLI shape drift on `aqe health` / `aqe fleet status` is unchanged (still no `--json`).

**Weighted Finding Score**: 0×3 + 3×2 + 4×1 + 2×0.5 = **11.0** (threshold 2.0 — PASSED)

**Overall Score: 7.6 / 10 (+0.6 vs v3.9.13 7.0)**

Score driver: the CRITICAL `advisor_consult` fix retires the only P0 in this dimension and 5 of the prior-12 `required` gaps closed. Offset by zero progress on the structural type-safety debt (casts, Zod) and a small listener regression.

---

## Prior-Run Remediation Table (v3.9.13 → v3.10.6)

| v3.9.13 ID | Title | v3.10.6 Status | Evidence |
|---|---|---|---|
| **F-01** | `advisor_consult` zero-required + empty-string fallback (CRITICAL, ADR-092) | **FIXED** | protocol-server.ts L1597-1598 `required: true` on `agent`+`task`; L1614-1621 runtime non-empty validation returns `{error}` instead of shelling out; live schema `required:["agent","task"]` (`/tmp/mcp-out.jsonl`). Re-categorised `'routing'` L1595. |
| **F-02** | 43 unsafe double-casts; no Zod | **UNCHANGED** | `grep -c "as unknown as" src/mcp/protocol-server.ts` = **43** (identical). 47 across `src/mcp/*` (optimize.ts, validate.ts, inject.ts, core-handlers.ts ×1 each). `zod` absent from package.json; 0 `from 'zod'` in src. |
| **F-03** | 12 tools missing `required: true` | **PARTIAL (improved)** | 5 of prior-12 now declare required: `coverage_analyze_sublinear`→`[target]`, `accessibility_test`→`[url]`, `defect_predict`→`[target]`, `code_index`→`[target]`, `advisor_consult`→`[agent,task]`. 7 still empty (`test_generate_enhanced`, `quality_assess`, `security_scan_comprehensive`, `contract_validate`, `chaos_test`, `requirements_validate`, `infra_healing_feed_output`) — several are legitimately XOR/defaultable (see N-01). |
| **F-04** | EventEmitter leak (123 on / 26 off / 0 setMaxListeners) | **REGRESSED (minor)** | src-wide: **135** `.on()` (+12), **27** cleanup (+1), **0** `setMaxListeners` (unchanged). Hotspots identical: sse-transport 6/0, websocket-transport 10/1, test-executor 4/0. No systemic fix. |
| **F-05** | `E2EExecuteTool` dead code | **UNCHANGED** | `src/mcp/tools/test-execution/e2e-execute.ts` exists; `index.ts` L8 still `export { E2EExecuteTool }`; not in live `tools/list` (no `e2e` entry). One-line fix still pending since v3.8.13. |
| **F-06** | Intra-server naming divergence (snake vs slash) | **UNCHANGED** | Live `tools/list`: 60 flat snake_case + 26 `qe/*` slash-form. Slashes still surface as `mcp__agentic_qe__qe/tests/schedule` for clients. |
| **F-07** | `DomainHandlerDomain` missing 3 domains | **UNCHANGED** | Not re-derived from `DomainName`; carry-over (not re-walked this pass — flagged for next cycle). |
| **F-08** | `task_orchestrate` missing `priority` | **UNCHANGED** | Live schema props = `['task','strategy']` only; no `priority`. protocol-server.ts L846. |
| **F-09** | QE bridge hardcodes `category:'domain'` | **UNCHANGED** | `qe-tool-bridge.ts` L99 still `category: 'domain'` for all 26 bridged tools. |
| **F-10** | `process.exit()` count grew 41→49 | **RECONCILED / IMPROVED** | Prior "49" was src-wide non-CLI count. Shared snapshot v3.10.6 = 54 src-wide (+2). In `src/mcp/` specifically only **4 real calls** (entry.ts ×3 L65/L82/L327, protocol-server.ts ×1 L542); other grep hits are comments. MCP boundary is not the worsening vector. |
| **F-11** | `handleShutdown` race | **UNCHANGED** | protocol-server.ts L540-543: `setTimeout(() => { this.stop(); process.exit(0); }, 100)` — `this.stop()` still not awaited. |
| **F-12** | No MCP tool-parity integration test | **UNCHANGED** | No `tests/**/mcp-tool-parity*` or `protocol-server*` snapshot test; 86-tool contract still unlocked. |

**Remediation tally**: 1 FIXED (the CRITICAL) + 1 PARTIAL-improved + 1 reconciled-improved + 1 minor-regression + 8 unchanged.

---

## Live MCP Enumeration (v3.10.6)

Captured via stdio handshake (`initialize` + `tools/list`), parsed from `/tmp/mcp-out.jsonl`:

- Startup log (`/tmp/mcp-stderr.log`): `[MCP] Registered 86 tools (26 via QE bridge)` — **unchanged from v3.9.13**.
- **TOTAL TOOLS: 86** (confirmed by parsing the `tools/list` result).
- 60 flat snake_case + 26 `qe/*` slash-form.
- `validation_pipeline` present in live list (new ADR-105..110 surface).
- Tools advertising `properties` but empty `required[]`: **29** (raw count; many are intentionally all-optional, e.g. `fleet_status`, `routing_metrics`, `agent_list`, `task_list` take no required input — this is correct, not a defect).

**Reconciliation**: 86 matches prior run exactly. `validation_pipeline` is a net-new tool name in the inventory but the total held at 86 — the QE bridge count (26) and flat count (60) are both unchanged, so the additions/removals balanced. The binary self-reports **v3.10.4** while package.json is **3.10.6** (see N-04 — likely stale `dist/`, not a source bug).

---

## New Findings

### HIGH

#### N-01: Tool-execution failures return `{error}` WITHOUT `isError: true` (HIGH)

**File**: `src/mcp/protocol-server.ts` L698-734

The handler catch block returns `{ content: [{ type:'text', text: JSON.stringify({ error: ... }) }] }` (L728-733) but does **not** set `isError: true` on the response envelope. Only the loop-detection block (L601-604) sets `isError: true`. Per MCP spec, tool execution errors should set `isError` so clients can distinguish failures from successful results that happen to contain an `error` field. As written, a downstream tool failure is indistinguishable at the JSON-RPC envelope level from success — clients must string-parse the `text` payload.

Compounding this, error shapes are inconsistent across handlers: `{ error: ... }` (L732, L1617, L1680), `{ success: false, error: ... }` (L306, L1534, and validation-pipeline-handler.ts L88/L96/L102), and AG-UI `{ success:false, error }` (L719-721). Three different failure contracts coexist.

**Recommendation**: Set `isError: true` in the L728 catch return; standardise on `{ success: false, error }` for handler bodies.

#### N-02: No input validation at the MCP boundary — `required` is advertised but not enforced (HIGH, deepens F-02)

`buildInputSchema` (L551) emits the `required` array into the advertised schema, but the transport (`handleToolsCall` L557-734) does **not** validate incoming `arguments` against it before invoking the handler. Enforcement is ad-hoc and per-handler (only `advisor_consult` L1614-1621 checks). So a client calling `coverage_analyze_sublinear({})` — which advertises `required:["target"]` — is not rejected at the boundary; it reaches the handler with `undefined`. The advertised contract and the enforced contract diverge. This is the runtime half of the missing-Zod gap.

**Recommendation**: Add a single boundary validator in `handleToolsCall` that checks `arguments` against each tool's `required[]` (and ideally types) before dispatch — closes both F-03 enforcement and N-02 in one place. Zod adoption (still zero) would subsume this.

### MEDIUM

#### N-03: `validation_pipeline` (new ADR-105..110 tool) ships with no `required[]` despite XOR contract (MEDIUM)

**File**: protocol-server.ts L1432; handler `src/mcp/handlers/validation-pipeline-handler.ts`

The tool requires **either** `filePath` **or** `content` (handler L101-103 returns `{success:false, error:"Either 'filePath' or 'content' parameter is required."}`). The advertised schema marks neither as required (correct for XOR), but there is no JSON-Schema `oneOf`/`anyOf` expressing the constraint, so clients only learn the requirement by triggering a runtime error. The handler's error contract is otherwise clean and consistent (`{success, error}` throughout, uses `toErrorMessage` shared util). The `evidenceClass`/`needsVerification` fields (handler L54/L63/L180/L186-190) are wired correctly — this is a documentation/schema-expressiveness gap, not a functional break.

**Recommendation**: Add `anyOf: [{required:["filePath"]},{required:["content"]}]` to the advertised schema.

### LOW

#### N-04: dist binary self-reports v3.10.4 while package.json is 3.10.6 (LOW)

Startup log: `[agentic-qe-v3] MCP server starting v3.10.4` / `agentic-qe-v3 v3.10.4 started`, but `package.json` = 3.10.6. `dist/cli/index.js` is dated Jun 11 (pre-3.10.6 tag). Both servers read version from `package.json` at runtime (the v3.9.13 fix), so this is a **stale build artifact**, not a hardcode regression — a fresh `npm run build` would self-correct. Flagging because the audit ran against the committed `dist/`. Not a contract defect.

---

## MCP ↔ CLI Parity (spot-check, 3 pairs)

| Pair | MCP shape | CLI command | CLI `--json`? | Verdict |
|---|---|---|---|---|
| `aqe_health` | JSON object | `aqe health` | **No** — `error: unknown option '--json'` | **Drift (unchanged)** — CLI banner-only |
| `fleet_status` | JSON (domains, metrics) | `aqe fleet status` | **No** — `error: unknown option '--json'` | **Drift (unchanged)** — CLI banner-only |
| `memory_usage` | JSON `{success,...}` | `aqe memory usage --json` | Yes | **Parity OK** (still emits init log noise to stdout before JSON — minor) |

Confirmed live: `aqe health --json` and `aqe fleet status --json` both error `unknown option '--json'`. The MCP-vs-CLI shape drift called out at v3.9.13 is **unchanged**. Per the project's MCP-CLI parity rule, these two commands remain un-parseable by MCP clients that shell out. (Tracked in user memory; LOW.)

---

## Score Justification: 7.6 / 10 (+0.6 vs v3.9.13)

| Dimension | v3.9.13 | v3.10.6 | Rationale |
|---|---|---|---|
| Protocol Consistency | 9 | 9 | 86-tool handshake clean; total stable; `validation_pipeline` integrated |
| Tool Interface Consistency | 6 | 6 | Naming divergence (F-06) + QE category (F-09) unchanged |
| Type Safety | 3 | 3 | 43/47 casts unchanged; Zod still zero |
| Error Handling | 5 | 5 | Shutdown race unchanged; new N-01 isError gap surfaced (was latent) |
| Resource Management | 5 | 4.5 | Listener registrations +12 with no cleanup parity; minor regression |
| Required-param hygiene | 5 | 7 | 5 of prior-12 closed; advisor_consult enforced at runtime |
| ADR-092 `advisor_consult` | 6 | 9 | CRITICAL contract bug FIXED + re-categorised |
| ADR-105..110 surface (new) | — | 7 | `validation_pipeline` clean handler/`{success,error}` shape; schema XOR not expressed (N-03) |
| Test Coverage | 4 | 4 | No MCP parity snapshot test (F-12) |
| **Overall** | **7.0** | **7.6** | CRITICAL retired + required-hygiene gains; structural type-safety debt frozen |

---

## Findings Summary

| ID | Severity | Title | Weight |
|---|---|---|---|
| N-01 | HIGH | Tool-failure responses omit `isError:true`; 3 inconsistent error shapes | 2 |
| N-02 | HIGH | No boundary input validation — `required` advertised but unenforced | 2 |
| F-02 (carry) | HIGH | 43/47 `as unknown as`; zero Zod | 2 |
| F-04 (carry) | MEDIUM→regressed | EventEmitter 135 on / 27 off / 0 setMaxListeners | 1 |
| F-05 (carry) | MEDIUM | `E2EExecuteTool` dead code | 1 |
| F-08 (carry) | MEDIUM | `task_orchestrate` missing `priority` | 1 |
| N-03 | MEDIUM | `validation_pipeline` XOR not expressed in schema | 1 |
| F-11 (carry) | LOW | `handleShutdown` race (unawaited `this.stop()`) | 0.5 |
| F-12 (carry) | LOW | No MCP tool-parity snapshot test | 0.5 |

**Weighted Score**: 3×2 + 4×1 + 2×0.5 = **11.0** (PASS, threshold 2.0). 0 CRITICAL.

---

## P0 Count: 0

The only prior P0 in this dimension (`advisor_consult` empty-string contract, ADR-092 F-01) is FIXED. No new P0s. Highest open severity is HIGH (N-01, N-02, type-safety debt).

---

## Files Examined

| File | Line evidence |
|---|---|
| `src/mcp/protocol-server.ts` | L540-543 (shutdown), L551 (buildInputSchema), L601-604/698-734 (error path), L846 (task_orchestrate), L993-1002/1056-1075 (required gaps), L1432 (validation_pipeline), L1593-1682 (advisor_consult), L1686-1687 (bridge count) |
| `src/mcp/handlers/validation-pipeline-handler.ts` | L54/63/180/186-190 (evidenceClass/needsVerification), L87-103 (XOR error contract) |
| `src/mcp/qe-tool-bridge.ts` | L99 (category hardcode) |
| `src/mcp/tools/test-execution/index.ts` | L8 (dead E2E export) |
| `src/mcp/tools/test-execution/e2e-execute.ts` | exists, unregistered |
| `src/mcp/entry.ts` | L65/82/327 (process.exit) |
| `package.json` | version 3.10.6; no `zod` dep |
| `/tmp/mcp-out.jsonl` | live `tools/list` (86 tools), advisor_consult + validation_pipeline schemas |
| `/tmp/mcp-stderr.log` | startup log `Registered 86 tools (26 via QE bridge)`, `v3.10.4 started` |

---

## Shared Memory

- **api-contracts-1**: `advisor_consult` ADR-092 empty-string contract bug FIXED in v3.10.6 — `required:true` on agent+task (protocol-server.ts L1597-98) + runtime non-empty validation (L1614-21) + re-categorised 'routing'. Prior CRITICAL F-01 retired; P0 count for this dimension = 0.
- **api-contracts-2**: MCP tool inventory STABLE at 86 (60 flat + 26 QE bridge) per live handshake; new ADR-105..110 `validation_pipeline` tool integrated (handler carries evidenceClass/needsVerification) without growing the total.
- **api-contracts-3**: Type-safety debt FROZEN — 43 `as unknown as` in protocol-server.ts (47 across src/mcp), zero Zod (not in package.json). The advertised `required[]` is NOT enforced at the MCP boundary; only advisor_consult validates per-handler (N-02).
- **api-contracts-4**: NEW — tool-execution failures return `{error}` without `isError:true` (protocol-server.ts L728-733); three inconsistent error shapes coexist (`{error}` / `{success:false,error}` / AG-UI). Clients must string-parse to detect failure (N-01).
- **api-contracts-5**: EventEmitter leak REGRESSED minor — 135 `.on()` (+12) vs 27 cleanup (+1) vs 0 `setMaxListeners`; hotspots unchanged (sse 6/0, websocket 10/1, test-executor 4/0).
- **api-contracts-6**: MCP↔CLI parity drift UNCHANGED — `aqe health` and `aqe fleet status` still reject `--json` ("unknown option"); MCP equivalents return JSON. Banner-only CLI un-parseable by shell-out MCP clients. Also: dist binary self-reports v3.10.4 vs package.json 3.10.6 (stale build, not a hardcode).

**Score: 7.6 / 10 (+0.6 vs v3.9.13). P0 count: 0.**
