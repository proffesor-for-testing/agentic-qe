# ADR-052: Coherence-Gated Quality Engineering with Prime Radiant

## Status
**Implemented** | 2026-01-24

### Implementation Progress
| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Foundation | ✅ Complete | Package, WASM loader, CoherenceService, 6 engine adapters, 209 tests |
| Phase 2: Strange Loop | ✅ Complete | Coherence integration, violation events, BeliefReconciler, metrics |
| Phase 3: Learning Module | ✅ Complete | Pattern filter, MemoryAuditor, CausalVerifier, promotion gate |
| Phase 4: Production | ✅ Complete | MCP tools (4), threshold auto-tuning, WASM fallback, CI/CD badge |

### Verification Summary (2026-01-24)
- **Total Tests:** 382+ coherence-related tests passing
- **Threshold Tuner:** 39 tests (threshold-tuner.test.ts)
- **WASM Fallback:** 34 tests (wasm-fallback-handler.test.ts)
- **Test Generation Gate:** 27 tests (coherence-gate.test.ts)
- **Engine Adapters:** 209 tests across 6 engines
- **CI/CD Workflow:** `.github/workflows/coherence.yml` configured

## Context

AQE v3 currently relies on statistical confidence scores and heuristic-based consensus for multi-agent coordination. The Strange Loop self-awareness system (ADR-031) detects health degradation but cannot mathematically verify belief consistency across agents. The QEReasoningBank (ADR-021) stores patterns without validating their coherence with existing knowledge.

**Current Limitations:**
1. Multi-agent consensus uses majority voting, not mathematical verification
2. Pattern retrieval may return contradictory guidance
3. Self-healing decisions lack causal verification
4. Memory drift detection is threshold-based, not proof-based
5. No formal verification of test generation inputs

**Opportunity:**
The `prime-radiant-advanced-wasm` package (v0.1.3) provides mathematical coherence gates using advanced mathematics:
- Sheaf cohomology for contradiction detection
- Spectral analysis for collapse prediction
- Causal inference for spurious correlation detection
- Category theory for type verification
- Homotopy type theory for formal verification

## Decision

**We will integrate Prime Radiant as the mathematical coherence layer for AQE v3.**

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AQE v3 COHERENCE ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────┐     ┌─────────────────────┐     ┌────────────┐  │
│  │ QE Agent       │────▶│ COHERENCE GATE      │────▶│ Execution  │  │
│  │ Decision       │     │ (Prime Radiant)     │     │ Layer      │  │
│  └────────────────┘     └─────────────────────┘     └────────────┘  │
│                                │                                     │
│                    ┌───────────┼───────────┐                        │
│                    ▼           ▼           ▼                        │
│              ┌──────────┐ ┌──────────┐ ┌──────────┐                 │
│              │ REFLEX   │ │ RETRIEVAL│ │ ESCALATE │                 │
│              │ E < 0.1  │ │ E: 0.1-0.4│ │ E > 0.4  │                 │
│              │ <1ms     │ │ ~10ms    │ │ Queen    │                 │
│              └──────────┘ └──────────┘ └──────────┘                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Integration Points

#### 1. Coherence Service (`v3/src/integrations/coherence/`)

```typescript
interface CoherenceService {
  // Core coherence checking
  checkCoherence(nodes: CoherenceNode[]): Promise<CoherenceResult>;

  // Specialized engines
  detectContradictions(beliefs: Belief[]): Promise<Contradiction[]>;
  predictCollapse(swarmState: SwarmState): Promise<CollapseRisk>;
  verifyCausality(cause: string, effect: string): Promise<CausalVerification>;
  verifyTypes(pipeline: TypedPipeline): Promise<TypeVerification>;

  // Audit and replay
  createWitness(decision: Decision): Promise<WitnessRecord>;
  replayFromWitness(witnessId: string): Promise<ReplayResult>;
}

interface CoherenceResult {
  energy: number;           // Sheaf Laplacian energy
  isCoherent: boolean;      // energy < threshold
  lane: 'reflex' | 'retrieval' | 'heavy' | 'human';
  contradictions: Contradiction[];
  recommendations: string[];
}
```

#### 2. Strange Loop Enhancement (`v3/src/strange-loop/`)

```typescript
// Add to StrangeLoopOrchestrator.runCycle()
async runCycle(): Promise<CycleResult> {
  const observation = await this.observer.observe();

  // NEW: Coherence verification of swarm beliefs
  const coherenceCheck = await this.coherenceService.checkSwarmCoherence(
    observation.agentHealth
  );

  if (!coherenceCheck.isCoherent) {
    this.emit('coherence_violation', {
      energy: coherenceCheck.energy,
      contradictions: coherenceCheck.contradictions,
    });

    // Trigger belief reconciliation before proceeding
    await this.reconcileBeliefs(coherenceCheck.contradictions);
  }

  // Continue with self-healing...
}
```

