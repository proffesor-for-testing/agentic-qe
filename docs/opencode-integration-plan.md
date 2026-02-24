# AQE Fleet on OpenCode - Implementation/Integration Plan

**Version**: 1.0.0
**Date**: 2026-02-24
**AQE Version**: v3.7.0
**OpenCode Target**: v1.2.10+
**Execution Model**: claude-flow swarm with shared memory

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Workstream Definitions](#3-workstream-definitions)
4. [Task Breakdown with Dependencies](#4-task-breakdown-with-dependencies)
5. [Agent Assignments](#5-agent-assignments)
6. [Memory Namespace Design](#6-memory-namespace-design)
7. [Phase Gates](#7-phase-gates)
8. [Risk Register](#8-risk-register)
9. [Effort Estimates](#9-effort-estimates)

---

## 1. Executive Summary

This plan integrates the AQE v3 fleet (75 AQE+platform skills, 40+ MCP tools, 13 DDD domains, ReasoningBank learning, HNSW vector search) into the OpenCode ecosystem (anomalyco/opencode). The integration uses three complementary surface areas:

1. **MCP Server** -- AQE's existing `aqe-mcp` binary exposes all 20+ QE tools via MCP protocol. OpenCode natively supports MCP servers. This is the primary integration path.
2. **OpenCode Plugin** -- A thin `@opencode-ai/plugin` wrapper that maps OpenCode lifecycle hooks (`onToolCallBefore/After`, `onSessionPromptBefore/After`) to AQE's PreToolUse/PostToolUse/UserPromptSubmit hooks.
3. **OpenCode Custom Agents/Tools/Skills** -- AQE skills translated to `.opencode/agents/`, `.opencode/tools/`, and `.opencode/skills/` conventions.

The plan is organized into 5 workstreams that can execute in parallel after a shared foundation phase.

---

## 2. Architecture Overview

```
+-------------------------------------------------------------------+
|                        OpenCode Runtime                            |
|                                                                    |
|  .opencode/agents/     .opencode/tools/     .opencode/skills/     |
|  (AQE QE agents)       (AQE custom tools)   (AQE skill chains)   |
|                                                                    |
|  @opencode-ai/plugin: aqe-opencode-plugin                        |
|  - onToolCallBefore  -> AQE PreToolUse hooks                     |
|  - onToolCallAfter   -> AQE PostToolUse hooks                    |
|  - onSessionPromptBefore -> AQE UserPromptSubmit                  |
|  - onSessionPromptAfter  -> AQE learning capture                  |
|                                                                    |
+------------------------------|------------------------------------+
                               | MCP (stdio/SSE)
                               v
+-------------------------------------------------------------------+
|                      AQE MCP Server                                |
|  (aqe-mcp binary / npx agentic-qe mcp)                           |
|                                                                    |
|  40+ MCP tools across 13 domains:                                 |
|  - fleet_init, agent_spawn, task_orchestrate                      |
|  - test_generate_enhanced, test_execute_parallel                  |
|  - coverage_analyze_sublinear, quality_assess                     |
|  - security_scan_comprehensive, defect_predict                    |
|  - memory_store, memory_query (HNSW vector search)                |
|  - model_route (3-tier routing)                                   |
|  - infra_healing_*                                                |
|  - team_* (agent team coordination)                               |
|                                                                    |
|  ToolRegistry (O(1) lookup, lazy loading, domain detection)       |
|  ConnectionPool + LoadBalancer + PerformanceMonitor               |
+-------------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------------+
|                    AQE v3 Kernel                                   |
|  UnifiedMemory (.agentic-qe/memory.db)                           |
|  ReasoningBank (22+ patterns, HNSW indexing)                      |
|  CrossPhaseHookExecutor                                           |
|  DreamConsolidation + ExperienceCapture                           |
|  StrangeLoop self-healing                                         |
|  3-tier model routing (WASM -> Haiku -> Sonnet/Opus)             |
+-------------------------------------------------------------------+
```

### Integration Surface Mapping

| AQE Concept | OpenCode Equivalent | Integration Strategy |
|---|---|---|
| MCP tools (40+) | MCP server config | Direct -- `opencode.json` mcp block |
| PreToolUse hooks | `onToolCallBefore` plugin hook | Plugin adapter |
| PostToolUse hooks | `onToolCallAfter` plugin hook | Plugin adapter |
| UserPromptSubmit | `onSessionPromptBefore` plugin hook | Plugin adapter |
| SessionStart/Stop | `onSessionPromptBefore` (first) / session end | Plugin lifecycle |
| Task routing (3-tier) | `onSessionPromptBefore` + model hints | Plugin + agent config |
| Skills (75 AQE) | `.opencode/skills/` composite sequences | Skill translator |
| Agent types (60+) | `.opencode/agents/` custom agents | Agent config generator |
| StatusLine | N/A (OpenCode has its own UI) | Skip |
| ReasoningBank learning | Persisted via MCP memory tools | Transparent |
| HNSW vector search | Exposed via `memory_query` MCP tool | Transparent |

---

## 3. Workstream Definitions

### Parallel Execution Map

```
Phase 0: Foundation (sequential, blocks everything)
  |
  +---> WS1: MCP Server Packaging (parallel)
  |
  +---> WS2: Plugin Development (parallel)
  |
  +---> WS3: Agent/Skill Translation (parallel)
  |
  +---> WS4: Provider Degradation & Context Management (parallel)
  |
  +---> WS5: Testing & Validation (starts after WS1-WS4 produce artifacts)
```

### WS0: Foundation (Sequential)

Shared infrastructure that all workstreams depend on.

### WS1: MCP Server Packaging

Package and configure `aqe-mcp` for zero-friction OpenCode consumption. This is the highest-value workstream because OpenCode already speaks MCP natively.

### WS2: OpenCode Plugin Development

Build the `aqe-opencode-plugin` npm package using `@opencode-ai/plugin` SDK. Maps AQE lifecycle hooks to OpenCode plugin hooks.

### WS3: Agent/Skill Translation

Convert AQE's 75 skills and 60+ agent types into OpenCode's `.opencode/agents/`, `.opencode/tools/`, and `.opencode/skills/` conventions.

### WS4: Provider Degradation & Context Management

Handle the fact that OpenCode is provider-agnostic (Claude, GPT, Gemini, local models) while AQE's skills assume Claude-level reasoning. Also handle the ~40k token compaction window.

### WS5: Testing & Validation

End-to-end integration tests, smoke tests, and documentation.

---

## 4. Task Breakdown with Dependencies

### WS0: Foundation

| ID | Task | Description | Depends On | Deliverable | Effort |
|---|---|---|---|---|---|
| F1 | Audit OpenCode plugin SDK | Read `@opencode-ai/plugin` types, understand hook signatures, tool SDK, agent config format | -- | Memory note: `opencode/plugin-sdk-audit` | 2h |
| F2 | Audit OpenCode config schema | Map `opencode.json` structure: MCP servers, agents, tools, skills, permissions | -- | Memory note: `opencode/config-schema` | 1h |
| F3 | Map AQE MCP tools to OpenCode tool schemas | Verify all 40+ MCP tool input/output schemas are compatible with OpenCode's Zod-based tool SDK | F1 | Compatibility matrix in memory: `opencode/tool-compat-matrix` | 3h |
| F4 | Create shared type definitions | TypeScript types shared between plugin, tools, and agent configs | F1, F2 | `packages/aqe-opencode-types/` | 2h |
| F5 | Set up monorepo structure | Create `packages/` dir with `aqe-opencode-plugin`, `aqe-opencode-tools`, `aqe-opencode-agents` | -- | `packages/` directory | 1h |

### WS1: MCP Server Packaging

| ID | Task | Description | Depends On | Deliverable | Effort |
|---|---|---|---|---|---|
| M1 | Create OpenCode MCP config | Generate `opencode.json` MCP server block pointing to `aqe-mcp` binary or `npx agentic-qe mcp` | F2 | `opencode.json` MCP section | 1h |
| M2 | Tool output compaction adapter | AQE MCP tool results can exceed 40k tokens. Add response truncation/summarization middleware in MCP server that respects OpenCode's compaction window. Implement `Content-Length` header estimation and auto-summarize for large results (coverage reports, test generation output). | F3 | `v3/src/mcp/middleware/output-compaction.ts` | 4h |
| M3 | MCP server health endpoint | Add `aqe/health` MCP tool that returns server status, loaded domains, memory stats -- useful for OpenCode's agent startup verification | -- | New MCP tool handler | 2h |
| M4 | MCP server SSE transport | OpenCode supports remote MCP servers via SSE. AQE currently uses stdio. Add SSE transport option for remote/docker deployments | -- | `v3/src/mcp/transport/sse-transport.ts` | 4h |
| M5 | Tool description optimization | OpenCode uses tool descriptions for context injection. Optimize all 40+ AQE tool descriptions for clarity within OpenCode's tool display format. Add usage examples in descriptions. | F3 | Updated tool definitions | 2h |
| M6 | npx one-liner setup | Ensure `npx agentic-qe mcp` works as a one-liner for OpenCode MCP config. Test cold-start latency (<5s). | M1 | Verified npm package | 1h |

### WS2: OpenCode Plugin Development

| ID | Task | Description | Depends On | Deliverable | Effort |
|---|---|---|---|---|---|
| P1 | Plugin scaffold | Create `packages/aqe-opencode-plugin/` with `@opencode-ai/plugin` dependency, TypeScript config, build pipeline | F4, F5 | Plugin package skeleton | 2h |
| P2 | `onToolCallBefore` hook | Map to AQE PreToolUse behavior: file guard (prevent overwrite of .db files), pre-edit analysis, pre-command safety check. Must translate OpenCode's tool call format to AQE's `$TOOL_INPUT_*` variables. | P1 | `src/hooks/on-tool-call-before.ts` | 4h |
| P3 | `onToolCallAfter` hook | Map to AQE PostToolUse behavior: post-edit learning capture, post-command pattern extraction, experience recording to ReasoningBank via MCP `memory_store`. | P1 | `src/hooks/on-tool-call-after.ts` | 3h |
| P4 | `onSessionPromptBefore` hook | Map to AQE UserPromptSubmit: 3-tier model routing hint injection, ReasoningBank pattern matching for the prompt, guidance context injection. Must respect OpenCode's prompt modification API. | P1 | `src/hooks/on-session-prompt-before.ts` | 4h |
| P5 | `onSessionPromptAfter` hook | Capture session outcomes: success/failure signals, pattern promotion triggers, dream consolidation inputs. | P1 | `src/hooks/on-session-prompt-after.ts` | 2h |
| P6 | Plugin configuration schema | Define plugin config: enable/disable individual hooks, set memory DB path, configure domains, set token budget. Use Zod for validation. | P1 | `src/config.ts` | 2h |
| P7 | Session lifecycle management | Handle OpenCode session start/end: initialize AQE kernel, warm HNSW indexes, save session state on exit. Map to AQE's SessionStart/Stop hooks. | P2-P5 | `src/lifecycle.ts` | 3h |
| P8 | Model routing integration | Use `onSessionPromptBefore` to analyze prompt complexity and inject model routing hints. Map AQE's 3-tier routing (WASM/Haiku/Sonnet-Opus) to OpenCode's provider-agnostic model selection. | P4 | `src/routing/model-router.ts` | 4h |

### WS3: Agent/Skill Translation

| ID | Task | Description | Depends On | Deliverable | Effort |
|---|---|---|---|---|---|
| A1 | Agent config generator | Script that reads AQE `.claude/agents/` definitions and generates `.opencode/agents/*.yaml` configs. Each agent gets: system prompt, allowed tools (MCP tool names), model preferences, permission level. | F1, F2 | `scripts/generate-opencode-agents.ts` | 4h |
| A2 | Generate priority agent configs | Hand-craft the top 10 most-used QE agent configs for OpenCode: `qe-test-architect`, `qe-coverage-specialist`, `qe-security-scanner`, `qe-code-reviewer`, `qe-defect-predictor`, `qe-chaos-engineer`, `qe-requirements-analyst`, `qe-performance-engineer`, `qe-a11y-auditor`, `qe-learning-optimizer`. | A1 | `.opencode/agents/qe-*.yaml` (10 files) | 6h |
| A3 | Skill translator | Script that reads AQE `.claude/skills/*/SKILL.md` (75 skills) and converts to `.opencode/skills/*.yaml` format. Map SKILL.md phases to OpenCode skill steps (composite tool sequences). | F1 | `scripts/generate-opencode-skills.ts` | 5h |
| A4 | Generate priority skill configs | Hand-craft the top 15 critical skills: `debug-loop`, `tdd-london-chicago`, `security-testing`, `performance-testing`, `exploratory-testing-advanced`, `code-review-quality`, `api-testing-patterns`, `chaos-engineering-resilience`, `contract-testing`, `accessibility-testing`, `mutation-testing`, `risk-based-testing`, `test-design-techniques`, `regression-testing`, `compliance-testing`. | A3 | `.opencode/skills/qe-*.yaml` (15 files) | 8h |
| A5 | Custom tool wrappers | Create `.opencode/tools/` TypeScript tools that wrap complex AQE MCP tool sequences into single-call operations. Examples: `qe-full-audit` (runs quality + security + coverage in parallel), `qe-test-and-verify` (generate + execute + coverage gap). Use OpenCode's tool SDK with Zod schemas. | F4 | `.opencode/tools/qe-*.ts` (5-8 files) | 6h |
| A6 | QCSD swarm skills | Translate the 4 QCSD phase swarms (ideation, refinement, development, CICD) into OpenCode skills that use the `task` tool for parallel subagent execution. | A3, A4 | `.opencode/skills/qcsd-*.yaml` (4 files) | 4h |
| A7 | Permission mapping | Map AQE's permission model (allow/deny per tool) to OpenCode's permission system (allow/ask/deny per agent). Generate default permission configs. | A2 | `.opencode/permissions.yaml` | 2h |

### WS4: Provider Degradation & Context Management

| ID | Task | Description | Depends On | Deliverable | Effort |
|---|---|---|---|---|---|
| D1 | Provider capability matrix | Document which AQE skills/tools work with which model providers. Categories: (a) Claude-only (needs extended thinking), (b) Claude/GPT (needs strong reasoning), (c) Any provider (mechanical tasks), (d) Local-safe (no API needed). | F3 | `docs/provider-capability-matrix.md` + memory entry | 3h |
| D2 | Skill complexity classifier | Add metadata to each skill indicating minimum model capability needed. Use AQE's existing `ComplexityLevel` type. Tag each of the 75 skills with: `tier1-any` (simple transforms), `tier2-good` (needs GPT-4/Claude-Haiku level), `tier3-best` (needs Claude-Sonnet/Opus/GPT-4o level). | D1 | Updated `skills-manifest.json` with `minModelTier` field | 4h |
| D3 | Graceful degradation middleware | In the plugin's `onSessionPromptBefore`, detect current provider/model and: (a) warn if skill requires higher tier than available, (b) suggest alternative simpler skill, (c) add extra guidance context for weaker models. | D2, P4 | `src/degradation/graceful-degradation.ts` | 4h |
| D4 | Context window budget manager | Track token usage across a session. When approaching OpenCode's ~40k compaction window: (a) summarize ReasoningBank pattern matches instead of full content, (b) reduce guidance injection size, (c) use skill-specific context budgets. Integrate with AQE's `TokenMetricsCollector`. | P4 | `src/context/budget-manager.ts` | 5h |
| D5 | LSP integration bridge | OpenCode has native LSP integration. AQE's `code-intelligence` domain can leverage LSP data (symbols, references, diagnostics) instead of building its own AST. Create a bridge that feeds OpenCode LSP data into AQE's code intelligence tools. | F3 | `src/lsp/lsp-bridge.ts` | 4h |
| D6 | Output format adapters | AQE tool outputs are designed for Claude Code's rendering. OpenCode may render differently. Create output format adapters that produce clean markdown for OpenCode's display. | M2 | `src/adapters/output-formatter.ts` | 2h |

### WS5: Testing & Validation

| ID | Task | Description | Depends On | Deliverable | Effort |
|---|---|---|---|---|---|
| T1 | MCP integration test harness | Test that OpenCode can discover and invoke all 40+ AQE MCP tools. Use a mock OpenCode client that exercises the MCP protocol. | M1-M6 | `tests/integration/mcp-opencode.test.ts` | 4h |
| T2 | Plugin hook tests | Unit tests for each plugin hook. Mock OpenCode's hook API and verify AQE behavior fires correctly. | P2-P5 | `tests/unit/plugin-hooks.test.ts` | 3h |
| T3 | Agent config validation | Validate all generated `.opencode/agents/` configs against OpenCode's agent schema. Ensure system prompts are within token limits. | A2 | `tests/validation/agent-configs.test.ts` | 2h |
| T4 | Skill translation validation | Validate all generated `.opencode/skills/` configs. Ensure tool references match actual MCP tool names. | A4, A6 | `tests/validation/skill-configs.test.ts` | 2h |
| T5 | Provider degradation tests | Test graceful degradation with mock providers at each tier. Verify warning messages and fallback behavior. | D3 | `tests/unit/degradation.test.ts` | 2h |
| T6 | Context budget tests | Test budget manager with simulated large tool outputs. Verify compaction triggers at correct thresholds. | D4 | `tests/unit/budget-manager.test.ts` | 2h |
| T7 | End-to-end smoke test | Run a real OpenCode session with AQE MCP server, plugin, and agents. Execute: generate tests, run coverage, security scan, quality gate. | T1-T6 | `tests/e2e/opencode-aqe-smoke.test.ts` | 6h |
| T8 | Documentation | Usage guide: installation, configuration, available agents/skills/tools, troubleshooting. | T7 | `docs/opencode-integration-guide.md` | 4h |

---

## 5. Agent Assignments

### Swarm Configuration

```bash
npx @claude-flow/cli@latest swarm init \
  --topology hierarchical \
  --max-agents 8 \
  --strategy specialized
```

### Agent Roles

| Agent ID | Type | Workstream | Responsibilities |
|---|---|---|---|
| `coord-opencode` | `hierarchical-coordinator` | All | Orchestration, phase gate checks, memory coordination |
| `mcp-packager` | `coder` | WS1 | MCP server packaging, transport, middleware |
| `plugin-dev` | `coder` | WS2 | OpenCode plugin development |
| `skill-translator` | `coder` | WS3 | Agent/skill/tool translation scripts and configs |
| `provider-eng` | `performance-engineer` | WS4 | Provider degradation, context management |
| `tester` | `tester` | WS5 | Integration tests, validation, smoke tests |
| `researcher` | `researcher` | WS0, WS4 | OpenCode SDK audit, provider capability research |
| `reviewer` | `reviewer` | All | Code review, quality gates, cross-workstream consistency |

### Agent Spawn Commands

```javascript
// Coordinator (spawned first)
Task({ prompt: "Coordinate AQE-OpenCode integration", subagent_type: "hierarchical-coordinator", run_in_background: true })

// Parallel workers (spawned together in one message)
Task({ prompt: "WS1: Package AQE MCP server for OpenCode", subagent_type: "coder", run_in_background: true })
Task({ prompt: "WS2: Build aqe-opencode-plugin", subagent_type: "coder", run_in_background: true })
Task({ prompt: "WS3: Translate AQE skills to OpenCode format", subagent_type: "coder", run_in_background: true })
Task({ prompt: "WS4: Provider degradation and context mgmt", subagent_type: "performance-engineer", run_in_background: true })
```

---

## 6. Memory Namespace Design

All agents share the same UnifiedMemory instance (`.agentic-qe/memory.db`) with namespaced keys for cross-agent knowledge sharing.

### Namespace Schema

| Namespace | Purpose | Key Pattern | Example |
|---|---|---|---|
| `opencode/audit` | SDK and schema audit findings | `opencode/audit/{topic}` | `opencode/audit/plugin-sdk-hooks` |
| `opencode/compat` | Tool/skill compatibility data | `opencode/compat/{tool-name}` | `opencode/compat/test_generate_enhanced` |
| `opencode/config` | Generated OpenCode configs | `opencode/config/{type}/{name}` | `opencode/config/agent/qe-test-architect` |
| `opencode/provider` | Provider capability data | `opencode/provider/{provider}/{capability}` | `opencode/provider/openai/reasoning-tier` |
| `opencode/decisions` | Architecture decisions made | `opencode/decisions/{id}` | `opencode/decisions/d001-mcp-transport` |
| `opencode/blockers` | Issues requiring cross-workstream resolution | `opencode/blockers/{id}` | `opencode/blockers/b001-token-limit` |
| `opencode/progress` | Task completion status per workstream | `opencode/progress/{ws}/{task}` | `opencode/progress/ws1/m2-compaction` |

### Memory Operations

```typescript
// Agent stores a finding
await mcp__agentic_qe__memory_store({
  key: "opencode/audit/plugin-sdk-hooks",
  namespace: "opencode",
  value: {
    hooks: ["onToolCallBefore", "onToolCallAfter", "onSessionPromptBefore", "onSessionPromptAfter"],
    signatures: { /* ... */ },
    limitations: ["no async generators", "max 5s timeout"]
  }
});

// Another agent queries findings
await mcp__agentic_qe__memory_query({
  namespace: "opencode",
  pattern: "opencode/audit/*"
});

// Semantic search across all integration knowledge
await mcp__agentic_qe__memory_query({
  namespace: "opencode",
  pattern: "how does OpenCode handle tool output truncation",
  semantic: true
});
```

### Cross-Agent Communication Protocol

1. **Findings**: When an agent discovers something relevant to other workstreams, store in `opencode/compat/` or `opencode/audit/` and broadcast via `team_broadcast`.
2. **Blockers**: When an agent is blocked by another workstream's output, store in `opencode/blockers/` with the blocking workstream ID.
3. **Decisions**: Architecture decisions that affect multiple workstreams go in `opencode/decisions/` with rationale.
4. **Progress**: Each agent updates `opencode/progress/{ws}/{task}` on completion.

---

## 7. Phase Gates

### Gate 0: Foundation Complete

**Criteria (all must pass)**:
- [ ] OpenCode plugin SDK hook signatures documented in memory (`opencode/audit/plugin-sdk-hooks`)
- [ ] OpenCode config schema documented in memory (`opencode/audit/config-schema`)
- [ ] Tool compatibility matrix generated (`opencode/compat/*` for all 40+ tools)
- [ ] Shared type package compiles without errors
- [ ] Monorepo structure created with all package scaffolds

**Verification**:
```bash
# Check memory entries exist
npx agentic-qe memory list --namespace opencode --limit 50
# Verify type package
cd packages/aqe-opencode-types && npm run build
```

### Gate 1: MCP Integration Verified

**Criteria**:
- [ ] `opencode.json` MCP config connects to `aqe-mcp` server
- [ ] All 40+ MCP tools discoverable via OpenCode's tool listing
- [ ] Output compaction middleware prevents >40k token responses
- [ ] Health endpoint returns valid status
- [ ] Cold-start latency <5s for `npx agentic-qe mcp`

**Verification**:
```bash
# Start MCP server and verify tool listing
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | npx agentic-qe mcp
# Test output compaction
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"coverage_analyze_sublinear","arguments":{"target":"."}},"id":2}' | npx agentic-qe mcp
```

### Gate 2: Plugin Hooks Functional

**Criteria**:
- [ ] All 4 plugin hooks (`onToolCallBefore`, `onToolCallAfter`, `onSessionPromptBefore`, `onSessionPromptAfter`) fire correctly
- [ ] PreToolUse guards prevent `.db` file overwrites
- [ ] PostToolUse captures experience to ReasoningBank
- [ ] Model routing hints injected for high-complexity prompts
- [ ] Plugin configurable (enable/disable hooks, set domains)
- [ ] No hook adds >100ms latency to tool calls

**Verification**:
```bash
npm test -- --run tests/unit/plugin-hooks.test.ts
```

### Gate 3: Agents & Skills Available

**Criteria**:
- [ ] At least 10 QE agent configs generated and valid
- [ ] At least 15 QE skill configs generated and valid
- [ ] At least 5 custom tool wrappers functional
- [ ] 4 QCSD swarm skills translated
- [ ] All tool references in skills resolve to actual MCP tools
- [ ] Permission configs generated

**Verification**:
```bash
npm test -- --run tests/validation/agent-configs.test.ts tests/validation/skill-configs.test.ts
```

### Gate 4: Degradation & Context Handling

**Criteria**:
- [ ] Provider capability matrix covers Claude, GPT-4, GPT-4o, Gemini, local (ollama)
- [ ] All 75 skills tagged with `minModelTier`
- [ ] Graceful degradation warns on underpowered models
- [ ] Context budget manager keeps sessions under 40k tokens
- [ ] LSP bridge feeds data to code-intelligence tools

**Verification**:
```bash
npm test -- --run tests/unit/degradation.test.ts tests/unit/budget-manager.test.ts
```

### Gate 5: End-to-End Validated

**Criteria**:
- [ ] Smoke test passes: OpenCode + AQE MCP + plugin + agents run a complete QE workflow
- [ ] Documentation covers installation, config, usage, troubleshooting
- [ ] No P0/P1 bugs remaining
- [ ] Performance: <5s cold start, <100ms hook latency, <2s tool invocation average

**Verification**:
```bash
npm test -- --run tests/e2e/opencode-aqe-smoke.test.ts
```

---

## 8. Risk Register

| ID | Risk | Impact | Probability | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | OpenCode plugin SDK changes before release | High | Low | Pin `@opencode-ai/plugin` version. Wrap all SDK calls in adapter layer. | plugin-dev |
| R2 | MCP tool output exceeds 40k token compaction window | High | High | Output compaction middleware (task M2). Streaming for large results. | mcp-packager |
| R3 | Provider quality too low for complex skills | Medium | High | Graceful degradation (task D3). Skill tiering (task D2). Fallback to simpler skills. | provider-eng |
| R4 | Cold-start latency too high for npx | Medium | Medium | Precompile MCP server bundle. Consider global install option. Cache node_modules. | mcp-packager |
| R5 | Skill translation loses semantic fidelity | Medium | Medium | Hand-craft top 15 priority skills (task A4). Validate with SME review. | skill-translator |
| R6 | HNSW index memory pressure in constrained environments | Low | Medium | Lazy HNSW loading. Progressive index building. Config option to disable. | mcp-packager |
| R7 | OpenCode permission model too coarse for AQE's needs | Low | Low | Map to closest permission level. Document gaps. | skill-translator |
| R8 | ReasoningBank patterns not portable across providers | Medium | Medium | Store provider-agnostic patterns. Tag provider-specific ones. Filter on retrieval. | provider-eng |
| R9 | Plugin hook timeout causes OpenCode UI lag | High | Medium | Set strict timeouts (100ms for before hooks, 500ms for after hooks). Async processing for heavy work. | plugin-dev |
| R10 | Skill count (93) overwhelms OpenCode's skill discovery | Low | Medium | Categorize skills. Surface top 15 by default. Let users opt into categories. | skill-translator |

---

## 9. Effort Estimates

### Summary by Workstream

| Workstream | Tasks | Total Effort | Calendar (parallel) |
|---|---|---|---|
| WS0: Foundation | 5 | 9h | 2 days |
| WS1: MCP Server | 6 | 14h | 3 days |
| WS2: Plugin Dev | 8 | 24h | 5 days |
| WS3: Agent/Skill Translation | 7 | 35h | 5 days |
| WS4: Provider/Context | 6 | 22h | 4 days |
| WS5: Testing | 8 | 25h | 4 days |
| **Total** | **40** | **129h** | **~12 days** (with parallelism) |

### Critical Path

```
F1,F2 (2d) -> Gate 0 -> [WS1,WS2,WS3,WS4 parallel] (5d) -> Gates 1-4 -> WS5 (4d) -> Gate 5 -> Release
                                                                                        ~12 working days
```

### Execution Timeline

| Day | Activity | Agents Active |
|---|---|---|
| 1-2 | WS0: Foundation (audit, types, monorepo) | researcher, coord-opencode |
| 2 | Gate 0 check | reviewer |
| 3-7 | WS1-WS4 in parallel | mcp-packager, plugin-dev, skill-translator, provider-eng |
| 5 | Mid-sprint review: cross-workstream consistency check | reviewer, coord-opencode |
| 7 | Gates 1-4 checks | reviewer, tester |
| 8-11 | WS5: Testing and validation | tester, all agents for fixes |
| 11 | Gate 5 check | reviewer |
| 12 | Documentation, release prep | coord-opencode, all |

---

## Appendix A: OpenCode Configuration Template

```json
// opencode.json
{
  "mcp": {
    "agentic-qe": {
      "type": "local",
      "command": "npx",
      "args": ["agentic-qe", "mcp"],
      "env": {
        "AQE_MEMORY_PATH": ".agentic-qe/memory.db",
        "AQE_V3_MODE": "true",
        "AQE_V3_HNSW_ENABLED": "true",
        "AQE_V3_HOOKS_ENABLED": "true"
      }
    }
  },
  "plugins": ["aqe-opencode-plugin"],
  "agents": {
    "qe-test-architect": ".opencode/agents/qe-test-architect.yaml",
    "qe-coverage-specialist": ".opencode/agents/qe-coverage-specialist.yaml",
    "qe-security-scanner": ".opencode/agents/qe-security-scanner.yaml"
  }
}
```

## Appendix B: Plugin Hook Mapping Reference

```typescript
// @opencode-ai/plugin implementation
import { definePlugin } from "@opencode-ai/plugin";

export default definePlugin({
  name: "aqe-opencode-plugin",
  version: "1.0.0",

  onToolCallBefore: async (ctx) => {
    // Maps to AQE PreToolUse:
    // 1. File guard: prevent .db overwrites
    // 2. Pre-edit analysis: check for anti-patterns
    // 3. Pre-command safety: validate bash commands
    // 4. Pre-task routing: suggest model tier
  },

  onToolCallAfter: async (ctx) => {
    // Maps to AQE PostToolUse:
    // 1. Post-edit learning: capture patterns
    // 2. Post-command analysis: extract outcomes
    // 3. Post-task metrics: track token usage
  },

  onSessionPromptBefore: async (ctx) => {
    // Maps to AQE UserPromptSubmit:
    // 1. Model routing: analyze complexity, suggest tier
    // 2. Pattern matching: find relevant ReasoningBank patterns
    // 3. Guidance injection: add domain-specific context
    // 4. Context budget: limit injection based on remaining tokens
  },

  onSessionPromptAfter: async (ctx) => {
    // Maps to AQE session learning:
    // 1. Outcome capture: success/failure signals
    // 2. Pattern promotion: trigger if pattern used successfully 3+ times
    // 3. Dream consolidation: queue for next consolidation cycle
  },
});
```

## Appendix C: Skill Translation Example

### AQE Format (`.claude/skills/debug-loop/SKILL.md`)

```markdown
---
name: debug-loop
description: Hypothesis-driven autonomous debugging
trust_tier: 3
domain: debugging
---

# Debug Loop

## Phases
### Phase 1 - Reproduce
### Phase 2 - Hypothesize and Test
### Phase 3 - Fix
### Phase 4 - Verify
### Phase 5 - Regression
```

### OpenCode Format (`.opencode/skills/qe-debug-loop.yaml`)

```yaml
name: qe-debug-loop
description: "Hypothesis-driven autonomous debugging with real command validation"
minModelTier: tier2-good
tags: ["debugging", "aqe", "quality-engineering"]

steps:
  - name: reproduce
    description: "Run the exact command that shows the bug. Capture REAL output."
    tools: ["bash", "read_file"]
    prompt: |
      Reproduce the reported symptom. Run real commands, capture output.
      If bug cannot be reproduced, stop and explain what was tried.

  - name: hypothesize
    description: "Form and test hypotheses (up to 5 iterations)"
    tools: ["bash", "read_file", "grep", "mcp:agentic-qe:code_index"]
    maxIterations: 5
    prompt: |
      State a specific hypothesis. Run a REAL command to test it.
      Record confirmed/rejected. If rejected, form next hypothesis.

  - name: fix
    description: "Make minimal targeted fix after confirmed root cause"
    tools: ["edit_file", "write_file", "mcp:agentic-qe:security_scan_comprehensive"]
    prompt: |
      Grep for ALL instances of the problematic pattern. Make minimal fix.
      Explain root cause, change, and blast radius.

  - name: verify
    description: "Run same reproduction command from step 1"
    tools: ["bash"]
    prompt: |
      Run the SAME command from reproduce step. Output must show correct values.
      Show before/after comparison.

  - name: regression
    description: "Run related tests to ensure no regression"
    tools: ["bash", "mcp:agentic-qe:test_execute_parallel"]
    prompt: |
      Run the full test suite for affected modules.
```
