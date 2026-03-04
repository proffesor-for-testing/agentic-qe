# Loki-Mode Integration Plan for AQE (Revised)

## Overview

This **revised** plan integrates 7 concepts from loki-mode into AQE by **extending existing infrastructure** rather than building parallel systems. A thorough codebase audit revealed that AQE already has 50-70% of the needed functionality. This plan focuses only on the **genuinely missing pieces**.

**Date**: 2026-03-04
**Base branch**: `working-branch-march`
**Estimated total effort**: ~20-30 hours (down from ~50 in v1)

---

## Codebase Audit Summary

| # | Concept | What Already Exists | What's Actually Missing |
|---|---------|-------------------|----------------------|
| 1 | Anti-Sycophancy | Devil's Advocate agent, Consensus Engine, Competing Hypotheses | Quantitative Jaccard cross-agent agreement scorer |
| 2 | Mock/Mutation Detectors | Devil's Advocate edge-case strategies (partial) | Tautological assertion, empty test, missing-import detectors |
| 3 | Blind Review | Competing Hypotheses parallel investigation | Test-gen-specific blind review with deduplication |
| 4 | EMA Calibration | Pattern Promotion (successRate), Routing Feedback (outcome tracking) | EMA-derived dynamic voting weights for agent consensus |
| 5 | Compound Learning | Experience Capture, Consolidation, Pattern Lifecycle, Learning Coordinator | Pre-task pattern injection into test generation prompts |
| 6 | Complexity Composition | AST Complexity Analyzer, Fleet Tier Selector, Routing Config | Unified 8-dim → agent team composition bridge |
| 7 | Auto-Escalation | Fleet Tier Selector (escalate/deescalate), FallbackConfig, HybridRouter failover | Consecutive-failure-triggered automatic escalation |

---

## Architecture Principles (Revised)

- **Extend, don't duplicate**: Wire into existing services via new methods or optional dependencies
- **Minimal new files**: Only create new files for genuinely new logic; add features to existing modules where natural
- **No parallel infrastructure**: Don't create new feedback/learning systems; enhance the existing ones
- **All additions are optional**: Behind config flags, existing behavior unchanged when disabled

---

## Stream A: Quality Gates (Items 1, 2)

### Item 1: Sycophancy Scorer — Extend Consensus Engine

**What exists**: `ConsensusEngineImpl` in `src/coordination/consensus/consensus-engine.ts` already orchestrates multi-model votes with weighted/unanimous strategies and tracks per-model stats (agreements, confidence).

**What to add**: A `SycophancyScorer` that runs as a **post-consensus gate** — after votes are collected but before final verdict.

**New Files** (2 files, not 4):
- `src/coordination/consensus/sycophancy-scorer.ts` (~180 lines)
- `tests/coordination/consensus/sycophancy-scorer.test.ts` (~250 lines)

**Modified Files**:
- `src/coordination/consensus/interfaces.ts` — add `SycophancyResult` type and optional `sycophancyCheck` to `ConsensusResult` (~15 lines)
- `src/coordination/consensus/consensus-engine.ts` — call scorer after vote collection, before verdict (~10 lines)

**Implementation**:
```typescript
// src/coordination/consensus/sycophancy-scorer.ts
export interface SycophancySignal {
  name: string;
  weight: number;
  score: number; // 0-1
}

export type SycophancyLevel = 'independent' | 'mild' | 'moderate' | 'severe';

export interface SycophancyResult {
  level: SycophancyLevel;
  compositeScore: number;
  signals: SycophancySignal[];
  recommendation: string;
}

export class SycophancyScorer {
  evaluate(votes: ModelVote[]): SycophancyResult {
    // 4 signals computed from existing ModelVote data:
    // 1. Verdict unanimity (30%): all votes same verdict?
    // 2. Reasoning similarity (30%): Jaccard on tokenized justifications
    // 3. Confidence uniformity (20%): std dev of confidence scores
    // 4. Issue count consistency (20%): variation in reported issue counts
  }
}
```

