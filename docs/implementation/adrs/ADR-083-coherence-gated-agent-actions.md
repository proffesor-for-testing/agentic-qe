# ADR-083: Coherence-Gated Agent Actions via Sheaf Laplacian

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-083 |
| **Status** | Proposed |
| **Date** | 2026-03-15 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** AQE v3's multi-agent system where up to 15 concurrent agents generate test code, modify quality gate decisions, update pattern confidence scores, and commit changes to the shared knowledge base, with ADR-052 providing coherence checking at the Strange Loop orchestration level and ADR-074 providing sycophancy detection at the consensus level,

**facing** the gap that individual agent actions (writing a test, modifying a quality gate, promoting a pattern) are not coherence-verified before execution -- an agent can generate a test that contradicts existing test expectations, promote a pattern that conflicts with higher-confidence patterns, or produce outputs that are internally consistent but incoherent with the broader knowledge base, and these incoherent actions propagate through the system before detection,

**we decided for** implementing a pre-action coherence gate using prime-radiant's sheaf Laplacian energy computation, where every agent output that modifies shared state (test generation, pattern mutation, quality gate decision, code change) must pass a coherence check against the relevant knowledge context before the action is committed, with the gate operating on a compute ladder (Reflex <1ms, Retrieval ~10ms, Heavy ~100ms, Human async) based on the energy score,

**and neglected** (a) relying solely on post-action detection via Strange Loop (rejected: damage is done by the time Strange Loop detects incoherence in its next cycle), (b) using LLM-based coherence checking by asking another model to verify (rejected: non-deterministic, expensive at $0.003+ per check, and adds 2-5s latency per action), (c) simple embedding similarity threshold (rejected: cosine similarity detects semantic distance but cannot identify logical contradictions between structurally dissimilar but semantically conflicting statements),

**to achieve** pre-commit verification that prevents incoherent agent outputs from entering the shared knowledge base, mathematically grounded contradiction detection using sheaf cohomology (not heuristic), compute-proportional gating where simple coherent actions pass in <1ms and only complex ambiguous cases trigger deeper analysis, and a foundation for "Coherence Verified" attestation on all agent-generated artifacts,

**accepting that** sheaf Laplacian computation adds latency to every agent action (1-100ms depending on context size), coherence thresholds require per-domain calibration (test generation tolerates more variation than quality gate decisions), false positives may block legitimate novel patterns that diverge from existing knowledge, and the prime-radiant WASM dependency (v0.1.3+) is still relatively new.

---

## Context

ADR-052 integrated prime-radiant as the coherence layer for AQE v3, implementing coherence checking at the Strange Loop orchestration level, pattern retrieval filtering, and multi-agent consensus verification. This was a significant advance -- coherence is now measured, not estimated.

However, ADR-052's integration points operate at the system level:
- Strange Loop checks swarm-wide coherence periodically (every cycle)
- Pattern retrieval filters incoherent results at query time
- Consensus verification validates agreement among agent votes

There is a critical gap between these system-level checks: **individual agent actions are not coherence-verified before they execute**. Consider these scenarios:

1. **Test generation**: An agent generates a test asserting `response.status === 200` for an endpoint where existing tests assert `response.status === 201`. Both tests are valid TypeScript, but they express contradictory expectations. The coherence gate would detect the sheaf Laplacian energy spike between the new assertion and the existing test context.

2. **Pattern promotion**: An agent observes 5 successes for pattern P1 and promotes its confidence from 0.5 to 0.8. But pattern P2 (confidence 0.9) in the same domain recommends the opposite strategy. The promotion creates an incoherent state where two high-confidence patterns give contradictory guidance.

3. **Quality gate decision**: An agent marks a module as "safe to deploy" while another agent has flagged a critical security finding in the same module. Both decisions pass independently but are incoherent when considered together.

ADR-052 would eventually detect these through Strange Loop's periodic cycle, but by then the incoherent state has propagated. Test P1 may have been committed to CI. Pattern P2's confidence may have been adjusted based on the now-questionable P1. The quality gate may have allowed a deployment.

This ADR extends ADR-052's coherence checking from system-level periodic verification to per-action pre-commit gating.

### Relationship to cognitum-gate-kernel

The research (ruvector-mcp-brain-llm.md) identified cognitum-gate-kernel as a complementary coherence fabric. While prime-radiant provides the mathematical coherence engine (sheaf Laplacian, spectral analysis), cognitum-gate-kernel provides a distributed tile-based architecture (256 tiles, ~46KB each) with three stacked filters:

1. **Structural filter** (min-cut): Is the action structurally connected to the knowledge base?
2. **Shift filter** (distribution): Does the action shift the distribution of the knowledge domain?
3. **Evidence filter** (e-value): Is there sufficient evidence to support the action?

For the initial implementation, this ADR uses prime-radiant directly for coherence computation. cognitum-gate-kernel integration is noted as a future enhancement for distributed swarm scenarios where coherence checking itself must be distributed across tiles.

---

## Options Considered

