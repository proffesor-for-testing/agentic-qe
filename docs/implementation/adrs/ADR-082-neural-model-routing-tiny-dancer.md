# ADR-082: Neural Model Routing with Tiny Dancer (FastGRNN)

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-082 |
| **Status** | Proposed |
| **Date** | 2026-03-15 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** AQE v3's 3-tier model routing system (ADR-026) which uses static complexity percentage thresholds to route tasks to Agent Booster (<1ms, $0), Haiku (~500ms, $0.0002), or Sonnet/Opus (2-5s, $0.003-$0.015), with ADR-068 adding topology-aware mincut gating but still relying on rule-based threshold computation,

**facing** the limitation that rule-based routing -- even when topology-aware -- cannot learn from historical outcomes to improve future routing decisions, cannot account for multi-signal task characteristics (semantic content, recency, frequency, past success rate) simultaneously, and wastes an estimated 70-85% of model spend by routing tasks to higher tiers than they require because static rules cannot capture the nuanced boundary between "Haiku is adequate" and "this needs Opus",

**we decided for** replacing the rule-based routing layer with ruvector-tiny-dancer-node's FastGRNN (Fast, Gated, Rank-constrained Recurrent Neural Network) as the primary routing decision engine, which scores routing candidates across multiple signals in 7.5us per candidate (8.83us for 10 candidates) using <1MB models with 80-90% sparsity, while retaining the mincut criticality signal (ADR-068) as one of the scoring inputs alongside semantic similarity, task recency, frequency, and historical success rate,

**and neglected** (a) keeping rule-based routing with more complex threshold formulas (rejected: rule explosion as signals multiply; 5 signals with 3 thresholds each = 243 rule combinations), (b) using a full transformer model for routing decisions (rejected: 100-1000x higher latency than FastGRNN, overkill for a routing decision), (c) a lookup table based on task-type history (rejected: does not generalize to novel task types, requires manual maintenance),

**to achieve** 70-85% reduction in model routing costs by learning the minimum tier that produces acceptable quality for each task profile, sub-10us routing decisions that do not add perceptible latency to the task execution pipeline, continuous improvement from outcome feedback (successful task results reinforce routing decisions, failures trigger tier escalation learning), and multi-signal scoring that considers structural criticality, semantic content, recency, frequency, and success history simultaneously,

**accepting that** this introduces @ruvector/tiny-dancer-node as a routing dependency, requires an A/B testing period (minimum 2 weeks) where neural and rule-based routing run in parallel to validate cost savings without quality regression, FastGRNN model weights must be persisted across restarts (integrated with RVF persistence per ADR-065), and the model requires approximately 50 routing outcomes before its predictions stabilize (cold-start period uses rule-based fallback).

---

## Context

AQE v3 spends the majority of its operational cost on LLM model calls. The current routing system (ADR-026, extended by ADR-068) assigns tasks to one of three tiers based on a complexity score, optionally amplified by mincut criticality. This approach has three fundamental limitations:

1. **Single-dimensional scoring**: Even with mincut amplification, the routing decision reduces to a single "effective complexity" number compared against fixed thresholds. Real routing decisions should consider multiple signals: is the task semantically similar to previously successful Haiku tasks? How recently was a similar task routed? What was the success rate of this task type at each tier?

2. **No learning from outcomes**: When a task routed to Opus could have been handled by Haiku, the system never learns this. When a Haiku-routed task fails and requires Opus retry, the cost doubles but the routing rule remains unchanged. Historical outcome data exists (RoutingFeedbackCollector, EMA calibrator from ADR-074) but is not used for the routing decision itself.

3. **Estimated 70-85% cost waste**: The Six Thinking Hats analysis (2026-03-15) and Tiny Dancer research benchmarks indicate that neural routing achieves 70-85% cost reduction compared to static thresholds on comparable workloads. This is because neural routing learns that the majority of tasks -- often 60-80% -- can be handled by the cheapest adequate tier.