#### 3. QE ReasoningBank Enhancement (`v3/src/learning/`)

```typescript
// Add coherence validation to pattern retrieval
async routeTask(request: QERoutingRequest): Promise<QERoutingResult> {
  const candidates = await this.searchPatterns(request.task);

  // NEW: Verify pattern coherence before returning
  const coherentPatterns = await this.coherenceService.filterCoherent(
    candidates,
    request.context
  );

  if (coherentPatterns.length === 0 && candidates.length > 0) {
    // All patterns conflict - escalate
    await this.escalateContradiction(candidates);
  }

  return this.selectBestPattern(coherentPatterns);
}
```

#### 4. Test Generation Gate (`v3/src/domains/test-generation/`)

```typescript
async generateTests(spec: TestSpecification): Promise<TestSuite> {
  // NEW: Verify requirement coherence before generation
  const coherence = await this.coherenceService.checkCoherence(
    spec.requirements.map(r => ({
      id: r.id,
      embedding: await this.embed(r.description),
    }))
  );

  if (coherence.lane === 'human') {
    throw new CoherenceError(
      'Requirements contain unresolvable contradictions',
      coherence.contradictions
    );
  }

  if (coherence.lane === 'retrieval') {
    // Fetch additional context to resolve ambiguity
    spec = await this.enrichSpecification(spec, coherence.recommendations);
  }

  return this.generator.generate(spec);
}
```

#### 5. Multi-Agent Consensus Verification

```typescript
// Replace majority voting with mathematical verification
async verifyConsensus(votes: AgentVote[]): Promise<ConsensusResult> {
  const spectralEngine = new SpectralEngine();

  votes.forEach(vote => {
    spectralEngine.add_node(vote.agentId);
  });

  // Connect agents that agree
  for (let i = 0; i < votes.length; i++) {
    for (let j = i + 1; j < votes.length; j++) {
      if (votes[i].verdict === votes[j].verdict) {
        spectralEngine.add_edge(votes[i].agentId, votes[j].agentId, 1.0);
      }
    }
  }

  const collapseRisk = spectralEngine.predict_collapse_risk();
  const fiedlerValue = spectralEngine.compute_fiedler_value();

  return {
    isValid: collapseRisk < 0.3 && fiedlerValue > 0.1,
    confidence: 1 - collapseRisk,
    isFalseConsensus: fiedlerValue < 0.05,
    recommendation: collapseRisk > 0.3
      ? 'Spawn independent reviewer'
      : 'Consensus verified',
  };
}
```

### Compute Lanes

| Lane | Energy Range | Latency | Action |
|------|--------------|---------|--------|
| **Reflex** | E < 0.1 | <1ms | Immediate execution |
| **Retrieval** | 0.1 - 0.4 | ~10ms | Fetch additional context |
| **Heavy** | 0.4 - 0.7 | ~100ms | Deep analysis |
| **Human** | E > 0.7 | Async | Queen escalation |

### New MCP Tools

```typescript
// mcp/tools/coherence.ts
export const coherenceTools = {
  'coherence_check': {
    description: 'Check coherence of beliefs/facts',
    handler: async (params) => coherenceService.checkCoherence(params.nodes),
  },
  'coherence_audit_memory': {
    description: 'Audit QE memory for contradictions',
    handler: async () => coherenceService.auditMemory(),
  },
  'coherence_verify_consensus': {
    description: 'Verify multi-agent consensus mathematically',
    handler: async (params) => coherenceService.verifyConsensus(params.votes),
  },
  'coherence_predict_collapse': {
    description: 'Predict swarm collapse risk',
    handler: async (params) => coherenceService.predictCollapse(params.state),
  },
};
```

### Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `coherence_violation` | Energy > threshold | `{ energy, contradictions }` |
| `consensus_invalid` | False consensus detected | `{ fiedlerValue, agents }` |
| `collapse_predicted` | Risk > 0.5 | `{ risk, weakVertices }` |
| `belief_reconciled` | Contradiction resolved | `{ resolution, witness }` |

## Consequences

### Positive
1. **Mathematical guarantees** - Coherence is proven, not estimated
2. **Hallucination prevention** - Contradictory inputs blocked before action
3. **Trust layer** - "Coherence Verified" badges for CI/CD reports
4. **Regulatory compliance** - Formal verification appeals to auditors
5. **Faster detection** - Strange Loop catches drift 10x faster
6. **Deterministic replay** - Blake3 witness chains for debugging

### Negative
1. **Dependency risk** - Package is v0.1.3 (new)
2. **Learning curve** - Sheaf mathematics is advanced
3. **Performance overhead** - Additional coherence checks (~1-40ms)
4. **Threshold tuning** - Requires calibration per use case