### Option 1: Pre-Action Sheaf Laplacian Coherence Gate (Selected)

Every agent action that modifies shared state must pass a coherence gate before committing. The gate computes sheaf Laplacian energy between the proposed action's embedding and the relevant knowledge context. Actions with energy below a domain-specific threshold pass immediately. Higher-energy actions trigger progressively deeper analysis.

**Pros:**
- Prevents incoherent outputs before they propagate
- Mathematical guarantee (sheaf cohomology detects contradictions that similarity misses)
- Compute-proportional: simple coherent actions pass in <1ms
- Builds on existing ADR-052 infrastructure (CoherenceService, engine adapters)
- Enables "Coherence Verified" attestation for compliance (ADR-070)
- WASM-compatible for browser deployments

**Cons:**
- Adds 1-100ms latency to every agent action (depending on context size and energy level)
- Threshold tuning required per domain (13 domains in AQE)
- False positives may block legitimate novel patterns
- Requires building context windows for each action type
- prime-radiant is v0.1.3 (newer dependency)

### Option 2: Post-Action Detection Only (Status Quo with ADR-052) (Rejected)

Continue relying on Strange Loop's periodic coherence checks and pattern retrieval filtering.

**Why rejected:** Periodic detection means incoherent actions execute and propagate before detection. The damage window between action and detection is one Strange Loop cycle (configurable but typically seconds to minutes). In a 15-agent swarm, multiple incoherent actions can cascade within a single cycle.

### Option 3: LLM-Based Coherence Verification (Rejected)

Use a secondary LLM call to verify each agent's output before committing.

**Why rejected:** Non-deterministic (same input can produce different coherence judgments). Expensive ($0.003+ per check at Haiku, $0.015+ at Opus). Adds 2-5s latency per action. Cannot provide mathematical proof of coherence -- only a probabilistic opinion. Creates a recursive trust problem (who verifies the verifier?).

### Option 4: Embedding Similarity Threshold (Rejected)

Check cosine similarity between the proposed action's embedding and existing knowledge. Reject actions below a similarity threshold.

**Why rejected:** Cosine similarity measures semantic distance, not logical coherence. Two statements can be semantically similar but logically contradictory ("the API returns 200" vs "the API returns 201" have high cosine similarity but express opposite facts). Sheaf Laplacian energy captures the structural consistency that similarity misses.

---

## Implementation

### Coherence Gate Interface

```typescript
// src/coherence/action-coherence-gate.ts
interface ActionCoherenceGate {
  /** Check coherence of a proposed agent action before execution */
  checkAction(action: ProposedAction): Promise<CoherenceGateResult>;

  /** Configure thresholds for a specific domain */
  setDomainThresholds(domain: string, thresholds: DomainThresholds): void;

  /** Get current gate metrics */
  getMetrics(): CoherenceGateMetrics;
}

interface ProposedAction {
  agentId: string;
  actionType: 'test-generation' | 'pattern-mutation' | 'quality-gate' |
              'code-change' | 'confidence-update' | 'pattern-promotion';
  domain: string;
  /** Embedding of the proposed action content */
  embedding: Float32Array;
  /** IDs of relevant context items to check coherence against */
  contextIds: string[];
  /** The action payload (for witness recording) */
  payload: unknown;
}

interface CoherenceGateResult {
  /** Whether the action is approved to execute */
  approved: boolean;
  /** Sheaf Laplacian energy score */
  energy: number;
  /** Which compute lane handled this check */
  lane: 'reflex' | 'retrieval' | 'heavy' | 'human';
  /** Detected contradictions (if any) */
  contradictions: Contradiction[];
  /** Recommendations for resolving contradictions */
  recommendations: string[];
  /** Latency of the coherence check */
  latencyMs: number;
  /** Witness entry for the gate decision (ADR-070) */
  witnessId?: string;
}
```

### Compute Ladder

The coherence gate operates on a compute ladder based on the initial energy score:

| Lane | Energy Range | Latency | Action | Context Size |
|------|--------------|---------|--------|-------------|
| **Reflex** | E < 0.1 | <1ms | Approve immediately | 5-10 nearest patterns |
| **Retrieval** | 0.1 - 0.4 | ~10ms | Fetch additional context, recompute | 20-50 patterns + related tests |
| **Heavy** | 0.4 - 0.7 | ~100ms | Full sheaf analysis with causal verification | All patterns in domain |
| **Human** | E > 0.7 | Async | Escalate to Queen Coordinator for review | Full cross-domain context |

### Threshold Tuning Strategy

Each of AQE's 13 DDD domains has different coherence requirements:

| Domain | Threshold Preset | Rationale |
|--------|-----------------|-----------|
| security-verification | Strict (0.08) | Security findings must be highly coherent |
| quality-assessment | Strict (0.10) | Quality gate decisions are high-stakes |
| test-generation | Moderate (0.20) | Test variation is expected and desirable |
| defect-classification | Moderate (0.15) | Defect patterns should be consistent |
| coverage-analysis | Standard (0.25) | Coverage metrics have natural variance |
| learning-optimization | Relaxed (0.35) | Learning should tolerate exploration |

