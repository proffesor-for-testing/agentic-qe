# ADR-084: Cross-Domain Transfer Learning via ruvector-domain-expansion

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-084 |
| **Status** | Proposed |
| **Date** | 2026-03-15 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** AQE v3's 13 DDD domains (test-generation, defect-classification, coverage-analysis, security-verification, etc.) where each domain learns patterns independently from its own experiences, with no mechanism to transfer successful strategies between domains even when they share underlying principles,

**facing** the limitation that a pattern learned in the test-generation domain (e.g., "mock external dependencies before testing state transitions") cannot benefit the integration-testing domain, that new domains start with zero patterns regardless of how much related knowledge exists in adjacent domains, and that the 150K+ pattern database contains cross-domain insights that are invisible because patterns are domain-scoped,

**we decided for** integrating ruvector-domain-expansion as a cross-domain transfer learning engine that extracts statistical posteriors from source domains via Meta Thompson Sampling with Beta priors, applies sqrt-dampening to prevent overconfident transfer, seeds target domains with adapted patterns, and validates transfers through a verification gate that confirms the target domain improved without the source domain regressing,

**and neglected** (a) manual cross-domain pattern curation by QE engineers (rejected: does not scale with 13 domains and 150K+ patterns; requires domain expertise in both source and target), (b) universal patterns that apply to all domains (rejected: flattens domain-specific nuance; a security testing pattern that is critical in security-verification may be irrelevant in coverage-analysis), (c) embedding similarity-based transfer (rejected: similar embeddings do not guarantee transferable strategies; two patterns may be semantically similar but operationally incompatible),

**to achieve** knowledge transfer between AQE's 13 domains where successful strategies from mature domains accelerate learning in newer or adjacent domains, automatic discovery of cross-domain pattern correlations that human engineers would miss, reduced cold-start time for new domains by seeding with dampened knowledge from related domains, and measurable verification that transfers actually help the target domain,

**accepting that** cross-domain transfer risks introducing harmful patterns from incompatible domains (mitigated by verification gate), the dampening factor reduces transfer effectiveness to prevent overconfidence (correct tradeoff but reduces immediate impact), transfer requires enough source domain data to extract meaningful posteriors (minimum ~100 patterns per source domain), and the verification gate adds latency to the transfer pipeline (one-time cost per transfer batch).

---

## Context

AQE v3 organizes its learned knowledge into 13 DDD (Domain-Driven Design) domains. Each domain accumulates patterns independently:

| Domain | Pattern Count (approx) | Learning Rate |
|--------|----------------------|---------------|
| test-generation | 15,016 | High (most active) |
| learning-optimization | 615 | Moderate |
| defect-classification | ~5,000 | Moderate |
| coverage-analysis | ~3,000 | Moderate |
| security-verification | ~2,000 | Low (specialized) |
| api-testing | ~1,500 | Moderate |
| (8 other domains) | ~500 each | Low-Moderate |

The test-generation domain has accumulated 15K+ patterns over months of operation. Many of these patterns encode general QE principles that would benefit other domains:

- "When testing stateful components, reset state between tests" -- applies to unit, integration, and API testing
- "Prefer boundary value analysis for numeric inputs" -- applies to test generation, defect classification, and security verification
- "Mock external dependencies to isolate the system under test" -- applies universally

Today, these insights are trapped in their source domain. The api-testing domain must independently discover the same boundary value analysis patterns that test-generation learned months ago.

ruvector-domain-expansion provides a production-grade transfer learning engine purpose-built for this problem:

1. **Meta Thompson Sampling**: Uses Beta distribution priors to model the success probability of patterns within each domain. Mature domains have tight posteriors (high confidence). New domains have wide priors (high uncertainty).

2. **Cross-domain transfer with sqrt-dampening**: Extracts posteriors from the source domain, applies sqrt-dampening (reducing confidence by taking the square root of the Beta parameters), and uses the dampened posteriors to seed the target domain. This ensures transferred knowledge starts with appropriate uncertainty.