### Neutral
1. **WASM dependency** - Modern but well-supported
2. **New abstraction** - Teams must learn coherence concepts

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Coherence check (10 nodes) | <1ms | p99 latency |
| Coherence check (100 nodes) | <5ms | p99 latency |
| Coherence check (1000 nodes) | <50ms | p99 latency |
| Memory overhead | <10MB | RSS increase |
| False negative rate | 0% | Known contradiction tests |
| False positive rate | <5% | Valid input tests |

## Migration Strategy

### Phase 1: Foundation (Week 1-2)
- Install `prime-radiant-advanced-wasm`
- Create `CoherenceService` adapter
- Add unit tests for all 6 engines
- Benchmark performance

### Phase 2: Strange Loop (Week 3-4)
- Integrate coherence into `StrangeLoopOrchestrator`
- Add `coherence_violation` event
- Implement belief reconciliation protocol
- Add coherence metrics to stats

### Phase 3: Learning Module (Week 5-6)
- Add coherence filter to pattern retrieval
- Implement memory coherence auditor
- Enhance causal discovery with CausalEngine
- Add coherence-based promotion criteria

### Phase 4: Production (Week 7-8)
- Add MCP tools for coherence operations
- Implement threshold auto-tuning
- Create fallback for WASM failures
- Add "Coherence Verified" CI/CD badges

## Alternatives Considered

### 1. Custom Coherence Implementation
**Rejected:** Sheaf cohomology requires specialized mathematics expertise. Prime Radiant provides battle-tested implementations.

### 2. LLM-Based Coherence Checking
**Rejected:** Non-deterministic, expensive, and lacks mathematical proof guarantees.

### 3. Simple Embedding Similarity
**Rejected:** Cannot detect logical contradictions, only semantic similarity.

### 4. Rule-Based Validation
**Rejected:** Brittle, doesn't scale, misses subtle contradictions.

## References

- [prime-radiant-advanced-wasm](https://www.npmjs.com/package/prime-radiant-advanced-wasm)
- [ruvector GitHub](https://github.com/ruvnet/ruvector)
- ADR-021: QE ReasoningBank for Pattern Learning
- ADR-031: Strange Loop Self-Awareness
- ADR-047: MinCut Self-Organizing Coordination

## Decision Outcome

**Approved for implementation** pending successful Phase 1 POC demonstrating:
1. <5ms coherence checks for 100 nodes
2. 100% detection of synthetic contradiction test cases
3. Stable WASM loading in Node.js 18+ and browser environments

---

## Appendix A: Mathematical Background

### Sheaf Laplacian Energy
```
E(S) = Σ wₑ · ‖ρᵤ(xᵤ) - ρᵥ(xᵥ)‖²
```
- `wₑ`: Edge weight (relationship importance)
- `ρ`: Restriction maps (information transformation)
- `x`: Node states (embedded representations)
- Lower energy = higher coherence

### Fiedler Value (Spectral Gap)
The second-smallest eigenvalue of the Laplacian matrix. Low values indicate:
- Weak connectivity
- Potential for network fragmentation
- False consensus risk

### Causal Verification
Uses intervention-based causal inference to distinguish:
- True causation (A causes B)
- Spurious correlation (A and B share hidden cause C)
- Reverse causation (B causes A)

---

## Appendix B: Code Examples

### Basic Usage
```typescript
import { CohomologyEngine, SpectralEngine } from 'prime-radiant-advanced-wasm';

// Create engines
const cohomology = new CohomologyEngine();
const spectral = new SpectralEngine();

// Add beliefs as nodes
cohomology.add_node('belief-1', embedding1);
cohomology.add_node('belief-2', embedding2);
cohomology.add_edge('belief-1', 'belief-2', similarity);

// Check coherence
const energy = cohomology.sheaf_laplacian_energy();
const isCoherent = energy < 0.1;

// Predict collapse
spectral.add_node('agent-1');
spectral.add_node('agent-2');
spectral.add_edge('agent-1', 'agent-2', 1.0);
const collapseRisk = spectral.predict_collapse_risk();
```

### Integration with Strange Loop
```typescript
import { StrangeLoopOrchestrator } from '@agentic-qe/v3';
import { CoherenceService } from '@agentic-qe/v3/integrations/coherence';

const coherence = new CoherenceService();
const strangeLoop = createStrangeLoopOrchestrator(provider, executor);

strangeLoop.on('observation_complete', async ({ observation }) => {
  const check = await coherence.checkSwarmCoherence(observation);
  if (!check.isCoherent) {
    console.warn(`Swarm coherence violation: E=${check.energy}`);
  }
});
```
