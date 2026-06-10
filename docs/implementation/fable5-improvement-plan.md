# Fable 5 / ruflo-Parity Improvement Plan (GOAP)

**Date:** 2026-06-10
**Method:** Goal-Oriented Action Planning (`/goal-plan`)
**Source analysis:** ruflo v3.10.27–v3.10.40 release review (ADR-147 nested subagents, Hermes tier-1 adoptions PR #2237, ruflo-arena PR #2315) + AQE codebase gap audit
**Tracking:** GitHub issue (see footer)

---

## Goal

AQE platform exploits Fable 5 era capabilities at parity with ruflo where applicable:
clean learning embeddings, prompt-cache savings, runaway-loop protection, nested-subagent
readiness, deterministic adversarial orchestration, typed agent handoffs, and competitive
test-strategy evolution.

**Success criteria (goal state):**

1. No `<thinking>`-contaminated embeddings written to `memory.db` after the scrub ships
2. Second consecutive advisor/LLM call shows `cache_read_tokens > 0`
3. A command failing 5× consecutively is blocked by hooks with a recovery hint
4. All `qe-*.md` agents declare `tools:` with a coordinator/leaf split; trajectories persist `parent_agent_id` + `depth`; probe script committed
5. At least one QCSD phase runs as a deterministic workflow with adversarial find→refute verification
6. QE quality-gate outputs validate against published JSON schemas (`RiskDecision`, `CoverageGap`, `FindingVerdict`)
7. `aqe arena run` produces a reproducible competitive array for test strategies (Phase 1)

## Current State

| Capability | Status today | Evidence |
|---|---|---|
| Reasoning scrub | Absent | `src/integrations/agentic-flow/reasoning-bank/experience-replay.ts` embeds trajectories as-is (`computeRealEmbedding()`, ~L287) |
| Prompt caching | Flag dead | `src/shared/llm/providers/claude.ts` defines `enableCache: true` (~L41) but never sets `cache_control` |
| Tool-loop breaker | Domain-level only | `src/coordination/circuit-breaker/domain-circuit-breaker.ts` (ADR-064 Phase 2D); nothing at command level |
| Nested subagent plumbing | Absent | No `tools:` frontmatter in `.claude/agents/v3/qe-*.md`; no `parentAgentId`/`depth` in `src/coordination/queen-types.ts` or post-task hooks |
| Deterministic workflows | Absent | QCSD skills use flat Task-tool fan-out; no `.claude/workflows/` |
| Typed verdict handoffs | Absent | Prose handoffs; ADR-075 covers framework types only |
| Competitive tournaments | Absent | No ADR/code coverage |

## ADR Actions

| Improvement | ADR action | Status |
|---|---|---|
| 1. Reasoning-tag scrub | **NEW ADR-099** — Reasoning-Tag Scrubbing for Pattern Embedding Sanitization | Proposed |
| 2. Prompt caching | **UPDATE ADR-088** (Prompt Cache Latch Fields, Implemented 2026-04-02) — add ephemeral breakpoint injection section | Amend |
| 3. Tool-loop breaker | **NEW ADR-100** — Tool-Loop Circuit Breaker for Hook Reliability | Proposed |
| 4. Nested subagents | **NEW ADR-101** — Nested Subagent Hierarchy: Depth Limits, Privilege Model, Trajectory Provenance | Proposed |
| 5. QCSD workflows | **NEW ADR-102** — Deterministic Workflow Orchestration with Adversarial Verification (relates to ADR-074 Loki Mode, Accepted) | Proposed |
| 6. Typed verdicts | **NEW ADR-103** — Structured JSON-Schema Verdict Handoffs (relates to ADR-075, ADR-054) | Proposed |
| 7. qe-arena | **NEW ADR-104** — Competitive Test-Strategy Tournaments (qe-arena Phase 1) | Proposed |

Highest existing ADR: 098. New ADRs follow `docs/implementation/adrs/templates/ADR-TEMPLATE.md` (WH(Y) statement, Options Considered, Dependencies, Governance, ECADR Definition of Done).

## Plan (GOAP)

```
Goal: Fable 5 capability parity (7 criteria above)
Plan Cost: ~13–18 dev-days across 4 tiers
Execution order: [1 ∥ 2 ∥ 3] → 4 → 6 → 5 → 7
  (6 before 5: workflow scripts consume the verdict schemas)
```

---

### Improvement 1 — Reasoning-Tag Scrub Before Distillation (ADR-099) · Tier 1 · Cost S

**Why now:** Fable 5 emits far more extended thinking than prior models; every fleet run
dilutes `memory.db` pattern embeddings with reasoning-scratchpad text.

**Steps**
1. Add `scrubReasoningBlocks(text)` utility — strips `<think>`, `<thinking>`, `<reasoning>`, `<REASONING_SCRATCHPAD>` blocks; boundary-gated (prose *mentioning* the tags is left intact). *Precondition: none. Effect: reusable sanitizer with unit tests.*
2. Apply in `experience-replay.ts` to trajectory `action`/`result` fields **before** distillation and `computeRealEmbedding()`. *Precondition: step 1. Effect: new embeddings clean.*
3. Apply in `src/workers/workers/learning-consolidation.ts` consolidation path. *Effect: consolidated patterns clean.*
4. Unit tests: tagged trajectory → stored pattern contains no tag content; prose mention survives.

**Integration points:** ReasoningBank trajectory pipeline, post-task hook → `recordFeedback` path, `memory.db` `qe_patterns` writes. No schema migration. Existing rows untouched (data-protection rules apply — no rewrite of `memory.db`).

**User verification (reproduction-first):**
```bash
# CLI path: record a trajectory whose result embeds a thinking block
aqe hooks post-task --task-id scrub-test \
  --result "$(printf '<thinking>secret scratchpad</thinking>real outcome')"
sqlite3 .agentic-qe/memory.db \
  "SELECT content FROM qe_patterns ORDER BY rowid DESC LIMIT 1;"
# EXPECT: row contains "real outcome", does NOT contain "secret scratchpad"
```
MCP parity: same check via `mcp__agentic-qe__memory_query` on the latest pattern.

---

### Improvement 2 — Wire Prompt Caching (ADR-088 update) · Tier 1 · Cost S

**Steps**
1. In `claude.ts` request builder: when `enableCache`, send `system` as a content-block array with `cache_control: { type: "ephemeral" }` on the final system block (system + trailing-message strategy, per ruflo #2237). *Effect: ~90% discount on cached input tokens, 5-min TTL.*
2. Surface `cache_creation_input_tokens` / `cache_read_input_tokens` from the API response into the existing ADR-088 latch/usage metrics and ADR-042 token tracking.
3. Gate by provider — ephemeral breakpoints only on the Anthropic-native path; no-op for non-Anthropic providers (ADR-043/ADR-092 vendor independence).
4. Tests: assert `cache_control` present in serialized request body when enabled, absent when disabled.

**Integration points:** `src/shared/llm/providers/claude.ts`, token tracking (ADR-042), `routing_economics` / `routing_metrics` MCP tools, `aqe costs`.

**User verification:**
```bash
# Two consecutive advisor calls within 5 minutes
aqe advisor consult --question "test strategy for checkout flow"
aqe advisor consult --question "test strategy for payment flow"
aqe costs   # or: routing_metrics via MCP
# EXPECT: second call reports cache_read_tokens > 0 and lower input cost
```
MCP parity: `mcp__agentic-qe__advisor_consult` ×2 → `mcp__agentic-qe__routing_metrics` shows cache reads.

---

### Improvement 3 — Tool-Loop Circuit Breaker (ADR-100) · Tier 1 · Cost M

**Why now:** Fable 5 is more persistent than prior models — runaway retry loops are more
expensive, not less.

**Steps**
1. New `tool-loop-guardrail` module reusing the closed→open→half-open state machine from `domain-circuit-breaker.ts`, keyed by normalized command signature instead of domain.
2. `post-command` hook records `(command, success)`; `pre-command` hook consults the breaker: **warn at 3, block at 5** consecutive failures of the same command, emitting a recovery hint ("same command failed 5×; change approach or inspect the error").
3. Advisory by default; `AQE_STRICT_TOOL_LOOP=1` upgrades warn→block. Orthogonal to security guardrails.
4. Tests: 7 cases (below threshold, warn boundary, block boundary, reset on success, distinct commands independent, half-open recovery, env-var enforcement).

**Integration points:** hooks `pre-command`/`post-command` handlers, existing circuit-breaker module (reuse, don't fork), in-process state (no DB write per command).

**User verification:**
```bash
for i in 1 2 3 4 5; do
  aqe hooks pre-command --command "npm run definitely-broken"
  aqe hooks post-command --command "npm run definitely-broken" --success false
done
# EXPECT: iteration 3 prints a WARN with failure count; iteration 5 prints BLOCK + recovery hint
aqe hooks post-command --command "npm run definitely-broken" --success true
aqe hooks pre-command --command "npm run definitely-broken"
# EXPECT: breaker reset, command allowed
```
MCP parity: same sequence through the MCP hooks tool returns the same warn/block envelope.

---

### Improvement 4 — Nested Subagent Readiness, depth=5 (ADR-101) · Tier 2 · Cost M–L

**Why now:** Anthropic announced nested subagent support (depth=5) on 2026-06-09. ruflo's
probe shows runtime plumbing exists but `Task` is stripped parent→child (upstream denylist).
Building now means AQE activates with **zero code changes** the day the gate lifts.

**Steps**
1. Add `tools:` frontmatter to all `.claude/agents/v3/qe-*.md`: coordinators (`qe-queen-coordinator`, `qe-fleet-commander`, `qe-parallel-executor`, `qe-learning-coordinator`) declare `Task`; leaf specialists explicitly do not (least-privilege boundary). Mirror **only `qe-*.md`** changes into `assets/agents/v3/` (npm distribution rule — no non-QE agents there).
2. Extend trajectory recording: `parentAgentId?: string`, `depth?: number` on `TaskExecution` (`src/coordination/queen-types.ts`) and post-task hook flags `--parent-agent-id` / `--depth` (validated: identifier check, integer 0 ≤ d ≤ 32). Lands in the JSON metadata blob — no schema migration for stage 1.
3. Forward both fields through `recordFeedback` into ReasoningBank so learning can segment patterns per hierarchy level.
4. Commit `scripts/probe-nested-spawn-depth.mjs` (port of ruflo's probe): spawns a coordinator that recursively chains L1→L2→… until refusal; commit probe output under `docs/probes/`. This is the regression test that announces when the upstream denylist lifts — re-run after every `claude update`.
5. Tests: propagation, omission, depth=0 boundary, invalid id rejection, negative/non-integer/>32 depth rejection (7 cases, mirroring ruflo's suite).

**Integration points:** `.claude/agents/v3/`, `assets/agents/v3/`, hooks post-task (CLI + MCP schema), ReasoningBank feedback, queen coordinator types.

**User verification:**
```bash
# Agents parse cleanly with new frontmatter
aqe health                       # no agent-load errors
node scripts/probe-nested-spawn-depth.mjs
# EXPECT today: "level=1 status=NO_AGENT_TOOL" (denylist active — documented, expected)
# EXPECT post-rollout: level≥2 — signal to activate follow-up phases

aqe hooks post-task --task-id nest-test --parent-agent-id qe-fleet-commander --depth 2
sqlite3 .agentic-qe/memory.db "SELECT ... ORDER BY rowid DESC LIMIT 1;"
# EXPECT: persisted entry contains parentAgentId=qe-fleet-commander, depth=2
```
MCP parity: `hooks_post-task` MCP input schema accepts both fields; same persistence check.

---

### Improvement 5 — Deterministic Workflow Orchestration for QCSD (ADR-102) · Tier 3 · Cost L

**Depends on:** Improvement 6 (consumes verdict schemas).

**Steps**
1. Create `.claude/workflows/` with the first script: `qcsd-development-review` — dimensions → parallel finders → **adversarial refuters per finding** (N=3 skeptics prompted to refute; kill on majority refute) → synthesis. Findings/verdicts use ADR-103 schemas via the `agent(…, {schema})` option.
2. Update `qcsd-development-swarm` SKILL.md: `execution.primary: workflow` where the harness supports it, keeping `task-tool` as documented fallback (not all users run a Workflow-capable harness).
3. Wire ADR-074 Loki-mode escalation rules (blind review, sycophancy detection) as refuter prompt constraints.
4. Baseline measurement: run old fan-out vs new workflow on the same fixture; record finding count, confirmed-finding count, false positives.
5. Roll out to remaining QCSD phases (ideation/refinement/cicd/production) as follow-up once the development phase proves out.

**Integration points:** `.claude/skills/qcsd-*`, qe agents as `agentType`, ADR-074, ADR-103 schemas.

**User verification:**
```bash
# In Claude Code, on a fixture repo:
/qcsd-development-swarm
# EXPECT: workflow progress tree (Find → Verify → Synthesize phases visible);
# final report lists ONLY confirmed findings, each carrying refuter verdicts (e.g. 3/3 upheld);
# comparison note vs baseline shows reduced false positives
```

---

### Improvement 6 — Structured Verdict Handoffs (ADR-103) · Tier 3 · Cost M

**Steps**
1. New `src/contracts/verdicts.ts` (typed + Zod/JSON Schema, versioned envelope): `FindingVerdict {id, title, file, severity, confidence, evidence[], verdict, refutations[]}`, `CoverageGap {file, range, riskScore, suggestedTests[]}`, `RiskDecision {decision: approve|block|escalate, riskFactors[], confidence, rationale}`.
2. Validate at MCP boundaries: `quality_assess`, `coverage_analyze_sublinear`, quality-gate handlers emit schema-conformant payloads (validation at the boundary per project rules).
3. Export schemas for workflow `agent(…, {schema})` use (improvement 5) — malformed agent output is auto-retried at the tool-call layer.
4. Contract tests: golden samples validate; mutated samples (missing severity, confidence > 1) rejected.

**Integration points:** ADR-075 type system (extend, don't fork), MCP handlers, QCSD workflows, A2A envelopes (ADR-054) unchanged — verdicts ride inside them.

**User verification:**
```bash
aqe analyze --quality-gate --json > verdict.json
npx ajv validate -s schemas/risk-decision.schema.json -d verdict.json
# EXPECT: "verdict.json valid"
```
MCP parity: `mcp__agentic-qe__quality_assess` response body validates against the same schema.

---

### Improvement 7 — qe-arena: Competitive Test-Strategy Tournaments (ADR-104) · Tier 4 · Cost L

**Why:** QE has objective fitness functions (mutation kill rate, coverage delta, runtime) —
a better fit for ruflo-arena's tournament model than almost any other domain.

**Steps (Phase 1, self-contained — no core changes)**
1. Strategy = declarative test-generation config (framework, technique mix, edge-case emphasis, model tier). Seeded RNG; **no `Date.now()`/randomness in scoring paths** — reproducible under `--seed`.
2. Arena engine: run N candidate strategies against a fixture project; fitness = `w1·mutationKillRate + w2·coverageDelta − w3·runtimePenalty` (Stryker for mutation scoring via the existing mutation-testing skill).
3. Tournament → competitive array (pairwise fitness matrix); hill-climb evolution over strategy parameters.
4. Persistence to `memory.db` via existing memory layer (unified persistence ADR — **no new SQLite file**); winners feed qe-test-architect as learned priors.
5. Surface: `aqe arena run|tournament|list` CLI + `arena_run`/`tournament_run` MCP tools (registered through the standard handler registry — avoid ruflo's unregistered-plugin-tools gap).

**Integration points:** mutation-testing skill, `qe-test-architect`, memory layer, optionally dream cycles (ADR-094) for offline evolution.

**User verification:**
```bash
aqe arena run --strategies 4 --target fixtures/demo-project --seed 42
# EXPECT: competitive array table (4×4 fitness matrix), ranked strategies,
# winner with mutation kill-rate and coverage numbers
aqe arena run --strategies 4 --target fixtures/demo-project --seed 42
# EXPECT: identical output (reproducibility)
```
MCP parity: `arena_run` with the same seed returns the same ranked result envelope.

---

## Risk Factors (replan triggers)

| Risk | Affected | Mitigation |
|---|---|---|
| Anthropic never lifts the `Task` denylist for nested spawns | 4 | All work is forward-compatible and independently useful (provenance fields help flat spawns today); probe script tells us when to proceed |
| Workflow harness not available in every user environment | 5 | Keep `task-tool` execution path as documented fallback in QCSD skills |
| `cache_control` rejected by non-Anthropic gateways/proxies | 2 | Provider-gated; no-op elsewhere (ADR-092) |
| Mutation runs too slow for tournaments | 7 | Fixture-scoped Phase 1; sampled mutants; runtime penalty in fitness |
| Scrub regex too aggressive (eats legitimate prose) | 1 | Boundary-gated matching + prose-mention tests before merge |
| Schema changes break existing MCP consumers | 6 | Versioned envelope; additive fields only in v1 |

**Fallback:** if Tier 3 (5+6) proves too large in one pass, ship ADR-103 schemas alone — they are independently useful for MCP output validation — and defer workflow conversion.

---

## Verification Gates (per project policy)

- Reproduction-first: each improvement closes only after its **user-perspective command sequence above** runs green on a real fixture project
- MCP–CLI parity: every CLI verification has an MCP twin, verified through the protocol server
- No batch-close: 7 improvements = 7 separate verification records on the tracking issue
- `npm run build` + `npm test` green before any merge; smoke test before release

---

*Tracking issue: see "Fable 5 / ruflo-parity improvement initiative" on proffesor-for-testing/agentic-qe.*