**Why this is better than v1 plan**: Reuses existing `ModelVote` type (already has `vote`, `confidence`, `justification`, `issuesFound`). No need for a new `AgentFinding` type. Integrates directly into the consensus flow that already exists.

**Integration**: `ConsensusEngineImpl.verify()` → collect votes → `sycophancyScorer.evaluate(votes)` → attach to `ConsensusResult` → if `severe`, escalate to human review (existing `humanReview` threshold path).

**Also integrates with**: `DevilsAdvocate` — when sycophancy is `severe`, automatically trigger a Devil's Advocate review (existing agent, just needs a trigger).

**Success Criteria**:
- [ ] 3 identical votes → `severe`; 3 divergent votes → `independent`
- [ ] Integrated into `ConsensusEngineImpl` without breaking existing tests
- [ ] Triggers Devil's Advocate on `severe` sycophancy

---

### Item 2: Test Quality Gates (Mock/Mutation Detectors)

**What exists**: Devil's Advocate `MissingEdgeCaseStrategy` checks for null/boundary/concurrency coverage in test output. But it operates on output metadata, not on **test code itself**.

**What's genuinely new**: Regex-based detection of tautological assertions, empty test bodies, and missing source imports in **generated test code strings**. This is a distinct concern from DA strategies.

**New Files** (3 files):
- `src/domains/test-generation/gates/test-quality-gate.ts` (~250 lines, combines mock + mutation detection)
- `src/domains/test-generation/gates/index.ts` (~10 lines)
- `tests/domains/test-generation/gates/test-quality-gate.test.ts` (~300 lines)

**Modified Files**:
- `src/domains/test-generation/services/test-generator.ts` — add optional gate call after generation (~15 lines)
- `src/domains/test-generation/interfaces.ts` — add `TestQualityIssue` to `GeneratedTest` metadata (~5 lines)

**Implementation** (single file, not split):
```typescript
// src/domains/test-generation/gates/test-quality-gate.ts
export interface TestQualityIssue {
  type: 'no-source-import' | 'tautological-assertion' | 'empty-test-body' | 'mirrored-assertion';
  severity: 'error' | 'warning';
  line?: number;
  description: string;
}

export interface TestQualityGateResult {
  passed: boolean;
  issues: TestQualityIssue[];
  score: number; // 0-100
}

export class TestQualityGate {
  validate(testCode: string, sourceFilePath: string): TestQualityGateResult {
    const issues: TestQualityIssue[] = [];
    // 1. Check imports reference source file
    // 2. Detect tautological: expect(true).toBe(true), expect(x).toBe(x)
    // 3. Detect empty bodies: it('...', () => {}) or test('...', () => {})
    // 4. Detect mirrored assertions (values copied from source literals)
  }
}
```

**Why combined**: Mock detector and mutation detector share the same test-code-analysis context. A single class with 4 check methods is cleaner than 2 separate files.

**Config**: `TestGeneratorConfig.enableTestQualityGate?: boolean` (default: false)

**Success Criteria**:
- [ ] Detects `expect(true).toBe(true)` as tautological
- [ ] Detects test file with zero source imports
- [ ] Detects empty test bodies
- [ ] Score of 100 for well-formed tests
- [ ] Integrated behind config flag, no regression

---

## Stream B: Agent Composition (Items 3, 6)

### Item 3: Blind Review for Test Generation — Extend Competing Hypotheses

**What exists**: `HypothesisManager` (`src/coordination/competing-hypotheses/hypothesis-manager.ts`) runs N parallel agents on different hypotheses and converges via evidence-weighted scoring.

**What's actually needed**: A thin wrapper that uses the existing parallel execution pattern but specialized for test generation with deduplication.

**New Files** (2 files):
- `src/domains/test-generation/blind-review/blind-review-orchestrator.ts` (~200 lines)
- `tests/domains/test-generation/blind-review/blind-review-orchestrator.test.ts` (~250 lines)

**No modified files** — this is a new optional MCP tool path.