**Auto-tuning**: The threshold tuner from ADR-052 (39 tests passing) adapts thresholds based on the false positive rate. If a domain's gate rejects more than 10% of actions, the threshold is relaxed by 0.02 per week. If the domain's coherence violations increase, the threshold tightens.

### Integration Points

```typescript
// Extension to agent action lifecycle
class CoherenceGatedAgent {
  async executeAction(action: AgentAction): Promise<ActionResult> {
    // 1. Build proposed action with embedding
    const proposed: ProposedAction = {
      agentId: this.agentId,
      actionType: action.type,
      domain: action.domain,
      embedding: await this.embed(action.content),
      contextIds: await this.getRelevantContext(action),
      payload: action,
    };

    // 2. Check coherence gate
    const gateResult = await this.coherenceGate.checkAction(proposed);

    if (!gateResult.approved) {
      // 3a. Action blocked -- emit event for monitoring
      await this.emitCoherenceBlock(proposed, gateResult);

      if (gateResult.lane === 'human') {
        // Escalate to Queen Coordinator
        return this.escalateToQueen(proposed, gateResult);
      }

      // Attempt self-correction using recommendations
      return this.attemptCorrection(action, gateResult.recommendations);
    }

    // 3b. Action approved -- execute and record witness
    const result = await this.execute(action);
    await this.witnessChain.recordMutation({
      actorId: this.agentId,
      mutationType: action.type,
      patternId: action.targetId,
      payload: {
        coherenceEnergy: gateResult.energy,
        coherenceLane: gateResult.lane,
        witnessId: gateResult.witnessId,
      },
    });

    return result;
  }
}
```

### Self-Correction Protocol

When the coherence gate blocks an action, the agent can attempt self-correction:

1. **Retrieve contradictions**: Get the specific patterns that conflict with the proposed action.
2. **Adjust action**: Modify the proposed output to resolve contradictions (e.g., change the expected status code to match existing tests).
3. **Re-check**: Submit the corrected action through the gate.
4. **Limit retries**: Maximum 3 self-correction attempts. After that, escalate to Queen.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Extends | ADR-052 | Coherence-Gated QE with Prime Radiant | Extends system-level coherence to per-action gating |
| Depends On | ADR-052 | Coherence-Gated QE with Prime Radiant | Uses CoherenceService, engine adapters, threshold tuner |
| Depends On | ADR-081 | Native HNSW Integration via NAPI | Context retrieval uses native HNSW for speed |
| Relates To | ADR-030 | Coherence-Gated Quality Gates | Extends coherence gating from quality gates to all agent actions |
| Relates To | ADR-060 | Semantic Anti-Drift | Coherence gate catches semantic drift at action time |
| Relates To | ADR-070 | Witness Chain Audit Compliance | Gate decisions recorded in witness chain |
| Relates To | ADR-074 | Loki-Mode Adversarial Quality Gates | Complements sycophancy and test quality checks |
| Part Of | MADR-001 | V3 Implementation Initiative | RVF integration -- Phase 3 Safety |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| RES-001 | RuVector Router, SONA & Utilities Research | Research Report | `docs/research/ruvector-routing-sona-utilities.md` |
| RES-002 | RuVector MCP Brain, Cognitum & RuVLLM Research | Research Report | `docs/research/ruvector-mcp-brain-llm.md` |
| RES-003 | Six Thinking Hats Analysis | Analysis | `docs/research/six-thinking-hats-aqe-ruvector-analysis.md` |
| RES-004 | RuVector Advanced Systems Research | Research Report | `docs/research/ruvector-advanced-systems.md` |
| EXT-001 | prime-radiant-advanced-wasm | npm Package | Sheaf Laplacian coherence engine |
| EXT-002 | cognitum-gate-kernel | Rust Crate | Distributed coherence fabric (future) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-03-15 | Proposed | 2026-09-15 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-03-15 | Initial creation from Six Thinking Hats analysis Phase 3 recommendation. Pre-action coherence gating to prevent incoherent agent outputs from entering the shared knowledge base. |

---

## Definition of Done Checklist

Before requesting approval, verify:

### Core (ECADR)
- [ ] **E - Evidence**: Gate blocks >95% of synthetic contradictions in test suite with <5% false positive rate
- [ ] **C - Criteria**: 4 options compared (sheaf gate, post-action, LLM-based, similarity threshold)
- [ ] **A - Agreement**: Domain owners consulted on per-domain thresholds
- [ ] **D - Documentation**: WH(Y) statement complete, ADR published
- [ ] **R - Review**: Review cadence set, owner assigned

### Extended
- [ ] **Dp - Dependencies**: ADR-052, ADR-081, ADR-030, ADR-060, ADR-070, ADR-074 relationships documented
- [ ] **Rf - References**: Research reports linked
- [ ] **M - Master**: Linked to MADR-001 V3 Implementation Initiative