ruvector-tiny-dancer-core provides a production-grade FastGRNN routing engine purpose-built for this problem. Key characteristics:

- **FastGRNN architecture**: Gated recurrent unit with low-rank weight matrices, achieving 80-90% weight sparsity. Models are <1MB, inference is 7.5us per candidate.
- **Multi-signal scoring**: Combines semantic similarity, recency decay, frequency bonus, and success rate into a unified score per routing candidate.
- **Conformal prediction**: Provides uncertainty quantification on routing decisions, enabling automatic escalation when the model is not confident.
- **Circuit breaker**: Graceful degradation to rule-based routing when the neural model encounters out-of-distribution inputs.

### Relationship to ADR-068 (Mincut-Gated Routing)

ADR-068 introduced structural criticality as a routing signal. This ADR does not replace mincut gating -- it subsumes it. The mincut criticality score becomes one of several inputs to the neural routing model:

```
Neural Router Inputs:
  1. Raw task complexity score (ADR-026)
  2. Mincut structural criticality (ADR-068)
  3. Semantic similarity to past tasks (embedding distance)
  4. Task recency (time since last similar task)
  5. Task frequency (how often this type appears)
  6. Historical success rate by tier (feedback loop)
  7. Agent EMA calibration weight (ADR-074)
```

The neural model learns the optimal weighting of these signals, replacing the hand-tuned `amplificationFactor` from ADR-068.

### Relationship to ADR-074 (Loki-Mode)

ADR-074 introduced EMA calibration and auto-escalation for routing feedback. These remain valuable and feed into the neural router:
- EMA calibration weights become a neural router input signal
- Auto-escalation becomes the neural router's failure-learning mechanism
- The neural router replaces the rule-based tier selector while consuming ADR-074's signals

---

## Options Considered

### Option 1: FastGRNN Neural Routing via ruvector-tiny-dancer-node (Selected)

Replace the rule-based routing decision with a FastGRNN neural model that scores routing candidates across multiple signals. Retain rule-based routing as a fallback for cold-start and circuit-breaker scenarios.

**Pros:**
- 70-85% cost reduction through learned optimal tier assignment
- Sub-10us routing latency (negligible compared to LLM call latency)
- Continuous improvement from outcome feedback
- Multi-signal scoring captures nuances that rules cannot
- Conformal prediction provides uncertainty-aware escalation
- Circuit breaker ensures graceful degradation
- <1MB model size, no GPU required

**Cons:**
- Cold-start period (~50 outcomes) where model predictions are unreliable
- A/B testing required to validate cost savings vs quality
- New dependency (@ruvector/tiny-dancer-node)
- Model persistence adds to RVF file management
- Routing decisions become less interpretable than rule-based (mitigated by explainability API)

### Option 2: Enhanced Rule-Based Routing (Rejected)

Add more signals to the rule-based routing formula (e.g., `effectiveComplexity = f(complexity, criticality, recency, frequency, successRate)`).

**Why rejected:** Rule explosion. Five signals with three thresholds each create 243 rule combinations. Tuning these by hand is impractical. Each new signal doubles the rule surface. Neural routing learns optimal weightings automatically from outcome data.

### Option 3: Full Transformer Model for Routing (Rejected)

Use a small transformer model to make routing decisions based on the full task description.

**Why rejected:** Transformer inference for routing adds 1-10ms per decision, which is 100-1000x slower than FastGRNN's 7.5us. The routing decision does not require attention over sequences -- it is a classification over a fixed-size feature vector. FastGRNN is architecturally correct for this problem class.

### Option 4: Task-Type Lookup Table (Rejected)

Maintain a lookup table mapping task types to their historically optimal tier.

**Why rejected:** Does not generalize to novel task types. Requires manual maintenance as new task types are added. Cannot account for contextual factors (same task type may need different tiers depending on codebase complexity, swarm state, or time pressure).

---

## Implementation

