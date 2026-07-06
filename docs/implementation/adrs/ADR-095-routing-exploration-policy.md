# ADR-095: ε-Greedy Routing Exploration Policy

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-095 |
| **Status** | Implemented |
| **Date** | 2026-05-15 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |
| **Source** | Issue #488 Phase 4 — exploration vs exploitation in agent routing |

---

## WH(Y) Decision Statement

**In the context of** AQE's agent-routing path (`QEReasoningBank.routeTask` → `calculateAgentScores`) which scores per-agent (domain match, capability match, historical performance, language boost, pattern similarity), sorts descending, and always selects `agentScores[0]` as `recommendedAgent`,

**facing** a pure-greedy selection that systematically reinforces whichever pattern happened to score first when the catalog was sparse — V0.03 evidence in #488 documents one bootstrap pattern (`cli-hook-code-intelligence-2026-05`) absorbing 33 hits while every other pattern in the catalog got 0, with the result that pattern promotion is glacial (1 of 23 patterns promoted to long-term over ~30 hours of activity) and `routing_outcomes` shows ~95% of decisions concentrated on the same handful of agents per domain even when alternatives exist with comparable scores,

**we decided for** a unified routing decision that blends three signals already present in the platform — (a) the existing static score (domain match, capability match, performance prior) computed by `calculateAgentScores`, (b) the per-(state, action) Q-value from `rl_q_values` (populated by `updateHookRouterQValue` since #487 / commit 66553141 but never read during selection until this ADR), and (c) mincut-modulated ε-greedy exploration over the alternatives — injected at `src/learning/agent-routing.ts:130-202`; the Q-value contribution is weighted by `min(visits / N, MAX_WEIGHT)` so sparse Q-data defers to the static prior and mature Q-data drives the decision; ε derives from per-task structural criticality (high mincut criticality = bottleneck = exploit; low criticality = substitutable = explore) with `AQE_ROUTER_EXPLORATION_RATE` as a manual override; a new `routing_outcomes.exploration` integer column plus a `criticality REAL` column give telemetry the data needed to A/B compare exploit vs explore outcomes,

**and neglected** plain frequency-based adaptive ε (a `COUNT(*) FROM routing_outcomes` heuristic — discarded once we noticed the mincut infrastructure already measures the same structural signal more correctly per ADR-047 / ADR-068), softmax / Thompson sampling over the score distribution (more sophisticated but harder to reason about for operators reading routing telemetry), and deferring Q-value consumption to a follow-up ADR (the previous draft argued this was "a much larger architectural change" but the actual integration is ~15 lines: a prepared-statement lookup per agent in the existing score loop and a blend formula — the Q-table population infrastructure already exists, deferring its consumption would leave the #487 fix populating data nothing reads),

**to achieve** measurable pattern catalog diversification (alternatives that today never get sampled accumulate enough usage signal to qualify for promotion or to be explicitly deprecated), an audit trail (`routing_outcomes.exploration = 1` flags exploration decisions so quality_score comparisons across exploit/explore become a routine analysis), architectural consistency with ADR-068's mincut-gated model routing (the same structural criticality signal that already governs Haiku-vs-Opus tier selection now also governs how aggressively we explore alternative agents), closure of the #487 loop (Q-table is now both populated AND consumed — the Bellman update has a routing-side reader to learn from), and a closed-loop learning system that genuinely improves over time (exploration creates Q-table signal beyond the greedy winner; the greedy winner becomes more accurate as Q-values mature; mincut keeps both contained to safe parts of the topology),

**accepting that** exploration occasionally picks a non-top-scored agent (downside is bounded — QE agents have overlapping competence; a qe-coverage-analyzer instead of qe-test-generator still produces a valid, slightly-different result; mincut modulation further bounds the downside by suppressing exploration at structural bottlenecks where errors cascade), telemetry tooling must be extended to bucket exploit vs explore decisions before operators can interpret routing quality changes (mitigated by the schema migration + a small `aqe learning loop-health` extension), the routing path now depends on the live agent dependency graph being available at decision time (already a requirement of ADR-068, so this doesn't add a new dependency — but the graceful-degradation path matters: when mincut is unavailable, fall back to the env-driven fixed-ε behavior), and the boundary between "exploration noise" and "real regression" gets fuzzier (mitigated by the `exploration` flag enabling per-bucket regression analysis).

---

## Context

### Problem (V0.03 evidence from #488)

| Metric | Observed |
|--------|----------|
| `qe_patterns` rows total | 23 (after ~30 hours of activity) |
| Patterns promoted to long-term | **1** (the one bootstrap pattern that absorbed early hits) |
| `qe_patterns.usage_count` distribution | 33 hits on the dominant pattern, 0 hits on every other pattern in the same domain |
| `routing_outcomes` decisions | 49 resolved, avg quality 0.542 |
| Distinct agents recommended (per session) | ~3 (the same agents win every time the same domain pattern matches) |

The catalog has more patterns than the routing pipeline ever samples. A pattern with comparable scores to the dominant one might be objectively better, but it never gets a chance to demonstrate that because the score tie is broken deterministically and the loser is never picked.

### Source-Level Findings

Verified by reading the routing code (see ADR-094's investigation pattern):

**Selection is pure greedy.** `src/learning/agent-routing.ts:199-202`:
```typescript
agentScores.sort((a, b) => b.score - a.score);
return agentScores;
```
The caller at `qe-reasoning-bank.ts:509` takes `agentScores[0]` unconditionally. No `Math.random`, no `epsilon`, no `softmax` exists anywhere in `src/learning/`, `src/routing/`, or `src/coordination/` for agent routing.

**The `alternatives` list is already computed.** `qe-reasoning-bank.ts:510`: `alternatives = agentScores.slice(1, 4)`. The next 3 agents are populated and returned to the caller — they're just never selected. ε-greedy plugs in cleanly at the selection step using this existing list; no scoring refactor needed.

**The `rl_q_values` table is written but never read during routing.** `updateHookRouterQValue` (`hooks-dream-learning.ts:643-693`) does the Bellman update on every post-task tick — verified by the #487 fix. But grep across `src/learning/`, `src/routing/`, `src/cli/commands/hooks-handlers/` shows **zero** `SELECT ... q_value ... FROM rl_q_values` queries on the routing path. The state-action Q-values accumulate but inform no decision. **This is a separate gap from this ADR — see Open Questions below.**

**`routing_outcomes` has no exploration flag.** Schema in `unified-memory-schemas.ts`: `id, task_json, decision_json, used_agent, followed_recommendation, success, quality_score, duration_ms, error, model_tier, advisor_consultation_json, created_at`. The `decision_json` includes the recommended agent + alternatives but not the policy that produced the decision. Telemetry can't distinguish exploit from explore retroactively.

### Mincut is the right foundation

AQE already has mincut infrastructure that measures exactly the signal we need: per-task structural criticality in the live agent dependency graph. Verified locations:

- `src/coordination/mincut/mincut-calculator.ts` — `MinCutCalculator` class with the Subpolynomial Dynamic algorithm (n^0.12 scaling)
- `src/domains/base-domain-coordinator.ts:233` — `isTopologyHealthy()`, `shouldPauseOperations()` mixin used by 5+ domain coordinators
- **ADR-068** wired mincut into MODEL tier routing (Haiku/Sonnet/Opus). High criticality → upgrade model.
- **ADR-047** established mincut for self-organizing QE (Strange Loop, Morphogenetic growth).

What is NOT wired today: `src/learning/agent-routing.ts` and `src/learning/qe-reasoning-bank.ts`. Agent routing computes scores from static features (domain match, capability match, performance score from a hard-coded table) and ignores the structural context. This is the same gap ADR-068 closed for model tiers — applied here for agent selection.

The RuVector mincut documentation describes the directly-relevant pattern (the "Morphogenetic" example):

> "If min-cut is low, add connections" — a responsive rule-based approach.

In our routing terms: when the dependency-graph mincut at the current task is HIGH (many redundant paths, alternative agents are structurally substitutable), exploration is safe and beneficial because the worst case is "different valid result, not catastrophic regression." When the mincut is LOW (bottleneck, no alternatives), exploit greedily because errors cascade through everything downstream.

### Relationship to Existing ADRs

| ADR | Title | Relationship |
|-----|-------|--------------|
| ADR-021 | QE ReasoningBank for Pattern Learning | Owns `qe_patterns` + `pattern-lifecycle.ts` promotion thresholds. This ADR doesn't change those — it diversifies which patterns get usage signal in the first place. |
| ADR-047 | MinCut Self-Organizing QE | Provides the `MinCutCalculator` + `MinCutAwarenessMixin` infrastructure this ADR consumes. Same algorithm, new consumer. |
| ADR-061 | Asymmetric Learning Rates | Failure penalty 10:1 vs success bonus. Compatible with exploration — exploration that fails still gets the 10:1 penalty applied to the explored pattern, which is the desired feedback signal. |
| ADR-068 | Mincut-Gated Model Routing | Same infrastructure, parallel use case. ADR-068 modulates model TIER by criticality; this ADR modulates exploration RATE by criticality. Both ADRs read from the same agent dependency graph. |
| ADR-094 | Kernel-Side Dream Cycles | Established the hooks-as-producers boundary. This ADR plugs into the kernel-side routing path that hooks already produce signals for. |

---

## Options Considered

### Option 1: Three-Signal Routing — Static Score + Q-Value Blend + Mincut-Modulated ε (Selected)

Blend three signals that all already exist in the platform. Inject in two places:

**(1) Score blending in `calculateAgentScores`** (`agent-routing.ts:140-196`). The current loop computes a static score per agent from domain match, capability match, performance score, language boost, and pattern similarity. Add a per-agent Q-value lookup and blend:

```typescript
// Inside the existing per-agent scoring loop
const stateKey = `${taskType}|${priority}|${domain || 'any'}|${complexityBucket}`;
const qRow = db.prepare(`
  SELECT q_value, visits FROM rl_q_values
   WHERE algorithm = 'q-learning'
     AND agent_id = 'aqe-hook-router'
     AND state_key = ?
     AND action_key = ?
`).get(stateKey, agentName) as { q_value: number; visits: number } | undefined;

const visits = qRow?.visits ?? 0;
const qValue = qRow?.q_value ?? 0;

// qWeight ramps from 0 (no Q-data) to MAX_Q_WEIGHT (mature Q-data).
// Until ~20 visits the static prior dominates; after that the learned signal
// contributes meaningfully. MAX_Q_WEIGHT capped at 0.4 so static features
// (capability match etc.) always retain primary signal — Q-values inform,
// don't override.
const MAX_Q_WEIGHT = 0.4;
const QWEIGHT_RAMP_VISITS = 20;
const qWeight = Math.min(visits / QWEIGHT_RAMP_VISITS, 1) * MAX_Q_WEIGHT;

// Q-values are unbounded in raw form. Normalize via sigmoid before blending.
// sigmoid(x) maps R → (0, 1); centering at 0 means a fresh row contributes 0.5.
const normalizedQ = 1 / (1 + Math.exp(-qValue));

effectiveScore = staticScore * (1 - qWeight) + normalizedQ * qWeight;
```

**(2) Mincut-gated exploration at the selection step** (`agent-routing.ts:199-202`, after the sort by effectiveScore):

```typescript
import { randomInt } from 'crypto';

// Base ε from env (operator override) or fixed default
const baseEpsilon = parseExplorationRate(process.env.AQE_ROUTER_EXPLORATION_RATE);

// Mincut safety multiplier (uses shared singleton from ADR-047)
const monitor = getSharedMinCutMonitorSafe();
const isCritical = monitor?.isCritical?.() ?? false;
const safetyMultiplier = isCritical ? 0.2 : 1.0;

const epsilon = baseEpsilon * safetyMultiplier;
const epsilonMicro = Math.round(epsilon * 1_000_000);   // for crypto.randomInt comparison

// crypto.randomInt for cryptographically-strong uniform randomness — the
// codebase convention (matches randomUUID usage in the same modules).
// Math.random() would work but breaks the consistency.
if (epsilonMicro > 0 && agentScores.length > 1 && randomInt(0, 1_000_000) < epsilonMicro) {
  const exploreIdx = randomInt(1, Math.min(4, agentScores.length));
  const explored = agentScores[exploreIdx];
  agentScores[exploreIdx] = agentScores[0];
  agentScores[0] = explored;
  (explored as ScoredAgent & { exploration: boolean }).exploration = true;
}
```

The mincut signal acts as a **safety gate**, not the primary rate driver. The `SwarmGraph` populated by Queen coordinator activity is graph-level (not per-task), so in single-task CLI hook routing the graph is often empty or sparse. The honest integration is:

```typescript
// Base ε from env or fixed default
const baseEpsilon = parseFloat(process.env.AQE_ROUTER_EXPLORATION_RATE ?? '0.05');

// Mincut safety multiplier (uses getSharedMinCutMonitor from ADR-047 / ADR-068)
// - Critical topology (mincut < warningThreshold): dampen exploration 5x
// - Healthy or unknown: full rate
const monitor = getSharedMinCutMonitorSafe();
const safetyMultiplier = monitor?.isCritical?.() ? 0.2 : 1.0;
const epsilon = baseEpsilon * safetyMultiplier;
```

When the swarm topology is degraded (mincut below `warningThreshold`), errors cascade more easily — exploration is dampened to ~1% of the base rate. When the topology is healthy or no graph signal is available, the base rate applies in full.

The `routing_outcomes.criticality` column stores the recorded `safetyMultiplier` (or the raw mincut value when available) so retrospective analysis can correlate exploration outcomes with topology state.

**Schema migration**: `ALTER TABLE routing_outcomes ADD COLUMN exploration INTEGER NOT NULL DEFAULT 0` and `ADD COLUMN criticality REAL`. Optionally also `ADD COLUMN q_weight REAL` to capture how much Q-value influence the decision had — useful for "did this decision overrule the static prior or follow it?" analysis.

**Why all three at once:** Each signal is incomplete without the others.

- Static score alone: ignores learned outcomes. The #487 fix populates `rl_q_values` but nothing reads it — the table grows forever as wasted I/O.
- Static + Q-value alone: Q-table is sparse on every state-action pair except the greedy winner (since the system never picks anyone else). Q-learning can't differentiate alternatives it never tried.
- All three: static score bootstraps the cold start, Q-value blends in as it matures, mincut-modulated exploration gathers Q-table signal beyond the greedy winner while keeping risky exploration off bottlenecks.

**Pros:**
- Closes the #487 loop (Q-table both populated AND consumed)
- Architectural consistency with ADR-068 (same mincut signal, parallel use case)
- All three signals use infrastructure that already exists; net new code is ~50-80 lines
- Each signal can be independently disabled via config for diagnosis (set MAX_Q_WEIGHT=0 to disable Q-blending; set epsilon=0 to disable exploration)
- Telemetry per decision (`exploration`, `criticality`, `q_weight`) supports retrospective analysis with no extra instrumentation needed
- Graceful degradation throughout: missing Q-row → qWeight=0; missing mincut → fixed fallback ε; missing both → original greedy behavior

**Cons:**
- ~3x the code of the original "just ε-greedy" proposal (still ~80 lines total, not "a much larger architectural change")
- Per-agent Q-value lookup adds one prepared-statement query per agent per routing decision (5-10 queries, sub-millisecond each — cached by better-sqlite3's prepared statement cache)
- Two new schema columns; the migration is additive (no data backfill needed)
- "Why did agent X win?" answer is now three-part (static score, Q-bonus, exploration flag) — explainability requires the new telemetry columns

### Option 2: Pure ε-Greedy with Fixed or Frequency-Adaptive ε (Rejected)

What the previous draft of this ADR proposed: ε comes from either an env var (fixed) or a `COUNT(*) FROM routing_outcomes` frequency curve (adaptive). No structural signal.

**Why rejected (relative to Option 1):** The frequency-adaptive curve is a degenerate proxy for what mincut already measures. "Patterns are sparse" was the frequency-based proxy; "this task has no structurally-substitutable alternatives" is the actual decision criterion. Mincut gives us the right signal directly, and the infrastructure is already there. Filing this as "rejected" rather than "complementary" because the two would do the same job — keeping both would be confusing.

### Option 3: Softmax Sampling over Top-N (Rejected for Now)

Replace `agentScores[0]` with a temperature-controlled softmax draw over the top-N scores:

```typescript
const T = parseTemperature(process.env.AQE_ROUTER_TEMPERATURE);
if (T > 0) {
  const probs = softmax(agentScores.slice(0, N).map(a => a.score / T));
  const chosen = sampleFromDistribution(probs);
}
```

**Why rejected for now:** Harder to reason about than mincut-modulated ε. "Criticality 0.7 → ε=0.05" is structurally meaningful; "T=0.3 over top-4" is not. Score gaps matter, but the simpler ε-greedy with mincut modulation is the right first step. Softmax can replace ε-greedy in a future revision once telemetry tells us whether score gaps in practice are large or small.

### Option 4: Thompson Sampling (Rejected)

Treat per-agent success rate as a Beta(α, β) distribution. Sample from each agent's Beta posterior; pick the highest sample.

**Why rejected:** Requires per-agent posterior state. The lifecycle manager would need a separate Beta-tracking table or extension of `qe_patterns` columns. More moving parts for a marginal benefit over mincut-modulated ε in this regime.

### Option 5: Morphogenetic Connection-Adding (Considered, Reserved)

The RuVector "Morphogenetic" pattern: when mincut is low, structurally ADD connections (in our case, add agent-to-pattern edges that didn't exist before). This is closer to learning the graph topology itself rather than exploring within a fixed topology.

**Why considered, not selected:** Bigger architectural change. The current agent dependency graph is built from agent SPAWN events at runtime; morphogenetic growth would require AQE to autonomously create new agent-pattern edges based on observed mincut. This is closer to ADR-047's self-organizing concerns and likely belongs in that ADR's followup rather than as a routing tweak.

### Option 6: Defer Q-Value Consumption to a Future ADR (Rejected — was the previous draft's position)

The previous draft of this ADR proposed leaving Q-value consumption out of scope, arguing it was "a much larger architectural change" because Q-values affect the score itself, not just the selection.

**Why rejected:** The integration is small (per-agent prepared-statement lookup + sigmoid blend = ~15 lines in the existing scoring loop). Deferring would leave the #487 Bellman-update infrastructure populating a table that nothing reads. The exploration policy and Q-value consumption are complementary — exploration without Q-value reading gathers signal that nothing uses; Q-value reading without exploration is starved of training data because the system only picks the greedy winner. Shipping them together closes both halves of the learning loop.

---

## Default Behavior (Maintainer Decision Required)

The mincut-modulated approach removes the previous draft's frequency-based "adaptive ε" question — criticality drives the rate now. What remains is **whether the kernel-side scheduler ships with mincut modulation enabled by default**.

### Option A: Default ON — Mincut-modulated ε with criticality-derived rate (recommended)

Ship with mincut-modulated exploration enabled by default. ε per decision is `clamp(0.01 + (1 - criticality) * 0.14, 0.01, 0.15)`. Operators who want fully deterministic routing set `AQE_ROUTER_EXPLORATION_RATE=0`.

**Pros:**
- Solves the production problem out of the box
- ε is bounded: even at maximum (criticality=0) it's only 0.15, and at minimum (bottleneck) it's 0.01 — never silently dominant
- Q-value blending begins learning from day one
- Architectural consistency with ADR-068 (mincut-on-by-default for model routing)

**Cons:**
- User-observable behavior change. CI pipelines that assert exact `recommendedAgent` values will see non-determinism
- Migration callout required in release notes
- Boundary cases: if mincut calculator hasn't been initialized (e.g. tests, brand-new fleet), the fallback is fixed 0.05 — still non-deterministic

### Option B: Default OFF — `AQE_ROUTER_EXPLORATION_RATE=0` baseline, operators opt in

Ship with ε=0 as default. The Q-value blend still happens (no harm — it's just a signal), but exploration is off until operators set the env. The mincut criticality still gets computed and stored in `routing_outcomes.criticality` for retrospective analysis even without exploration enabled.

**Pros:**
- Zero behavior change for existing users
- Q-table consumption (the #487 closure) still happens
- Operators can A/B test by flipping the env

**Cons:**
- The catalog-diversification problem in V0.03 evidence stays unsolved until operators opt in
- Two product modes — one with exploration, one without
- Q-table grows but stays sparse on alternatives the system never picks

**Recommendation:** **Option A** (default on with mincut modulation) for consistency with ADR-068 and to solve the production problem by default. The ε bounds (0.01–0.15) are tight enough that worst-case impact is small, and `AQE_ROUTER_EXPLORATION_RATE=0` is the documented escape hatch for deterministic-CI workflows.

The maintainer may prefer Option B if any known user depends on deterministic routing OR if we want to ship just the Q-value blending in this release and add exploration in a follow-up.
- Computing N adds a query per routing decision (small — indexed lookup on `routing_outcomes`)

## Architecture

### Components

```
agent-routing.ts (src/learning/) — MODIFIED
├── calculateAgentScores() — MODIFIED to blend Q-value into per-agent score
│     ├── per-agent prepared-statement lookup of rl_q_values for current stateKey
│     ├── qWeight = min(visits / 20, 1) * 0.4 — ramps from 0 to MAX_Q_WEIGHT
│     ├── normalizedQ = sigmoid(q_value)
│     └── effectiveScore = staticScore * (1 - qWeight) + normalizedQ * qWeight
├── new module-level helper: resolveExplorationRate({ envOverride, taskCriticality, fallback })
│     ├── priority: env > mincut-derived > fallback (0.05)
│     └── mincut formula: clamp(0.01 + (1 - criticality) * 0.14, 0.01, 0.15)
└── selectWithExploration(agentScores, epsilon) — NEW small helper
      ├── with probability ε: swap top with random pick from slice(1, 4)
      └── marks the chosen agent with `exploration: true`

qe-reasoning-bank.ts (src/learning/) — MODIFIED
├── routeTask() — read mincut criticality once via MinCutAwarenessMixin
├── pass criticality into calculateAgentScores for downstream use
└── attach `exploration` + `criticality` + `qWeight` to QERoutingResult

routing_outcomes schema — MIGRATION
├── ADD COLUMN exploration INTEGER NOT NULL DEFAULT 0
├── ADD COLUMN criticality REAL  -- mincut signal that produced the decision (nullable)
├── ADD COLUMN q_weight REAL     -- how much Q-value influence the decision had
├── No data backfill needed (existing rows default to 0 / null)
└── INDEX on exploration for the bucket queries

src/cli/commands/hooks-handlers/routing-hooks.ts — MODIFIED
└── persists exploration, criticality, q_weight into routing_outcomes when writing the sentinel

src/cli/commands/hooks-handlers/task-hooks.ts — MODIFIED
└── same persistence in pre-task sentinel

aqe learning loop-health (CLI) — EXTENDED (small)
└── new optional section: "Routing diversification" — counts last 7d
    exploit vs explore decisions, avg quality_score per bucket, avg q_weight
```

### Decision Flow

```
Hook fires (post-edit or pre-task)
  → reasoningBank.routeTask({ task })
  → stateKey = `${taskType}|${priority}|${domain}|${complexityBucket}`
  → criticality = minCut?.getCriticality(stateKey)    // ADR-047 / ADR-068 infrastructure
  → calculateAgentScores(task, agents, stateKey, ...)
      → per agent:
          (1) staticScore = domain+capability+performance+language+pattern  (existing)
          (2) qRow = SELECT q_value, visits FROM rl_q_values
                       WHERE algorithm='q-learning' AND agent_id='aqe-hook-router'
                         AND state_key=? AND action_key=?   (NEW)
          (3) qWeight = min(visits / 20, 1) * 0.4
          (4) normalizedQ = sigmoid(q_value)
          (5) effectiveScore = staticScore * (1-qWeight) + normalizedQ * qWeight

Selection (NEW)
  → epsilon = resolveExplorationRate({ envOverride, taskCriticality: criticality })
  → if random() < epsilon and agentScores.length > 1:
      pick = sample(agentScores.slice(1, 4))
      swap pick to position 0
      mark pick.exploration = true
  → recommendedAgent = agentScores[0]

Persistence (NEW fields)
  → routing_outcomes.exploration = agentScores[0].exploration ? 1 : 0
  → routing_outcomes.criticality = criticality (nullable)
  → routing_outcomes.q_weight   = avg qWeight across top-N agents
```

### Telemetry

| Metric | Source | Purpose |
|--------|--------|---------|
| `routing_outcomes.exploration` count by week | SQLite query | Validate the exploration rate matches the criticality distribution |
| Avg `quality_score` partitioned by `exploration` | SQLite query | A/B compare exploit vs explore quality — the core signal of whether exploration is finding better agents |
| `routing_outcomes.criticality` distribution | SQLite query | Confirm mincut is producing varied criticality values, not collapsing to constant |
| Avg `q_weight` across recent decisions | SQLite query | Track how much Q-value influence has matured — climbs over weeks of activity |
| Avg `q_value` per (state_key, action_key) from `rl_q_values` | SQLite query | The actual learned signal; should diverge across agents in the same state once exploration runs |
| `qe_patterns` promotion rate before/after deploy | SQLite query (manual) | Direct measurement of catalog diversification |
| `routing_outcomes` per-agent distribution before/after deploy | SQLite query (manual) | Confirms the catalog actually got sampled more broadly |

A new `aqe learning loop-health` section surfaces the first four in one query so operators don't have to write SQL.

---

## Migration Plan

### Schema Migration

Three additive `ALTER TABLE routing_outcomes` columns:
- `exploration INTEGER NOT NULL DEFAULT 0`
- `criticality REAL` (nullable — mincut may be unavailable)
- `q_weight REAL` (nullable — early decisions have no Q-data)

No data backfill. Existing rows read as exploit / null / null which preserves historical interpretability.

### Code Changes

Per the Components section. Estimated diff size: ~150-200 lines:
- `agent-routing.ts`: Q-value lookup + blend (~30 lines), `resolveExplorationRate` helper (~20 lines), `selectWithExploration` helper (~15 lines)
- `qe-reasoning-bank.ts`: mincut criticality fetch + pass-through (~10 lines)
- `routing-hooks.ts` + `task-hooks.ts`: persist new columns (~10 lines each)
- Schema migration runner: one block (~5 lines)
- `aqe learning loop-health` extension (~40 lines)

### Rollback

Three independent levers, can be applied in any combination:
- `AQE_ROUTER_EXPLORATION_RATE=0` — disables exploration; Q-blend + mincut signal still recorded for telemetry
- Set `MAX_Q_WEIGHT=0` constant in code — disables Q-blending; exploration + mincut still active
- Both above + restart kernel — fully reverts to pre-ADR routing behavior; schema columns stay (no data loss)

### Post-Deploy Smoke

1. Run `aqe init --auto` against a fresh shop with the new version
2. Issue 30 `aqe hooks post-edit` invocations with varied task descriptions
3. Verify schema migration:
   ```sql
   SELECT exploration, criticality, q_weight FROM routing_outcomes LIMIT 5
   ```
4. Verify exploration rate distribution:
   ```sql
   SELECT exploration, COUNT(*), AVG(criticality) FROM routing_outcomes GROUP BY exploration
   ```
   Expected: non-zero exploration count, with HIGHER avg criticality (more substitutable tasks were explored on).
5. Verify Q-value reads:
   ```sql
   SELECT AVG(q_weight) FROM routing_outcomes WHERE created_at > datetime('now', '-1 hour')
   ```
   Expected: starts near 0 (fresh Q-table), grows over a few sessions.
6. After a week of activity, verify catalog diversification:
   ```sql
   SELECT used_agent, COUNT(*) FROM routing_outcomes GROUP BY used_agent
   ```
   Expected: more distinct agents than pre-deploy baseline (V0.03 saw ~3; we should see ≥5 for the same workload).

---

## Risks

| Risk | Likelihood | Severity | Mitigation |
|------|-----------|----------|------------|
| Exploration picks an inferior agent on a critical task | Low | Low | Mincut modulation actively suppresses exploration at bottlenecks (criticality≈0 → ε≈0.01). Failure still triggers learning (asymmetric penalty per ADR-061). |
| Q-value blend drives early decisions before signal matures | Low | Low | qWeight ramps from 0 to 0.4 over ~20 visits per (state, action) pair. Pre-ramp behavior is identical to static-only routing. |
| User scripts depend on deterministic routing | Low | Medium | `AQE_ROUTER_EXPLORATION_RATE=0` is a one-line opt-out. Release notes call this out explicitly. |
| Per-agent Q-value lookup adds N queries per routing decision | Low | Low | Better-sqlite3 prepared-statement cache keeps lookup at ~50µs each. 5-10 queries per decision = <1ms total. Confirmed acceptable under hooks-as-producers boundary (ADR-094). |
| Mincut calculator unavailable at routing time | Low | Low | `resolveExplorationRate` falls back to fixed 0.05; Q-blend still works. Graceful degradation throughout. |
| Q-value range / sigmoid normalization choice is suboptimal | Medium | Low | The MAX_Q_WEIGHT=0.4 cap means Q-blend can never override static features completely; worst case Q-bonus is ~+0.2 on a 0-1 scale. Telemetry surfaces actual q_weight distribution so we can tune. |
| Schema migration fails on existing shops | Low | High | Additive `ALTER TABLE` is the simplest migration shape; standard better-sqlite3 / unified-memory migration pattern. Three columns added independently — failure of one doesn't block the others. |

---

## Open Questions for the Maintainer

1. **Default behavior**: Option A (default on with mincut modulation) or Option B (Q-blend only, exploration env-opt-in)? Recommendation is A.

2. **Telemetry surface**: Extend `aqe learning loop-health` with a routing-diversification section, OR introduce a separate `aqe learning routing-diversification` command?

3. **Boundary contract update**: Should `tests/unit/architecture/hooks-boundary.test.ts` (ADR-094) add `Math.random` to its allowed hook-side patterns? Hook subprocesses call `routeTask` which now uses `Math.random` for exploration — without an explicit allow, a future boundary tightening could trip on this. (Counter-argument: `Math.random` is a primitive, not a forbidden import; the boundary test currently checks for imports from `src/learning/dream/` and references to `checkAndTriggerDream`. It would not catch `Math.random` regardless. So this may be a non-issue.)

4. **Q-value reward shape**: The current Bellman update uses `reward = success ? 0.1 : -1.0` (asymmetric per ADR-061). With qWeight maxing at 0.4 and sigmoid-normalized Q values, the blend math means a "fully mature" Q-value contributes at most ±0.2 to the effective score (since sigmoid(-3) ≈ 0.05, sigmoid(+3) ≈ 0.95, * 0.4 weight). Is this contribution range right, or should MAX_Q_WEIGHT be lower (e.g. 0.2) or higher (e.g. 0.6)? Worth tuning post-deploy based on telemetry showing whether Q-values are actually separating agents.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-021 | QE ReasoningBank | Provides `routeTask` + `calculateAgentScores` to modify |
| Depends On | ADR-047 | MinCut Self-Organizing QE | Provides `MinCutCalculator` + `MinCutAwarenessMixin` for the criticality signal |
| Depends On | ADR-061 | Asymmetric Learning Rates | Failure feedback signal applies equally to explored decisions (10:1 penalty preserved) |
| Builds On | Issue #487 | `rl_q_values` population | The Bellman-update producer that #487 fixed now has a consumer; closes the loop |
| Parallel To | ADR-068 | Mincut-Gated Model Routing | Same mincut signal, different decision: ADR-068 modulates MODEL tier, this ADR modulates EXPLORATION rate. Both share the agent dependency graph maintained by ADR-068. |
| Relates To | ADR-094 | Kernel-Side Dream Cycles | Routing decision still runs in hook subprocess (~1ms total including Q-lookups); confirmed acceptable under the hooks-as-producers contract |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| ISSUE-488 | Production-readiness blind spots in post-v3.9.29 self-learning loop | GitHub Issue | https://github.com/proffesor-for-testing/agentic-qe/issues/488 (Phase 4 / C.4 section) |
| COMMIT-874ae39c | #488 Phase 3 (dream_insights TTL + bridge cursor guard) | Git | working-april branch |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Maintainer Review | 2026-05-15 | **Pending — this ADR** | After implementation lands |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed (draft 1) | 2026-05-15 | Initial draft for maintainer review per #488 Phase 4 plan. Three frequency-adaptive ε options. Q-values-unused finding called out as separate gap to defer. |
| Proposed (draft 2) | 2026-05-15 | Revised after maintainer feedback. (a) Mincut infrastructure (ADR-047 / ADR-068) was being ignored — frequency-adaptive ε replaced with mincut-modulated ε. (b) Q-value consumption was being deferred — now bundled as the second of three signals so the #487 fix has a consumer. Three-signal architecture: static score + Q-value blend + mincut-modulated ε. No code changes committed; pending maintainer decision on Options A vs B. |
| Verified (partial) | 2026-07-06 | System-integrity remediation (A16) found the mincut-modulated ε signal this ADR relies on was defeated by a structural bug: `resolveTopologyCriticalFromSharedMincut()`'s empty-graph guard checked raw vertex count, but `QueenMinCutBridge` always seeds ~14 domain-coordinator scaffold vertices — so the graph never read as "empty," the mincut computed a degenerate 0.0, and `isCritical()` returned true on every fresh topology, applying the 0.2× exploration-dampening multiplier (`agent-routing.ts:251`) regardless of whether any real agent had spawned. Also found `eventBus.subscribe` for agent-lifecycle events was a no-op stub (see ADR-047), so the graph never saw real agents in the first place, compounding the issue. Both fixed. **Verified by**: `tests/unit/learning/routing-mincut-safety-gate.test.ts` (5/5) and `tests/unit/coordination/mincut/queen-integration.test.ts` (37/37); details in `docs/plans/SYSTEM-INTEGRITY-REMEDIATION-GOAP-PLAN-2026-07-04.md` (A16). Scope note: this closes the false-positive-criticality bug specifically; the Q-value blend weighting and the three-signal architecture's end-to-end routing-quality outcome were not re-verified this pass. |