**Implementation**:
```typescript
// Reuses TestGeneratorService (existing) with varied temperatures
// Reuses cosineSimilarity from shared/utils/vector-math.ts (existing)
// Does NOT create a new investigation framework — just Promise.all + dedup

export class BlindReviewOrchestrator {
  constructor(
    private testGenerator: ITestGenerationService,
    private config: BlindReviewConfig = DEFAULT_CONFIG
  ) {}

  async generateWithBlindReview(request: GenerateTestsRequest): Promise<Result<BlindReviewResult, Error>> {
    // 1. Run testGenerator N times in parallel with different temperatures
    // 2. Collect all generated tests
    // 3. Deduplicate using Jaccard on tokenized assertions (reuse cosineSimilarity)
    // 4. Return merged set with uniqueness stats
  }
}
```

**Why simpler than v1**: No need for a separate `TestDeduplicator` class — deduplication is ~30 lines of Jaccard comparison, not worth a separate module. No need for a new MCP tool in v1 — expose via existing `test_generate_enhanced` with a `blindReview: true` option.

---

### Item 6: Complexity-Driven Composition — Bridge Existing Systems

**What exists separately**:
- `RuVectorASTComplexityAnalyzer` → cyclomatic, cognitive, LOC, maintainability
- `TierSelector` → smoke/standard/deep/crisis based on trigger context
- `QETaskRouter` → domain keyword matching + capability scoring
- `ComplexityTierMapping` in routing config → maps complexity scores to agent tiers

**What's missing**: A bridge that takes AST complexity output + security/concurrency signals and produces a specific agent team composition.

**New Files** (2 files):
- `src/coordination/complexity-composition/team-composer.ts` (~200 lines)
- `tests/coordination/complexity-composition/team-composer.test.ts` (~250 lines)

**Modified Files**:
- `src/coordination/fleet-tiers/tier-selector.ts` — add optional `ITeamComposer` that enriches tier selection with agent recommendations (~15 lines)

**Implementation**:
```typescript
// Consumes existing ComplexityMetrics from ruvector/interfaces.ts
// Consumes existing FleetTier from fleet-tiers/types.ts
// Adds security/concurrency dimension detection (regex-based, ~50 lines)

export class TeamComposer {
  compose(
    complexity: ComplexityMetrics,  // Existing type from ruvector
    tier: FleetTier,               // Existing type from fleet-tiers
    sourceCode: string             // For security/concurrency scanning
  ): AgentComposition {
    // Base agents from tier (existing mapping)
    // + security agent if auth/crypto/token keywords found
    // + chaos agent if async/Promise/shared-state patterns found
    // + integration agent if high API surface
  }
}
```

**Why better**: Reuses `ComplexityMetrics` (4 dimensions already computed) instead of building a new 8-dimension classifier from scratch. Adds only the 4 missing dimensions (security, concurrency, data-flow, API-surface) as lightweight regex checks, not full AST analysis.

---

## Stream C: Routing Enhancements (Items 4, 7)

### Item 4: EMA Calibration — Extend Routing Feedback

**What exists**: `RoutingFeedbackCollector.recordOutcome()` already records per-agent success/failure with quality scores and persists to SQLite. `PatternPromotionManager` already tracks `successRate` and `recentSuccessRate`.

**What's missing**: Computing an EMA from these outcomes and deriving a dynamic voting weight.

**New Files** (1 file + 1 test):
- `src/routing/calibration/ema-calibrator.ts` (~150 lines — simpler since persistence infra exists)
- `tests/routing/calibration/ema-calibrator.test.ts` (~200 lines)

**Modified Files**:
- `src/routing/routing-feedback.ts` — call `calibrator.recordOutcome()` in existing `recordOutcome()` method (~8 lines)
- `src/routing/types.ts` — add optional `calibratedWeight: number` to `AgentPerformanceMetrics` (~3 lines)

**Implementation note**: The existing `updatePatternFeedback` in `LearningCoordinatorService` already uses an EMA pattern (alpha=0.1) for pattern success rates. The new calibrator follows the same pattern for agent-level calibration, so it's architecturally consistent.