### Neural Router Architecture

```typescript
// src/routing/neural-router.ts
interface NeuralRouterConfig {
  /** Path to FastGRNN model weights (within .rvf file) */
  modelPath: string;
  /** Minimum outcomes before neural routing activates */
  coldStartThreshold: number;       // Default: 50
  /** Conformal prediction confidence level */
  confidenceLevel: number;          // Default: 0.90
  /** Circuit breaker: revert to rules after N consecutive misroutes */
  circuitBreakerThreshold: number;  // Default: 5
  /** A/B test split ratio (0.0 = all rule-based, 1.0 = all neural) */
  neuralSplitRatio: number;         // Default: 0.5 during A/B, 1.0 after
}

class NeuralRouter implements ModelRouter {
  private model: TinyDancerModel;
  private fallback: MincutRouter;   // ADR-068 rule-based as fallback
  private outcomeCount: number = 0;
  private consecutiveMisroutes: number = 0;

  async route(task: RoutableTask): Promise<NeuralRoutingResult> {
    // Cold-start: use rule-based until model has enough data
    if (this.outcomeCount < this.config.coldStartThreshold) {
      return this.routeWithFallback(task, 'cold-start');
    }

    // Circuit breaker: revert to rules if model is consistently wrong
    if (this.consecutiveMisroutes >= this.config.circuitBreakerThreshold) {
      return this.routeWithFallback(task, 'circuit-breaker');
    }

    // A/B split: probabilistic assignment to neural vs rule-based
    if (Math.random() > this.config.neuralSplitRatio) {
      return this.routeWithFallback(task, 'ab-control');
    }

    // Neural routing
    const features = await this.extractFeatures(task);
    const candidates = this.buildCandidates(features);
    const scored = await this.model.score(candidates); // 8.83us for 10 candidates

    // Conformal prediction: escalate if uncertainty is high
    if (scored.uncertainty > (1 - this.config.confidenceLevel)) {
      return this.routeWithEscalation(scored, task);
    }

    return {
      tier: scored.bestCandidate.tier,
      confidence: scored.confidence,
      method: 'neural',
      features: features,
    };
  }

  async recordOutcome(taskId: string, tier: ModelTier, success: boolean): Promise<void> {
    this.outcomeCount++;
    if (success) {
      this.consecutiveMisroutes = 0;
    } else {
      this.consecutiveMisroutes++;
    }
    await this.model.update(taskId, tier, success); // Online learning
  }

  private async extractFeatures(task: RoutableTask): Promise<RoutingFeatures> {
    return {
      rawComplexity: this.assessComplexity(task),
      mincutCriticality: await this.graph.getCriticality(task.agentId),
      semanticSimilarity: await this.computeSimilarity(task),
      recency: this.computeRecency(task),
      frequency: this.computeFrequency(task),
      historicalSuccessRate: this.getSuccessRateByTier(task),
      emaCalibration: this.getEmaWeight(task.agentId),
    };
  }
}

interface NeuralRoutingResult {
  tier: ModelTier;
  confidence: number;
  method: 'neural' | 'rule-fallback';
  fallbackReason?: 'cold-start' | 'circuit-breaker' | 'ab-control';
  features: RoutingFeatures;
}
```

### A/B Testing Requirements

The neural router must be validated through a structured A/B test before full deployment:

| Phase | Duration | Neural Split | Success Criteria |
|-------|----------|-------------|-----------------|
| Cold-start | Week 1 | 0% (learning only) | Model ingests 200+ outcomes from rule-based routing |
| Shadow | Week 2 | 0% (log neural decisions, compare with actual) | Neural decisions agree with rule-based >80% |
| Split | Weeks 3-4 | 50% (randomized) | Neural arm: cost <= 50% of rule arm AND quality >= 95% of rule arm |
| Ramp | Week 5 | 80% neural | No quality regression at scale |
| Full | Week 6+ | 100% neural | Rule-based retained as circuit-breaker fallback only |

