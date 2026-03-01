# ADR-061: Asymmetric Learning Rates for ReasoningBank

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-061 |
| **Status** | Proposed |
| **Date** | 2026-02-06 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |
| **Analysis Method** | Six Thinking Hats (AISP Integration Review) |
| **Conceptual Inspiration** | [AISP 5.1 Hebbian Learning (10:1 Penalty)](https://github.com/bar181/aisp-open-core) |

---

## WH(Y) Decision Statement

**In the context of** the ReasoningBank pattern learning system (ADR-021) which stores successful QE patterns with confidence scores and uses them for agent routing, test generation, and quality gate decisions,

**facing** the problem of "zombie patterns" — patterns that occasionally cause failures (false positives, bad test generation, incorrect routing) but maintain positive confidence because their successes outnumber failures on a symmetric 1:1 scale, leading to a gradually degrading pattern quality baseline,

**we decided for** implementing asymmetric 10:1 Hebbian learning rates where a single failure decreases pattern confidence 10x more than a success increases it, with automatic quarantine below a viability threshold and a rehabilitation protocol requiring 10+ consecutive successes,

**and neglected** (a) symmetric confidence updates (status quo: zombie patterns persist), (b) binary pass/fail without graduation (rejected: loses nuance), (c) time-decay-only approach (rejected: doesn't distinguish good old patterns from bad old patterns),

**to achieve** conservative innovation in pattern learning — the system strongly prefers proven patterns, rapidly quarantines harmful ones, and requires substantial evidence before rehabilitating quarantined patterns,

**accepting that** the 10:1 ratio is intentionally aggressive and may quarantine patterns that fail for environmental reasons (flaky infrastructure, not pattern quality), requiring a "context-aware" failure classification to distinguish pattern failures from infrastructure failures.

---

## Context

AQE v3's ReasoningBank (ADR-021) stores QE patterns — learned strategies for test generation, coverage analysis, defect prediction, and agent routing. Each pattern has a confidence score that increases on success and decreases on failure. Currently, these updates are approximately symmetric: a success adds ~0.1 confidence, a failure subtracts ~0.1 confidence.

This creates the "zombie pattern" problem: a pattern that succeeds 9 times but causes a catastrophic false positive once maintains a net positive confidence of +0.8. In QE, a single false positive (incorrectly passing a quality gate, generating an invalid test, routing to a wrong agent) can be far more costly than 9 correct decisions. The asymmetry of impact should be reflected in the asymmetry of learning.

AISP 5.1's Hebbian Learning system uses a deliberate 10:1 penalty ratio: `success(A,B) => affinity[A,B] += 1; failure(A,B) => affinity[A,B] -= 10`. This means a pattern must succeed 10 times to recover from a single failure. Combined with a viability threshold (`affinity < tau_v => skip`), this creates "conservative innovation" — the system rapidly prunes risky patterns and strongly favors proven ones.

---

## Options Considered

### Option 1: 10:1 Asymmetric Hebbian Learning with Quarantine (Selected)

Modify ReasoningBank's confidence update logic to use a 10:1 success-to-failure ratio. Patterns below a viability threshold are quarantined (excluded from routing and generation). Quarantined patterns can be rehabilitated after 10+ consecutive successes in a controlled re-testing environment.

**Pros:**
- Rapidly eliminates zombie patterns (1 failure quarantines after threshold)
- Strongly favors proven patterns (conservative innovation)
- Mathematically principled (Hebbian learning is well-studied)
- Configurable ratio per domain (security may want 20:1, test gen may accept 5:1)
- Quarantine is reversible — not deletion

**Cons:**
- Aggressive: infrastructure flakiness can quarantine good patterns
- Requires failure context classification (pattern vs infrastructure failure)
- Cold start: new patterns are fragile (one early failure quarantines them)
- May reduce pattern diversity if too many are quarantined

### Option 2: Keep Symmetric Learning (Status Quo, Rejected)

Continue with approximately symmetric confidence updates.

**Why rejected:** Zombie patterns accumulate over time. A pattern with 90% success rate and 10% catastrophic failure rate maintains positive confidence indefinitely, causing recurring production incidents.

### Option 3: Time-Decay Only (Rejected)

Reduce confidence of all patterns over time, forcing continuous re-validation.

**Why rejected:** Treats all old patterns equally. A 6-month-old pattern with 100% success rate should NOT decay at the same rate as a 6-month-old pattern with 80% success rate. Time-decay doesn't distinguish quality.

---

## Technical Design

### Modified Confidence Update Logic

```typescript
// In real-qe-reasoning-bank.ts — new learning rate configuration
interface AsymmetricLearningConfig {
  /** Confidence boost on success (default: 0.1) */
  successRate: number;
  /** Confidence penalty on failure (default: 1.0 = 10x success) */
  failureRate: number;
  /** Below this threshold, pattern is quarantined (default: 0.3) */
  viabilityThreshold: number;
  /** Consecutive successes needed to rehabilitate (default: 10) */
  rehabilitationThreshold: number;
  /** Per-domain overrides */
  domainOverrides?: Partial<Record<QEDomain, {
    successRate: number;
    failureRate: number;
    viabilityThreshold: number;
  }>>;
}

// Default configuration per domain
const DEFAULT_ASYMMETRIC_CONFIG: AsymmetricLearningConfig = {
  successRate: 0.1,
  failureRate: 1.0,     // 10:1 ratio
  viabilityThreshold: 0.3,
  rehabilitationThreshold: 10,
  domainOverrides: {
    'security-compliance': { successRate: 0.05, failureRate: 1.0, viabilityThreshold: 0.5 },  // 20:1 for security
    'test-generation':     { successRate: 0.15, failureRate: 1.0, viabilityThreshold: 0.2 },   // ~7:1 for test gen
    'quality-assessment':  { successRate: 0.1,  failureRate: 1.0, viabilityThreshold: 0.4 },   // 10:1 for quality gates
  },
};
```

### Confidence Update with Quarantine

```typescript
async updatePatternConfidence(
  patternId: string,
  outcome: 'success' | 'failure',
  context: OutcomeContext
): Promise<PatternConfidenceResult> {
  const pattern = await this.store.get(patternId);
  if (!pattern) return { error: 'Pattern not found' };

  const config = this.getConfigForDomain(pattern.domain);

  // Classify failure: is this a pattern failure or infrastructure failure?
  if (outcome === 'failure' && context.failureCategory === 'infrastructure') {
    // Infrastructure failures (timeouts, flaky network) don't penalize pattern
    return { updated: false, reason: 'infrastructure-failure-excluded' };
  }

  // Asymmetric update
  const delta = outcome === 'success'
    ? config.successRate
    : -config.failureRate;  // 10x penalty

  const newConfidence = Math.max(0, Math.min(1, pattern.confidence + delta));

  // Check quarantine threshold
  const quarantined = newConfidence < config.viabilityThreshold;

  if (quarantined && pattern.status !== 'quarantined') {
    // Newly quarantined — emit event for monitoring
    await this.eventBus.publish({
      type: 'PatternQuarantinedEvent',
      source: 'learning-optimization',
      data: {
        patternId,
        previousConfidence: pattern.confidence,
        newConfidence,
        failureContext: context,
        quarantineReason: 'below-viability-threshold',
      },
    });
  }

  await this.store.update(patternId, {
    confidence: newConfidence,
    status: quarantined ? 'quarantined' : 'active',
    consecutiveSuccesses: outcome === 'success'
      ? (pattern.consecutiveSuccesses || 0) + 1
      : 0,
  });

  // Rehabilitation check
  if (
    pattern.status === 'quarantined' &&
    outcome === 'success' &&
    (pattern.consecutiveSuccesses || 0) + 1 >= config.rehabilitationThreshold
  ) {
    await this.store.update(patternId, {
      status: 'active',
      confidence: config.viabilityThreshold + 0.1,
    });
    await this.eventBus.publish({
      type: 'PatternRehabilitatedEvent',
      source: 'learning-optimization',
      data: { patternId, consecutiveSuccesses: pattern.consecutiveSuccesses + 1 },
    });
  }

  return {
    updated: true,
    newConfidence,
    quarantined,
    delta,
  };
}
```

### Failure Context Classification

```typescript
interface OutcomeContext {
  /** What type of failure occurred */
  failureCategory: 'pattern' | 'infrastructure' | 'unknown';
  /** Error details for classification */
  errorMessage?: string;
  /** Time taken (timeouts suggest infrastructure) */
  durationMs?: number;
  /** Was the infrastructure healthy? */
  infrastructureHealthy?: boolean;
}

// Simple classifier — infrastructure failures don't penalize patterns
function classifyFailure(context: OutcomeContext): 'pattern' | 'infrastructure' {
  if (context.infrastructureHealthy === false) return 'infrastructure';
  if (context.durationMs && context.durationMs > 30000) return 'infrastructure'; // timeout
  if (context.errorMessage?.includes('ECONNREFUSED')) return 'infrastructure';
  if (context.errorMessage?.includes('ETIMEOUT')) return 'infrastructure';
  return 'pattern'; // Default: blame the pattern
}
```

### Integration Points

| Component | Integration |
|-----------|-------------|
| `real-qe-reasoning-bank.ts` (ADR-021) | Core confidence update logic |
| `pattern-lifecycle.ts` (ADR-021) | Quarantine status in lifecycle |
| `aqe-learning-engine.ts` (ADR-021) | Learning rate configuration |
| `learning-coordinator.ts` (ADR-006) | Cross-domain learning with asymmetric rates |
| `routing-accuracy-monitor.ts` (ADR-014) | Monitor quarantine rates per domain |
| `event-bus.ts` (ADR-002) | PatternQuarantinedEvent, PatternRehabilitatedEvent |

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-021 | ReasoningBank | Modifies confidence update logic |
| Depends On | ADR-006 | Unified Learning System | Learning configuration |
| Relates To | ADR-023 | Quality Feedback Loop | Outcome tracking feeds asymmetric updates |
| Relates To | ADR-022 | Adaptive Agent Routing | Quarantined patterns excluded from routing |
| Relates To | ADR-024 | Self-Optimization Engine | AutoTuner adjusts learning rates |
| Relates To | ADR-057 | Infrastructure Self-Healing | Infrastructure failure classification |
| Part Of | MADR-001 | V3 Implementation Initiative | Phase 13 enhancement |

---

## Success Metrics

- [ ] Asymmetric 10:1 learning rate implemented in ReasoningBank
- [ ] Zombie pattern count reduced by >80% within 1000 learning cycles
- [ ] Quarantine threshold configurable per domain via config.yaml
- [ ] Infrastructure failures correctly classified and excluded (>95% accuracy)
- [ ] Rehabilitation protocol works: quarantined patterns return after 10+ successes
- [ ] PatternQuarantinedEvent and PatternRehabilitatedEvent emitted and monitorable
- [ ] 30+ tests covering asymmetric updates, quarantine, rehabilitation, infrastructure exclusion

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| EXT-001 | AISP 5.1 Hebbian Learning | Conceptual Inspiration | [aisp-open-core](https://github.com/bar181/aisp-open-core) |
| INT-001 | ReasoningBank | Existing Code | `v3/src/learning/real-qe-reasoning-bank.ts` |
| INT-002 | Pattern Lifecycle | Existing Code | `v3/src/learning/pattern-lifecycle.ts` |
| INT-003 | Learning Coordinator | Existing Code | `v3/src/domains/learning-optimization/services/learning-coordinator.ts` |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-02-06 | Created from Six Thinking Hats AISP analysis. Concept from AISP 10:1 Hebbian learning; native implementation in ReasoningBank. |
