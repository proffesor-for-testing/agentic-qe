# ADR-062: StrongDM Software Factory Integration

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-062 |
| **Status** | Accepted |
| **Date** | 2026-02-08 |
| **Author** | Architecture Team |
| **Analysis Method** | Six Thinking Hats |
| **Review Cadence** | 3 months (per-tier gate review) |
| **Implementation Plan** | [strongdm-implementation-plan.md](../../../docs/strongdm-implementation-plan.md) |
| **Analysis Report** | [six-hats-strongdm-analysis.md](../../../docs/six-hats-strongdm-analysis.md) |

---

## WH(Y) Decision Statement

**In the context of** AQE v3 agents executing multi-step quality engineering workflows where tool-call loops waste tokens undetected, token spending is invisible to users, generated test quality degrades silently over time, quality gate thresholds stagnate, agents receive full codebase context on every spawn, and subsystem metrics are siloed without cross-cutting optimization,

**facing** (1) agents entering infinite tool-call loops that consume $50+/week in wasted tokens with no automatic detection, (2) users having no visibility into token spending or budget utilization, (3) no holdout mechanism to validate generated tests remain effective, (4) static coherence gate thresholds that never improve as the system matures, (5) full context loading on agent spawn wasting 40%+ tokens on irrelevant files, and (6) individual subsystem metrics never correlated to discover meta-level optimizations,

**we decided for** implementing 6 actions across 3 time-boxed tiers using hierarchical swarm orchestration with 8 specialized agents, each action guarded by a feature flag and gated by build+test+lint checks between tiers — extending existing infrastructure (EventBus, Strange Loop, ReasoningBank, TokenTracker, CoherenceGates, HNSW memory) rather than building new systems,

**and neglected** (a) implementing all 6 actions simultaneously (rejected: too many concurrent file changes, high conflict risk), (b) skipping Tier 3 actions (rejected: progressive context and meta-learning provide the highest long-term ROI), (c) using external tools for loop detection (rejected: tight integration with EventBus and Strange Loop required), (d) building a standalone monitoring dashboard (rejected: token data already exists in TokenTracker, just needs surfacing),

**to achieve** automatic tool-call loop detection with 3-strike steering ($50+/week savings), user-visible token budget dashboards via CLI and MCP, holdout test integrity validation, monotonically-ratcheting quality gate thresholds, HNSW-predicted context loading on agent spawn (40% token reduction), and closed-loop meta-optimization across all subsystems,

**accepting that** Tier 3 actions (progressive context, meta-learning) carry behavior-change risk requiring feature-flag rollout, auto-ratcheting could make gates too strict if cooldown/ceiling misconfigured, the full 6-action implementation spans 10 weeks, and estimated token cost is $12-$60 across ~200 agent tasks.

---

## Context

A Six Thinking Hats analysis of StrongDM Software Factory recommendations identified 6 gaps in AQE v3:

| Problem | Current State | Impact | Affected ADRs |
|---------|---------------|--------|---------------|
| Tool-call loops | No detection | $50+/week token waste | ADR-031, ADR-060 |
| Token cost invisibility | Internal tracking only | Users cannot manage spend | ADR-042 |
| Test quality degradation | No holdout validation | Silent coverage rot | ADR-005, ADR-056 |
| Static quality gates | Fixed thresholds | Quality plateau | ADR-030, ADR-052 |
| Context overloading | Full codebase per spawn | 40%+ token waste | ADR-008 |
| Siloed metrics | Per-subsystem only | No cross-cutting optimization | ADR-024 |

### Six Thinking Hats Analysis Summary

| Hat | Key Findings |
|-----|--------------|
| White (Facts) | 6 concrete gaps identified; existing infrastructure supports all fixes |
| Red (Intuition) | Loop detection and token dashboard are quick wins; meta-learning is ambitious |
| Black (Risks) | Auto-ratcheting too-strict risk; progressive context behavior change; 10-week sustained effort |
| Yellow (Benefits) | $50+/week loop savings; 40% context token reduction; self-improving gates |
| Green (Ideas) | FNV-1a signature hashing; HNSW context prediction; unified metrics snapshot |
| Blue (Action) | 3-tier rollout; parallel within tiers; gate checks between tiers; feature flags |