3. **Transfer verification gate**: After transfer, the gate runs validation queries against both domains. The transfer is accepted only if:
   - The target domain's recall/precision improved (or at least did not degrade)
   - The source domain's performance did not regress (transfer should not corrupt the source)

4. **Population-based policy search**: 8 PolicyKernel variants compete through elite selection and crossover, discovering optimal transfer configurations through evolution rather than manual tuning.

5. **Curiosity-driven exploration**: UCB (Upper Confidence Bound) bonus encourages exploration of under-tested cross-domain transfers.

---

## Options Considered

### Option 1: ruvector-domain-expansion with Verification Gate (Selected)

Integrate ruvector-domain-expansion's Thompson Sampling transfer engine with mandatory verification gates for all cross-domain transfers.

**Pros:**
- Statistical rigor: Beta posteriors quantify transfer confidence
- sqrt-dampening prevents overconfident transfer
- Verification gate catches harmful transfers before they propagate
- Curiosity-driven exploration discovers non-obvious cross-domain relationships
- Population search evolves optimal transfer policies
- Regret tracking measures whether transfer is actually helping
- Pareto front tracking for multi-objective optimization (recall vs precision vs coverage)

**Cons:**
- Minimum ~100 patterns per source domain for meaningful posteriors
- Verification gate adds one-time latency per transfer batch
- sqrt-dampening reduces immediate transfer impact (by design)
- 8 PolicyKernel variants add configuration surface
- Cross-domain pattern misapplication risk (mitigated by gate)

### Option 2: Manual Cross-Domain Pattern Curation (Rejected)

QE engineers manually identify transferable patterns and copy them between domains.

**Why rejected:** Does not scale. With 13 domains and 150K+ patterns, manual identification of transferable patterns requires deep expertise in both source and target domains. The number of domain pairs is 13*12/2 = 78, each requiring individual analysis. Manual curation also cannot adapt to the continuously evolving pattern landscape.

### Option 3: Universal (Domain-Agnostic) Patterns (Rejected)

Create a "universal" pattern tier that applies to all domains, alongside domain-specific patterns.

**Why rejected:** Flattens domain-specific nuance. A pattern like "always test error paths" has different manifestations in test-generation (assert error messages), security-verification (test injection attacks), and coverage-analysis (ensure error branches are covered). Universal patterns cannot capture these domain-specific adaptations. The transfer learning approach preserves nuance through dampened adaptation.

### Option 4: Embedding Similarity-Based Transfer (Rejected)

Find patterns in the source domain that are embedding-similar to the target domain's queries and copy them.

**Why rejected:** Embedding similarity measures semantic distance, not operational transferability. Two patterns may be semantically similar ("test API endpoints" and "test webhook endpoints") but require fundamentally different testing strategies (synchronous vs asynchronous). Thompson Sampling with Beta priors captures operational success/failure signals, not just semantic proximity.

---

## Implementation

### Transfer Engine

```typescript
// src/learning/transfer/cross-domain-transfer-engine.ts
interface CrossDomainTransferEngine {
  /** Analyze potential transfers from source to target domain */
  analyzeTransferOpportunity(
    sourceDomain: string,
    targetDomain: string
  ): Promise<TransferAnalysis>;

  /** Execute a transfer with verification */
  executeTransfer(
    sourceDomain: string,
    targetDomain: string,
    config: TransferConfig
  ): Promise<TransferResult>;

  /** Discover all promising cross-domain transfer opportunities */
  discoverTransfers(
    minConfidence: number
  ): Promise<TransferOpportunity[]>;

  /** Get transfer learning metrics */
  getMetrics(): TransferMetrics;
}

interface TransferConfig {
  /** Maximum number of patterns to transfer */
  maxPatterns: number;              // Default: 50
  /** sqrt-dampening factor (0.0 = no dampening, 1.0 = full dampening) */
  dampeningFactor: number;          // Default: 0.5 (sqrt)
  /** Minimum source pattern confidence for transfer eligibility */
  minSourceConfidence: number;      // Default: 0.6
  /** Whether to run verification gate after transfer */
  verifyTransfer: boolean;          // Default: true (mandatory)
  /** Number of verification queries */
  verificationQueries: number;      // Default: 20
  /** Maximum acceptable regression in source domain */
  maxSourceRegression: number;      // Default: 0.02 (2%)
}

interface TransferResult {
  patternsTransferred: number;
  patternsRejectedByGate: number;
  targetRecallDelta: number;      // Positive = improvement
  targetPrecisionDelta: number;
  sourceRecallDelta: number;      // Should be ~0 (no regression)
  verificationPassed: boolean;
  transferConfidence: number;     // Thompson Sampling posterior
  witnessId: string;              // ADR-070 audit trail
}
```