**Success Criteria**:
- [ ] EMA converges correctly over 100 outcomes
- [ ] Weight floor (0.2) and ceiling (2.0) enforced
- [ ] Integrates with existing `RoutingFeedbackCollector` SQLite persistence
- [ ] `QETaskRouter` can optionally use calibrated weights

---

### Item 7: Auto-Escalation — Extend Fleet Tier Selector

**What exists**: `TierSelector` already has `escalate(currentTier, reason)` and `deescalate(currentTier)` methods. `FallbackConfig` has a `chain: Record<AgentTier, AgentTier | null>`. But escalation is only triggered manually or by context (PR size, domain count).

**What's missing**: Automatic triggering based on consecutive failure/success counts.

**New Files** (1 file + 1 test):
- `src/routing/escalation/auto-escalation-tracker.ts` (~120 lines)
- `tests/routing/escalation/auto-escalation-tracker.test.ts` (~200 lines)

**Modified Files**:
- `src/routing/routing-feedback.ts` — call tracker after outcome recording (~8 lines)

**Implementation**:
```typescript
// Lightweight — just tracks consecutive outcomes and triggers existing escalation
export class AutoEscalationTracker {
  private state = new Map<string, { failures: number; successes: number; currentTier: AgentTier }>();

  recordOutcome(agentId: string, success: boolean, baseTier: AgentTier): {
    action: 'escalate' | 'de-escalate' | 'none';
    newTier: AgentTier;
  } {
    // Track consecutive failures/successes
    // Return escalation recommendation
    // Caller (RoutingFeedbackCollector) applies via existing FallbackConfig.chain
  }
}
```

**Why simpler**: Doesn't duplicate `TierSelector.escalate()`/`deescalate()`. Just provides the trigger logic; the existing tier system does the actual tier change.

---

## Stream D: Learning Enhancement (Item 5)

### Item 5: Pre-Task Pattern Injection — Extend Experience Capture

**What exists**:
- `ExperienceCaptureService` captures task experiences with pattern extraction (post-task ✓)
- `PatternStore` stores/retrieves patterns with HNSW search
- `LearningCoordinatorService.mineInsights()` extracts patterns from experience clusters
- `TestGeneratorService` already has LLM enhancement with prompt construction

**What's genuinely missing**: The "pre-task injection" step — querying historical edge-case patterns and prepending them to the LLM prompt before test generation.

**New Files** (1 file + 1 test):
- `src/domains/test-generation/pattern-injection/edge-case-injector.ts` (~150 lines)
- `tests/domains/test-generation/pattern-injection/edge-case-injector.test.ts` (~200 lines)

**Modified Files**:
- `src/domains/test-generation/services/test-generator.ts` — call injector before LLM enhancement, prepend context to prompt (~15 lines)

**Implementation**:
```typescript
// Uses existing PatternStore.search() for retrieval
// Uses existing MemoryBackend for storage
// Formats top-3 patterns into prompt context string

export class EdgeCaseInjector {
  constructor(private patternStore: PatternStore) {}

  async getInjectionContext(
    sourceCode: string,
    domain: QEDomain,
    topN: number = 3
  ): Promise<{ promptContext: string; patternsUsed: number }> {
    // 1. Search patternStore for edge-case patterns matching domain + code characteristics
    // 2. Rank by (successRate * applicationCount) descending
    // 3. Format top-N as prompt context:
    //    "## Edge cases that caught real bugs in similar code:\n1. ..."
    // 4. Return formatted string for prepending to LLM prompt
  }
}
```

**Why simpler**: Doesn't create a new extraction step (ExperienceCaptureService already does this). Only adds the injection side. Reuses existing `PatternStore.search()` instead of creating parallel retrieval logic.

**Config**: `TestGeneratorConfig.enableEdgeCaseInjection?: boolean` (default: false)

---

## Revised Implementation Milestones

### Milestone 1: Core Logic (3-4 days)

All new modules — can run fully in parallel since no file conflicts:

| Work Item | New Files | Lines | Stream |
|-----------|-----------|-------|--------|
| Sycophancy Scorer | 2 | ~430 | A |
| Test Quality Gate | 2 | ~550 | A |
| Blind Review Orchestrator | 2 | ~450 | B |
| Team Composer | 2 | ~450 | B |
| EMA Calibrator | 2 | ~350 | C |
| Auto-Escalation Tracker | 2 | ~320 | C |
| Edge Case Injector | 2 | ~350 | D |
| **Total** | **14** | **~2,900** | |

### Milestone 2: Integration Wiring (1-2 days)

Sequenced where files overlap:

| Integration | Modifies | Depends On |
|-------------|----------|------------|
| Wire sycophancy into ConsensusEngine | `consensus-engine.ts`, `interfaces.ts` | Item 1 |
| Wire quality gate into TestGenerator | `test-generator.ts` | Item 2 |
| Wire EMA into RoutingFeedback | `routing-feedback.ts`, `types.ts` | Item 4 |
| Wire auto-escalation into RoutingFeedback | `routing-feedback.ts` | Item 7 (after Item 4) |
| Wire edge-case injection into TestGenerator | `test-generator.ts` | Item 5 (after Item 2) |
| Wire team composer into TierSelector | `tier-selector.ts` | Item 6 |

### Milestone 3: Validation (1 day)

- Run full test suite (`npm test -- --run`)
- Build verification (`npm run build`)
- Spot-check each feature with synthetic data

---

## File Conflict Matrix (Revised)

| Existing File | Item 1 | Item 2 | Item 3 | Item 4 | Item 5 | Item 6 | Item 7 |
|---------------|--------|--------|--------|--------|--------|--------|--------|
| `consensus/consensus-engine.ts` | M | | | | | | |
| `consensus/interfaces.ts` | M | | | | | | |
| `test-generation/services/test-generator.ts` | | M | | | M | | |
| `routing/routing-feedback.ts` | | | | M | | | M |
| `routing/types.ts` | | | | M | | | |
| `fleet-tiers/tier-selector.ts` | | | | | | M | |

**Parallel Groups**:
```
Group 1 (fully parallel — zero file overlap):
  - Item 1 (sycophancy scorer)       → consensus files
  - Item 3 (blind review)            → new files only
  - Item 4 (EMA calibrator)          → routing files
  - Item 6 (team composer)           → fleet-tiers files

Group 2 (after Group 1 — sequenced for shared files):
  - Item 2 (test quality gate)       → test-generator.ts
  - Item 5 (edge case injector)      → test-generator.ts (after Item 2)
  - Item 7 (auto-escalation)         → routing-feedback.ts (after Item 4)
```

---

## Comparison: v1 Plan vs Revised Plan

| Metric | v1 Plan | Revised Plan | Improvement |
|--------|---------|-------------|-------------|
| New files | 36 | 14 | -61% |
| Estimated lines | ~4,650 | ~2,900 | -38% |
| Modified existing files | 7 | 7 | Same |
| New types/interfaces | ~15 | ~7 | -53% |
| Duplicate infrastructure | High (new feedback, new learning) | None | Eliminated |
| Risk of regression | Medium | Low | Reduced |

---

## Agent Assignment (Revised)

| QE Agent | Items | Role |
|----------|-------|------|
| `qe-code-intelligence` | 1, 6 | Sycophancy scoring, team composition |
| `qe-test-generator` | 2, 3, 5 | Quality gate, blind review, injection |
| `qe-defect-predictor` | 4 | EMA calibration |
| `qe-test-executor` | 7 | Auto-escalation tracking |

---

## Configuration Summary

```typescript
// TestGeneratorConfig (existing)
enableTestQualityGate?: boolean;     // Item 2 (default: false)
enableEdgeCaseInjection?: boolean;   // Item 5 (default: false)

// ConsensusEngineConfig (existing)
enableSycophancyCheck?: boolean;     // Item 1 (default: false)

// RoutingConfig (existing)
enableEMACalibration?: boolean;      // Item 4 (default: false)
enableAutoEscalation?: boolean;      // Item 7 (default: false)

// TierConfig (existing)
enableComplexityComposition?: boolean; // Item 6 (default: false)
```

All features enabled by default (opt-out) — disable individually via config flags if needed.