---

## Options Considered

### Option 1: Tiered Implementation with Parallel Execution (Selected)

6 actions across 3 tiers. Tier 1 (loop detection + token dashboard) runs first. Tier 2 (holdout + ratcheting) after gate check. Tier 3 (context + meta-learning) after second gate check. Actions within each tier run in parallel where file ownership does not conflict.

**Pros:**
- Limited blast radius; each tier independently valuable
- Parallel execution maximizes throughput without file conflicts
- Feature flags enable instant runtime rollback
- Builds on existing infrastructure (no new systems)
- $12-$60 estimated cost for full implementation

**Cons:**
- 10-week sustained effort
- Tier 3 carries behavior-change risk
- Requires coordination across 8 agents

### Option 2: Implement All 6 Actions Simultaneously (Rejected)

**Why rejected:** Too many concurrent file changes across overlapping modules. Anti-drift middleware, EventBus, ReasoningBank, and quality gates would all be modified simultaneously, creating high conflict risk and making rollback difficult.

### Option 3: Skip Tier 3 (Context + Meta-Learning) (Rejected)

**Why rejected:** Progressive context revelation (Action 5) and meta-learning (Action 6) provide the highest long-term ROI. Context prediction alone targets 40% token reduction per spawn. Meta-learning enables self-optimization that compounds over time.

### Option 4: External Loop Detection Tool (Rejected)