### Verification Gate

```typescript
// src/learning/transfer/transfer-verification-gate.ts
interface TransferVerificationGate {
  /** Validate a transfer batch before committing to target domain */
  verify(
    sourceDomain: string,
    targetDomain: string,
    transferredPatterns: Pattern[],
    config: VerificationConfig
  ): Promise<VerificationResult>;
}

interface VerificationConfig {
  /** Synthetic queries to test target domain recall before/after transfer */
  querySet: Float32Array[];
  /** Maximum acceptable drop in target precision */
  maxPrecisionDrop: number;        // Default: 0.01 (1%)
  /** Minimum improvement in target recall to justify transfer */
  minRecallImprovement: number;    // Default: 0.005 (0.5%)
  /** Maximum acceptable drop in source metrics */
  maxSourceRegression: number;     // Default: 0.02 (2%)
}

interface VerificationResult {
  passed: boolean;
  targetRecallBefore: number;
  targetRecallAfter: number;
  targetPrecisionBefore: number;
  targetPrecisionAfter: number;
  sourceRecallBefore: number;
  sourceRecallAfter: number;
  failureReason?: string;
  patternsApproved: number;
  patternsRejected: number;
}
```

### Domain Affinity Matrix

Not all domain pairs are equally suited for transfer. The engine maintains an affinity matrix learned from transfer outcomes:

```typescript
// src/learning/transfer/domain-affinity-matrix.ts
interface DomainAffinityMatrix {
  /** Get the learned affinity between two domains (0.0 = no affinity, 1.0 = high affinity) */
  getAffinity(source: string, target: string): number;

  /** Update affinity based on transfer outcome */
  updateAffinity(
    source: string,
    target: string,
    success: boolean,
    improvement: number
  ): void;

  /** Get the top N most promising transfer pairs */
  getTopOpportunities(n: number): Array<{
    source: string;
    target: string;
    affinity: number;
    estimatedImprovement: number;
  }>;
}
```

Expected affinities (learned, not hardcoded):

| Source -> Target | Expected Affinity | Rationale |
|-----------------|------------------|-----------|
| test-generation -> integration-testing | High (0.7+) | Overlapping testing principles |
| test-generation -> api-testing | High (0.6+) | Shared assertion patterns |
| security-verification -> api-testing | Moderate (0.4) | Security patterns apply to API testing |
| coverage-analysis -> test-generation | Moderate (0.5) | Coverage gaps inform test creation |
| defect-classification -> security-verification | Low-Moderate (0.3) | Some defect patterns relate to security |

### Integration with Dream Cycles (ADR-069)

Cross-domain transfer is a natural fit for dream cycle execution:

```typescript
class TransferDreamStrategy implements DreamStrategy {
  async execute(dreamBranch: RvfDatabase): Promise<DreamResult> {
    // 1. Discover promising transfers
    const opportunities = await this.transferEngine.discoverTransfers(0.5);

    // 2. Execute transfers on the dream branch (COW isolated)
    for (const opp of opportunities.slice(0, 5)) {
      await this.transferEngine.executeTransfer(
        opp.source, opp.target,
        { verifyTransfer: true, maxPatterns: 20 }
      );
    }

    // 3. Dream validation gate (ADR-069) decides whether to merge
    return { strategy: 'cross-domain-transfer', transfersAttempted: opportunities.length };
  }
}
```

