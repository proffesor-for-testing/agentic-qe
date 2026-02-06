# ADR-060: Semantic Anti-Drift Protocol for Agent Events

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-060 |
| **Status** | Proposed |
| **Date** | 2026-02-06 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |
| **Analysis Method** | Six Thinking Hats (AISP Integration Review) |
| **Conceptual Inspiration** | [AISP 5.1 Anti-Drift Protocol](https://github.com/bar181/aisp-open-core) |

---

## WH(Y) Decision Statement

**In the context of** the multi-agent swarm coordination system (ADR-008) where up to 15 agents communicate via domain events (ADR-002) in hierarchical-mesh topology,

**facing** semantic drift — the progressive distortion of meaning as events propagate through agent chains, where agent 8 subtly reinterprets what agent 3 meant by "critical defect" or "high-risk coverage gap", compounding across hops and degrading swarm coordination quality,

**we decided for** implementing a Semantic Anti-Drift Protocol that attaches HNSW-computed semantic fingerprints to domain events at emission time and verifies fingerprint integrity at each agent boundary, rejecting events that have drifted beyond a configurable cosine distance threshold,

**and neglected** (a) AISP's full anti-drift notation system (rejected: requires 512-symbol vocabulary), (b) schema-only validation (rejected: catches structural drift but not semantic drift), (c) no drift detection (status quo: drift silently degrades swarm quality),

**to achieve** guaranteed semantic stability across multi-agent pipelines — ensuring that the meaning of domain events is preserved across all hops, with drift detection and automatic re-emission from source when drift exceeds threshold,

**accepting that** semantic fingerprinting adds ~15ms overhead per event emission (embedding computation), requires the transformer model to be loaded (existing ReasoningBank dependency), and that the cosine distance threshold requires calibration per event type.

---

## Context

AQE v3's 15-agent hierarchical-mesh topology (CLAUDE.md) processes domain events through chains of agents. Each agent subscribes to events, processes them, and emits new events. The `InMemoryEventBus` (ADR-002) provides O(1) event routing but has no mechanism to detect when an agent's processing subtly changes the semantic meaning of a concept.

Example of drift: Agent A emits `CoverageGapDetectedEvent` with `riskScore: 0.85` meaning "85% likely to contain a defect." Agent B processes this and emits `DefectPredictedEvent` interpreting the risk as "85% of code is uncovered." Agent C receives a semantically drifted concept and makes incorrect quality gate decisions. This problem is invisible to schema validation — the TypeScript types are correct, but the meaning has shifted.

AISP 5.1 solved this with its Anti-Drift Protocol: `for-all s in Sigma_512: Mean(s) = Mean_0(s)` — every symbol's meaning must equal its original defined meaning, verified at each pipeline hop. We adapt this concept using HNSW embeddings: attach a semantic fingerprint (embedding vector) to each event at emission, and verify the fingerprint hasn't drifted at each receiving boundary.

---

## Options Considered

### Option 1: HNSW Semantic Fingerprinting on Domain Events (Selected)

Extend `DomainEvent` with a `semanticFingerprint` field containing the HNSW embedding of the event payload at emission time. At each agent boundary, re-embed the payload and verify cosine similarity exceeds the drift threshold.

**Pros:**
- Catches semantic drift invisible to schema validation
- Uses existing HNSW + transformer infrastructure
- Configurable per event type (some events tolerate more drift)
- Drift metrics feed into Strange Loop self-awareness (ADR-031)
- Automatic re-emission protocol recovers from drift

**Cons:**
- ~15ms overhead per event emission (embedding computation)
- Requires transformer model in memory (already loaded for ReasoningBank)
- Threshold calibration needed per event type
- False positives possible when legitimate enrichment looks like drift

### Option 2: Full AISP Anti-Drift Notation (Rejected)

Import AISP's `Sigma_512` symbol set and enforce `Mean(s) = Mean_0(s)` using AISP's formal system.

**Why rejected:** Requires 512-symbol vocabulary ingestion per agent (8,817 tokens). AQE agents communicate via TypeScript events, not formal notation. The concept is right; the mechanism doesn't fit.

### Option 3: Schema-Only Validation (Rejected)

Use JSON Schema or Zod to validate event structure at each boundary.

**Why rejected:** Schema validation ensures structural correctness (field types, required fields) but cannot detect semantic drift. An event can be structurally valid but semantically drifted.

---

## Technical Design

### Extended DomainEvent Interface

```typescript
// Extension to shared/types/index.ts
interface SemanticFingerprint {
  /** HNSW embedding of event payload at emission time */
  embedding: Float32Array;
  /** Cosine distance threshold for drift detection */
  driftThreshold: number;
  /** Source agent that originally emitted this event */
  sourceAgentId: string;
  /** Hop count — incremented at each agent boundary */
  hopCount: number;
  /** Timestamp of original emission */
  emittedAt: number;
}

// Extended DomainEvent (backward compatible — fingerprint is optional)
interface DomainEvent<T = unknown> {
  type: string;
  source: DomainName;
  data: T;
  correlationId: string;
  timestamp: number;
  /** Semantic anti-drift fingerprint (ADR-060) */
  semanticFingerprint?: SemanticFingerprint;
}
```

### Anti-Drift Middleware for EventBus

```typescript
// New middleware in kernel/anti-drift-middleware.ts
class SemanticAntiDriftMiddleware {
  constructor(
    private embedder: EmbeddingService,
    private config: AntiDriftConfig
  ) {}

  /** Attach fingerprint at emission time */
  async onEmit(event: DomainEvent): Promise<DomainEvent> {
    if (!this.config.enabled) return event;

    const embedding = await this.embedder.embed(
      JSON.stringify(event.data)
    );

    return {
      ...event,
      semanticFingerprint: {
        embedding,
        driftThreshold: this.config.thresholdForType(event.type),
        sourceAgentId: event.source,
        hopCount: 0,
        emittedAt: Date.now(),
      },
    };
  }

  /** Verify fingerprint at reception boundary */
  async onReceive(event: DomainEvent): Promise<DriftCheckResult> {
    if (!event.semanticFingerprint) {
      return { drifted: false, distance: 0 };
    }

    const currentEmbedding = await this.embedder.embed(
      JSON.stringify(event.data)
    );

    const distance = cosineDistance(
      currentEmbedding,
      event.semanticFingerprint.embedding
    );

    const drifted = distance > event.semanticFingerprint.driftThreshold;

    if (drifted) {
      // Emit drift detection event for Strange Loop monitoring
      await this.eventBus.publish({
        type: 'SemanticDriftDetectedEvent',
        source: 'anti-drift-middleware',
        data: {
          originalEvent: event.type,
          driftDistance: distance,
          threshold: event.semanticFingerprint.driftThreshold,
          hopCount: event.semanticFingerprint.hopCount,
          sourceAgent: event.semanticFingerprint.sourceAgentId,
        },
      });
    }

    return { drifted, distance, hopCount: event.semanticFingerprint.hopCount + 1 };
  }
}
```

### Default Drift Thresholds

| Event Category | Threshold | Rationale |
|---------------|-----------|-----------|
| Quality gate events | 0.05 | Tight — gate decisions are high-stakes |
| Coverage events | 0.10 | Moderate — coverage semantics are well-defined |
| Test generation events | 0.15 | Relaxed — creative variation is acceptable |
| Learning/pattern events | 0.20 | Most relaxed — patterns evolve naturally |

### Integration Points

| Component | Integration |
|-----------|-------------|
| `event-bus.ts` (ADR-002) | Middleware hook for emit/receive |
| `real-qe-reasoning-bank.ts` (ADR-021) | Embedding computation |
| `swarm-observer.ts` (ADR-031) | Drift metrics for self-awareness |
| `coherence-service.ts` (ADR-052) | Drift as coherence signal |
| `worker-manager.ts` (ADR-014) | Drift monitoring background worker |

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-002 | Event-Driven Communication | Middleware extension point on EventBus |
| Depends On | ADR-021 | ReasoningBank | Transformer embeddings for fingerprinting |
| Depends On | ADR-038 | Memory Unification | HNSW for embedding computation |
| Relates To | ADR-008 | Multi-Agent Coordination | Drift occurs in multi-agent pipelines |
| Relates To | ADR-031 | Strange Loop Self-Awareness | Drift metrics feed self-model |
| Relates To | ADR-052 | Coherence-Gated QE | Drift as coherence signal |
| Relates To | ADR-054 | A2A Protocol | Anti-drift for cross-system agent communication |
| Part Of | MADR-001 | V3 Implementation Initiative | Phase 13 enhancement |

---

## Success Metrics

- [ ] `SemanticAntiDriftMiddleware` implemented as EventBus middleware
- [ ] Drift detection catches >90% of injected semantic drift in tests
- [ ] <15ms overhead per event emission (embedding computation)
- [ ] False positive rate <5% on normal event flows
- [ ] Drift metrics visible in Strange Loop self-model dashboard
- [ ] Configurable thresholds per event type via `.agentic-qe/config.yaml`
- [ ] 35+ tests covering drift detection, threshold calibration, re-emission protocol

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| EXT-001 | AISP 5.1 Anti-Drift Protocol | Conceptual Inspiration | [aisp-open-core](https://github.com/bar181/aisp-open-core) |
| INT-001 | Event Bus | Existing Code | `v3/src/kernel/event-bus.ts` |
| INT-002 | Strange Loop Self-Awareness | Existing Code | `v3/src/domains/` (ADR-031) |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-02-06 | Created from Six Thinking Hats AISP analysis. Concept from AISP anti-drift; native HNSW implementation. |