**Why rejected:** Tight integration with EventBus (`loop.detected` events), Strange Loop (healing-controller response), and ReasoningBank (pattern storage for fleet learning) cannot be achieved with an external tool.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    TIER 1 (This Week)                         │
│                                                              │
│  Action 1: Loop Detection         Action 2: Token Dashboard  │
│  ┌────────────────────┐          ┌────────────────────┐     │
│  │ ToolCallSignature  │          │ formatDashboard     │     │
│  │ Tracker            │          │ Summary()           │     │
│  │ (anti-drift-       │          │ (token-tracker.ts)  │     │
│  │  middleware.ts)     │          │                     │     │
│  └────────┬───────────┘          │ getSessionCost      │     │
│           │                      │ Summary()           │     │
│  ┌────────▼───────────┐          │ (budget-enforcer.ts)│     │
│  │ EventBus           │          └────────┬────────────┘     │
│  │ loop.warning       │                   │                  │
│  │ loop.detected      │          ┌────────▼────────────┐     │
│  └────────┬───────────┘          │ CLI --dashboard     │     │
│           │                      │ MCP dashboard op    │     │
│  ┌────────▼───────────┐          └─────────────────────┘     │
│  │ Strange Loop       │                                      │
│  │ HealingController  │                                      │
│  │ ReasoningBank      │                                      │
│  └────────────────────┘                                      │
│                                                              │
│  ═══════════════ GATE CHECK ═══════════════════════════════  │
│  build + test + lint + zero regressions                      │
├──────────────────────────────────────────────────────────────┤
│                    TIER 2 (This Month)                        │
│                                                              │
│  Action 3: Holdout Testing     Action 4: Gate Ratcheting     │
│  10% holdout selection         Monotonic threshold increase   │
│  CI-only holdout runs          5 consecutive passes → +2%    │
│  Pass rate trend tracking      Max ceiling, cooldown period   │
│                                                              │
│  ═══════════════ GATE CHECK ═══════════════════════════════  │
├──────────────────────────────────────────────────────────────┤
│                    TIER 3 (This Quarter)                      │
│                                                              │
│  Action 5: Progressive Context → Action 6: Meta-Learning     │
│  HNSW context prediction        Unified metrics snapshot     │
│  Lazy/predictive spawn          Meta-optimization patterns   │
│  File request tracking          Self-optimization lifecycle  │
└──────────────────────────────────────────────────────────────┘
```

### Swarm Orchestration

| Agent ID | Agent Type | Role | Actions |
|----------|-----------|------|---------|
| `sdm-coord` | `hierarchical-coordinator` | Orchestrator, gate checks | Coordination |
| `sdm-loop-coder` | `coder` | Loop detection implementation | 1 |
| `sdm-loop-tester` | `tester` | Loop detection tests | 1 |
| `sdm-token-coder` | `coder` | Token dashboard | 2 |
| `sdm-holdout-coder` | `coder` | Holdout testing | 3 |
| `sdm-gate-coder` | `coder` | Gate ratcheting | 4 |
| `sdm-context-coder` | `coder` | Progressive context | 5 |
| `sdm-meta-coder` | `coder` | Meta-learning loop | 6 |

### Feature Flags for Runtime Rollback

| Action | Feature Flag | Default |
|--------|-------------|---------|
| 1 | `AQE_LOOP_DETECTION_ENABLED` | `true` |
| 2 | `AQE_TOKEN_DASHBOARD_ENABLED` | `true` |
| 3 | `AQE_HOLDOUT_TESTING_ENABLED` | `false` |
| 4 | `AQE_GATE_RATCHETING_ENABLED` | `false` |
| 5 | `AQE_PROGRESSIVE_CONTEXT_ENABLED` | `false` |
| 6 | `AQE_META_LEARNING_ENABLED` | `false` |

Feature flags are checked at the entry point of each new code path. If disabled, code falls through to existing behavior with zero overhead.

---

## Modifications to Existing Files

### Tier 1

| File | Owner Agent | Action | Modification |
|------|------------|--------|--------------|
| `v3/src/kernel/anti-drift-middleware.ts` | `sdm-loop-coder` | 1 | Add `ToolCallSignatureTracker` class with FNV-1a hashing and 3-strike sliding window |
| `v3/src/kernel/event-bus.ts` | `sdm-loop-coder` | 1 | Add `loop.warning` and `loop.detected` event types |
| `v3/src/strange-loop/strange-loop.ts` | `sdm-loop-coder` | 1 | Add `loop.detected` event handler for Observe-Model-Decide-Act cycle |
| `v3/src/strange-loop/healing-controller.ts` | `sdm-loop-coder` | 1 | Add `loopDetected` to `SelfHealingActionType` union |
| `v3/src/hooks/cross-phase-hooks.ts` | `sdm-loop-coder` | 1 | Add `loop-detected` hook trigger type |
| `v3/src/learning/real-qe-reasoning-bank.ts` | `sdm-loop-coder` | 1 | Add `storeLoopPattern()` method |
| `v3/src/learning/token-tracker.ts` | `sdm-token-coder` | 2 | Add `formatDashboardSummary()` static method |
| `v3/src/integrations/agentic-flow/model-router/budget-enforcer.ts` | `sdm-token-coder` | 2 | Add `getSessionCostSummary()` method |
| `v3/src/mcp/tools/analysis/token-usage.ts` | `sdm-token-coder` | 2 | Add `dashboard` operation to MCP tool |
| `v3/src/cli/commands/token-usage.ts` | `sdm-token-coder` | 2 | Add `--dashboard` CLI flag |
| `v3/src/optimization/token-optimizer-service.ts` | `sdm-token-coder` | 2 | Wire dashboard into optimizer output |

### Tier 2

| File | Owner Agent | Action | Modification |
|------|------------|--------|--------------|
| `v3/src/domains/test-generation/interfaces/test-generator.interface.ts` | `sdm-holdout-coder` | 3 | Add `holdout` metadata field |
| `v3/src/domains/test-generation/services/test-generator.ts` | `sdm-holdout-coder` | 3 | Implement 10% holdout selection |
| `v3/src/domains/test-generation/services/tdd-generator.ts` | `sdm-holdout-coder` | 3 | Propagate holdout flag |
| `v3/src/domains/quality-assessment/coherence/gate-controller.ts` | `sdm-gate-coder` | 4 | Add `checkRatchet()` with monotonic invariant |
| `v3/src/domains/quality-assessment/coherence/lambda-calculator.ts` | `sdm-gate-coder` | 4 | Read ratcheted thresholds |
| `v3/src/domains/quality-assessment/coherence/types.ts` | `sdm-gate-coder` | 4 | Add `RatchetConfig` and `RatchetHistory` types |

### Tier 3

| File | Owner Agent | Action | Modification |
|------|------------|--------|--------------|
| `v3/src/kernel/interfaces.ts` | `sdm-context-coder` | 5 | Add `ContextStrategy` to `AgentSpawnConfig` |
| `v3/src/kernel/agent-coordinator.ts` | `sdm-context-coder` | 5 | Implement lazy/predictive context loading |
| `v3/src/learning/metrics-tracker.ts` | `sdm-meta-coder` | 6 | Add `UnifiedMetricsSnapshot` |
| `v3/src/learning/pattern-store.ts` | `sdm-meta-coder` | 6 | Add `meta-optimization` pattern type |
| `v3/src/learning/aqe-learning-engine.ts` | `sdm-meta-coder` | 6 | Add `runMetaLearningCycle()` |

---

## New Files

### Tier 1

| File | Purpose |
|------|---------|
| `v3/tests/unit/kernel/loop-detection.test.ts` | 6+ tests: 3-strike detection, sliding window expiry, steering message |
| `v3/tests/unit/kernel/anti-drift-loop.test.ts` | 3+ tests: integration between anti-drift middleware and loop detection |

### Tier 2

| File | Purpose |
|------|---------|
| `v3/tests/unit/domains/test-generation/holdout.test.ts` | 6+ tests: deterministic selection, TDD propagation, CI filtering |
| `v3/tests/unit/domains/quality-assessment/ratcheting.test.ts` | 8+ tests: monotonic invariant, cooldown, ceiling, persistence |

### Tier 3

| File | Purpose |
|------|---------|
| `v3/tests/unit/kernel/progressive-context.test.ts` | 8+ tests: lazy spawn, HNSW prediction, file request tracking |
| `v3/tests/unit/learning/meta-learning.test.ts` | 8+ tests: unified metrics, meta-pattern lifecycle, auto-apply threshold |

---

## Implementation

### Key Types (Action 1)

```typescript
export interface ToolCallSignature {
  readonly hash: string;           // FNV-1a hash of tool name + args
  readonly toolName: string;
  readonly argsFingerprint: string;
  readonly timestamp: number;
}