### Coherence Integration (ADR-083)

Transferred patterns must pass the coherence gate in the target domain:

```typescript
async executeTransfer(source: string, target: string, config: TransferConfig): Promise<TransferResult> {
  const candidates = await this.selectTransferCandidates(source, config);
  const dampened = this.applyDampening(candidates, config.dampeningFactor);

  const approved: Pattern[] = [];
  const rejected: Pattern[] = [];

  for (const pattern of dampened) {
    // Coherence check against target domain context
    const coherence = await this.coherenceGate.checkAction({
      agentId: 'transfer-engine',
      actionType: 'pattern-mutation',
      domain: target,
      embedding: pattern.embedding,
      contextIds: await this.getTargetContext(target),
      payload: pattern,
    });

    if (coherence.approved) {
      approved.push(pattern);
    } else {
      rejected.push(pattern);
    }
  }

  // Verification gate on approved batch
  if (config.verifyTransfer) {
    const verification = await this.verificationGate.verify(
      source, target, approved, { /* ... */ }
    );
    if (!verification.passed) {
      return { patternsTransferred: 0, verificationPassed: false, /* ... */ };
    }
  }

  // Commit approved patterns to target domain
  await this.commitToTarget(target, approved);
  return { patternsTransferred: approved.length, verificationPassed: true, /* ... */ };
}
```

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-083 | Coherence-Gated Agent Actions | Transferred patterns must pass coherence gate in target domain |
| Depends On | ADR-081 | Native HNSW Integration via NAPI | Transfer analysis uses native HNSW for similarity search |
| Depends On | ADR-052 | Coherence-Gated QE | Coherence checking infrastructure |
| Relates To | ADR-069 | RVCOW Dream Cycle Branching | Transfers can execute within dream branches for safety |
| Relates To | ADR-061 | Asymmetric Learning Rates | Transferred patterns use dampened confidence (asymmetric) |
| Relates To | ADR-070 | Witness Chain Audit Compliance | All transfers recorded in witness chain |
| Relates To | ADR-073 | Portable Intelligence Containers | Transfer learning enables cross-project pattern sharing |
| Part Of | MADR-001 | V3 Implementation Initiative | RVF integration -- Phase 2 Intelligence |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| RES-001 | RuVector CNN, Sparse Inference & Domain Expansion Research | Research Report | `docs/research/ruvector-cnn-sparse-domain.md` |
| RES-002 | Six Thinking Hats Analysis | Analysis | `docs/research/six-thinking-hats-aqe-ruvector-analysis.md` |
| RES-003 | RuVector Router, SONA & Utilities Research | Research Report | `docs/research/ruvector-routing-sona-utilities.md` |
| EXT-001 | ruvector-domain-expansion | Rust Crate | Cross-domain transfer learning engine |
| EXT-002 | ruvector-domain-expansion-wasm | npm Package | Browser-compatible WASM bindings |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-03-15 | Proposed | 2026-09-15 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-03-15 | Initial creation from Six Thinking Hats analysis Phase 2 recommendation. Cross-domain transfer learning to share QE patterns between AQE's 13 DDD domains. |

---

## Definition of Done Checklist

Before requesting approval, verify:

### Core (ECADR)
- [ ] **E - Evidence**: Transfer from test-generation to api-testing improves target recall by >= 5% without source regression
- [ ] **C - Criteria**: 4 options compared (domain-expansion, manual, universal, similarity-based)
- [ ] **A - Agreement**: Domain owners for source and target domains consulted
- [ ] **D - Documentation**: WH(Y) statement complete, ADR published
- [ ] **R - Review**: Review cadence set, owner assigned

### Extended
- [ ] **Dp - Dependencies**: ADR-083, ADR-081, ADR-052, ADR-069, ADR-061, ADR-070, ADR-073 relationships documented
- [ ] **Rf - References**: Research reports linked
- [ ] **M - Master**: Linked to MADR-001 V3 Implementation Initiative