**Go/No-Go Criteria for Full Deployment:**
- Cost reduction >= 40% (conservative; research claims 70-85%)
- Task success rate within 2% of rule-based baseline
- No quality gate regression in any of the 13 DDD domains
- Circuit breaker triggered fewer than 5 times during split phase
- Model inference p99 latency < 100us

### Model Persistence

FastGRNN model weights are stored within the RVF file (ADR-065) as a KERNEL_SEG entry:

```typescript
interface ModelPersistence {
  /** Save model weights to RVF */
  save(rvfPath: string): Promise<void>;
  /** Load model weights from RVF */
  load(rvfPath: string): Promise<boolean>;
  /** Export model for portable intelligence containers (ADR-073) */
  exportWeights(): Promise<Float32Array>;
}
```

### Observability

```typescript
interface NeuralRoutingMetrics {
  totalDecisions: number;
  neuralDecisions: number;
  fallbackDecisions: number;
  fallbackReasons: Record<string, number>;
  costSavingsEstimate: number;    // Cumulative $ saved vs rule-based
  avgConfidence: number;
  circuitBreakerTrips: number;
  tierDistribution: Record<ModelTier, number>;
  p50InferenceUs: number;
  p99InferenceUs: number;
}
```

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Supersedes | ADR-068 | Mincut-Gated Model Routing | Neural routing subsumes rule-based mincut routing; mincut criticality becomes one input signal |
| Extends | ADR-026 | 3-Tier Model Routing | Replaces the routing decision engine while preserving the 3-tier model hierarchy |
| Depends On | ADR-047 | MinCut Self-Organizing QE | Mincut criticality computation used as neural input |
| Depends On | ADR-065 | RVF Integration Strategy | Model weights persisted in RVF file |
| Relates To | ADR-074 | Loki-Mode Adversarial Quality Gates | EMA calibration and auto-escalation feed neural router |
| Relates To | ADR-050 | RuVector Neural Backbone | Tiny Dancer is part of ruvector neural ecosystem |
| Part Of | MADR-001 | V3 Implementation Initiative | RVF integration -- Phase 2 Intelligence |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| RES-001 | RuVector Router, SONA & Utilities Research | Research Report | `docs/research/ruvector-routing-sona-utilities.md` |
| RES-002 | Six Thinking Hats Analysis | Analysis | `docs/research/six-thinking-hats-aqe-ruvector-analysis.md` |
| RES-003 | RuVector CNN, Sparse & Domain Expansion Research | Research Report | `docs/research/ruvector-cnn-sparse-domain.md` |
| EXT-001 | ruvector-tiny-dancer-core | Rust Crate | FastGRNN routing engine documentation |
| EXT-002 | ruvector-tiny-dancer-node | npm Package | @ruvector/tiny-dancer-node NAPI-RS bindings |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-03-15 | Proposed | 2026-09-15 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-03-15 | Initial creation from Six Thinking Hats analysis Phase 2 recommendation. FastGRNN neural routing to replace rule-based 3-tier routing with learned multi-signal scoring. |

---

## Definition of Done Checklist

Before requesting approval, verify:

### Core (ECADR)
- [ ] **E - Evidence**: A/B test demonstrates >= 40% cost reduction with <= 2% quality regression
- [ ] **C - Criteria**: 4 options compared (FastGRNN, enhanced rules, transformer, lookup table)
- [ ] **A - Agreement**: Relevant stakeholders consulted on cost/quality tradeoff
- [ ] **D - Documentation**: WH(Y) statement complete, ADR published
- [ ] **R - Review**: Review cadence set, owner assigned

### Extended
- [ ] **Dp - Dependencies**: ADR-026, ADR-068, ADR-047, ADR-065, ADR-074 relationships documented
- [ ] **Rf - References**: Research reports linked, benchmark data cited
- [ ] **M - Master**: Linked to MADR-001 V3 Implementation Initiative