export interface LoopDetectionConfig {
  readonly maxIdenticalCalls: number;    // default: 3
  readonly windowMs: number;             // default: 30000
  readonly steeringMessage: string;
  readonly enableFleetLearning: boolean;
}

export interface LoopDetectionResult {
  readonly isLoop: boolean;
  readonly callCount: number;
  readonly signature: ToolCallSignature;
  readonly action: 'allow' | 'warn' | 'steer';
}
```

### Key Types (Action 4)

```typescript
export interface RatchetConfig {
  enabled: boolean;
  consecutivePassesRequired: number; // default: 5
  ratchetIncrementPercent: number;   // default: 2
  maxThreshold: number;              // default: 95
  monotonic: true;                   // enforced by type system
  cooldownMs: number;                // default: 7 days
}
```

### Dependency Rules

| Rule | Description |
|------|-------------|
| PARALLEL | Actions 1 and 2 run concurrently (Tier 1) |
| PARALLEL | Actions 3 and 4 run concurrently (Tier 2) |
| SEQUENTIAL | Action 5 starts only after Tier 2 gate passes |
| SEQUENTIAL | Action 6 starts only after Action 5 completes |
| GATE | Tier 1 gate must pass before Tier 2 begins |
| GATE | Tier 2 gate must pass before Tier 3 begins |

### File Ownership Invariant

Each file is owned by exactly one agent. No two agents edit the same file. If a file requires changes from multiple actions, it is assigned to the primary action agent and the secondary action stores requirements in shared memory (`aqe/strongdm-impl/coordination` namespace) for the primary agent to implement.

---

## Verification

### Tier 1 Gate

```bash
npm run build && npm test -- --run && npm run lint
# Smoke test: loop-detection.test.ts passes (3-strike detection works)
# Smoke test: --dashboard flag produces non-empty output
```

### Tier 2 Gate

```bash
npm run build && npm test -- --run && npm run lint
# Smoke test: holdout.test.ts passes (10% selection is deterministic)
# Smoke test: ratcheting.test.ts passes (monotonic invariant holds)
```

### Tier 3 Gate

```bash
npm run build && npm test -- --run && npm run lint
# Smoke test: progressive-context.test.ts passes (lazy spawn works)
# Smoke test: meta-learning.test.ts passes (cycle completes)
# Benchmark: token usage per spawn >= 20% reduction
```

---

## Rollback Plan

### Per-Action Rollback

Each action implemented in a separate git branch (`strongdm/action-N-*`). If an action fails gate checks, its branch is abandoned.

### Runtime Rollback

Feature flags (`AQE_*_ENABLED`) can disable any action instantly without code changes. Tier 1 and 2 flags default to enabled; Tier 3 flags default to disabled (opt-in during validation).

### Emergency Rollback

1. Set all feature flags to `false` (immediate, no deploy needed)
2. Revert merge commit on `main`
3. Clear HNSW memory namespaces (`aqe/strongdm-impl/*`)

---

## Success Metrics

| Action | Metric | Target | Measurement |
|--------|--------|--------|-------------|
| 1 | Token waste prevented per week | > $50 saved | Count prevented loops x avg loop cost |
| 2 | User engagement with cost data | > 60% sessions | Track `--dashboard` CLI and MCP `dashboard` invocations |
| 3 | Holdout pass rate trend | Improving MoM | Monthly holdout pass rate comparison |
| 4 | Gate threshold increases per quarter | 2-3 ratchets | Count `RatchetHistory` entries per quarter |
| 5 | Tokens per agent spawn | -40% reduction | Compare `avgTokensPerSpawn` before/after |
| 6 | Self-optimization suggestions adopted | > 5/month | Count meta-patterns with `confidence > 0.9` promoted |

---

## References

| ADR | Relevance |
|-----|-----------|
| [ADR-021](./v3-adrs.md#adr-021-qe-reasoningbank-for-pattern-learning) | Loop pattern storage (Action 1), meta-patterns (Action 6) |
| [ADR-030](./v3-adrs.md#adr-030-coherence-gated-quality-gates) | Coherence gates (Action 4) |
| [ADR-031](./v3-adrs.md#adr-031-strange-loop-self-awareness) | Loop detection healing (Action 1) |
| [ADR-042](./v3-adrs.md#adr-042-v3-qe-token-tracking-integration) | Token dashboard (Action 2) |
| [ADR-052](./ADR-052-coherence-gated-qe.md) | Gate ratcheting (Action 4) |
| [ADR-056](./ADR-056-skill-validation-system.md) | Holdout integration (Action 3) |
| [ADR-060](./ADR-060-semantic-anti-drift.md) | Anti-drift middleware (Action 1) |

### Future ADRs

Individual actions may spawn detailed ADRs as implementation progresses:

| Proposed ADR | Title | Triggered By |
|-------------|-------|-------------|
| ADR-063 | Holdout Test Framework | Action 3 |
| ADR-064 | Coherence Gate Auto-Ratcheting | Action 4 |
| ADR-065 | Progressive Context Revelation | Action 5 |
| ADR-066 | Meta-Learning Optimization Loop | Action 6 |

---

*ADR created: 2026-02-08*
*Status: Accepted*
*Decision Authority: Architecture Team*
