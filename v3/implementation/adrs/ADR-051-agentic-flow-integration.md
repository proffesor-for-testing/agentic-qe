# ADR-051: Agentic-Flow Deep Integration for AQE v3

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-051 |
| **Status** | Accepted |
| **Date** | 2026-01-20 |
| **Author** | Architecture Team |
| **Review Cadence** | Weekly (active implementation) |

---

## WH(Y) Decision Statement

**In the context of** AQE v3's need for faster code transformations, persistent cross-session learning, cost-optimized LLM routing, and high-performance agent coordination,

**facing** LLM API latency for mechanical code transforms (352ms avg), loss of patterns between sessions, suboptimal model selection leading to unnecessary costs, and 200ms+ coordination latency between agents,

**we decided for** deep integration of agentic-flow's Agent Booster, ReasoningBank, Multi-Model Router, ONNX Embeddings, and QUIC Swarm into AQE v3's architecture,

**and neglected** building equivalent features from scratch (high effort, duplicated work), maintaining status quo (performance and cost penalties), or shallow integration via CLI only (limited benefits),

**to achieve** 352x faster mechanical transforms, 46% faster recurring tasks, 87% cost reduction on LLM calls, privacy-preserving local embeddings, and <10ms agent coordination,

**accepting that** this requires dependency management, adapter layer development, phased rollout over 5-6 weeks, and careful coordination to avoid conflicts between parallel implementation tracks.

---

## Context

### Six Thinking Hats Analysis Summary

A comprehensive Six Thinking Hats analysis of the [agentic-flow repository](https://github.com/ruvnet/agentic-flow) identified **5 features** with significant potential to enhance AQE v3:

| Feature | Technology | Key Metric | Priority |
|---------|------------|------------|----------|
| **Agent Booster** | Rust/WASM | 352x faster, $0 cost | P0 |
| **ReasoningBank** | ChromaDB + Vector Search | 46% faster tasks | P0 |
| **Multi-Model Router** | 10+ Provider Support | 87% cost savings | P1 |
| **ONNX Embeddings** | Local ML Inference | Privacy-preserving | P1 |
| **QUIC Swarm** | QUIC Protocol | <10ms latency | P2 |

### Current Gaps Addressed

1. **Mechanical Transform Latency**: Current approach uses LLM APIs for simple transforms like `var→const`, `add-types`, `remove-console`. Agent Booster performs these at 1ms vs 352ms.

2. **Cross-Session Learning**: ADR-021 ReasoningBank stores patterns but lacks the advanced trajectory tracking, experience replay, and pattern evolution from agentic-flow's implementation.

3. **Cost Optimization**: ADR-026 defines 3-tier model routing but doesn't include the full complexity analyzer and budget enforcement from Multi-Model Router.

4. **Embedding Privacy**: External embedding APIs expose code to third parties. ONNX provides equivalent quality locally.

5. **Coordination Latency**: Current agent coordination uses HTTP with 100-500ms round-trips. QUIC enables <10ms.

---

## Options Considered

### Option 1: Deep Integration with Adapters (Selected)

Integrate agentic-flow as a dependency with adapter layers to maintain AQE v3's architecture.

**Pros:** Maximum benefit, reuse proven implementations, active upstream maintenance
**Cons:** External dependency, version coordination required

### Option 2: Port Features Manually (Rejected)

Copy and adapt agentic-flow code into AQE v3 codebase.

**Why rejected:** Duplicates effort, loses upstream improvements, significant maintenance burden.

### Option 3: CLI-Only Integration (Rejected)

Use agentic-flow only through its CLI interface.

**Why rejected:** Performance overhead, limited integration depth, can't share memory/state.

### Option 4: Status Quo (Rejected)

Continue without agentic-flow features.

**Why rejected:** Misses significant performance, cost, and capability improvements.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Part Of | MADR-001 | V3 Implementation Initiative | Performance enhancement phase |
| Depends On | ADR-017 | RuVector Integration | Agent Booster complements RuVector |
| Depends On | ADR-021 | QE ReasoningBank | Enhanced by agentic-flow ReasoningBank |
| Depends On | ADR-038 | Memory Unification | AgentDB backend for ReasoningBank |
| Depends On | ADR-050 | RuVector Neural Backbone | ML-first architecture alignment |
| Enhances | ADR-022 | Adaptive QE Agent Routing | Multi-Model Router integration |
| Enhances | ADR-008 | Multi-Agent Coordination | QUIC Swarm for faster coordination |

---

## Technical Architecture

### Integration Points

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AQE v3 Architecture                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐            │
│  │ Agent Booster│   │ReasoningBank │   │ Multi-Model  │            │
│  │   Adapter    │   │   Adapter    │   │Router Adapter│            │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘            │
│         │                  │                   │                    │
│  ┌──────▼───────┐   ┌──────▼───────┐   ┌──────▼───────┐            │
│  │qe-test-      │   │qe-learning-  │   │ ADR-026      │            │
│  │refactorer    │   │coordinator   │   │ Tier System  │            │
│  │qe-flaky-     │   │qe-defect-    │   │              │            │
│  │hunter        │   │predictor     │   │              │            │
│  └──────────────┘   └──────────────┘   └──────────────┘            │
│                                                                      │
│  ┌──────────────┐   ┌──────────────┐                               │
│  │    ONNX      │   │  QUIC Swarm  │                               │
│  │  Embeddings  │   │  Coordinator │                               │
│  │   Adapter    │   │   Adapter    │                               │
│  └──────┬───────┘   └──────┬───────┘                               │
│         │                  │                                        │
│  ┌──────▼───────┐   ┌──────▼───────┐                               │
│  │  AgentDB     │   │ Queen/Worker │                               │
│  │ Vector Store │   │ Coordination │                               │
│  └──────────────┘   └──────────────┘                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Agent Booster Integration

**Target Agents:**
- `qe-test-refactorer` - TDD refactor phase (mechanical edits)
- `qe-flaky-hunter` - Auto-fix common flaky patterns
- `qe-code-reviewer` - Suggestion generation

**Supported Transforms:**
```typescript
type AgentBoosterTransform =
  | 'var-to-const'      // var → const/let
  | 'add-types'         // Add TypeScript annotations
  | 'remove-console'    // Remove console.* statements
  | 'promise-to-async'  // .then() → async/await
  | 'cjs-to-esm'        // CommonJS → ES modules
  | 'func-to-arrow';    // function → arrow function
```

**Tier Integration (ADR-026 Enhancement):**
```
Tier 0: Agent Booster    (mechanical transforms, <1ms, $0)
Tier 1: Gemini Flash     (simple tasks, free tier)
Tier 2: Haiku            (budget, ~500ms)
Tier 3: GPT-4-mini       (complex, ~1s)
Tier 4: Opus             (expert reasoning, ~3s)
```

### ReasoningBank Integration

**Integration with ADR-021:**
- Use agentic-flow's trajectory tracking for learning paths
- Integrate experience replay for pattern reinforcement
- Add pattern evolution tracking to existing SQLite backend

**Memory Namespaces:**
```
aqe/reasoning/
├── trajectories/     - Task execution paths
├── patterns/         - Learned patterns with quality scores
├── experiences/      - Curated successful approaches
└── evolution/        - Pattern version history
```

### Multi-Model Router Enhancement

**Complexity Analyzer Signals:**
```typescript
interface ComplexitySignals {
  tokenCount: number;           // Input/output estimate
  codeComplexity: number;       // Cyclomatic complexity
  reasoningDepth: number;       // Chain-of-thought needs
  domainSpecificity: number;    // Specialized knowledge
  securitySensitivity: number;  // Security-related content
}
```

**Budget Enforcement:**
```typescript
interface BudgetConfig {
  dailyLimit: number;           // Max spend per day
  taskLimit: number;            // Max spend per task
  warningThreshold: number;     // Alert at % of limit
  fallbackOnExhaust: boolean;   // Use cheaper model when exhausted
}
```

### QUIC Swarm Integration

**Topology Selection for AQE:**
- `hierarchical`: Queen-led coordination (default for AQE)
- `mesh`: Peer-to-peer for distributed testing
- `ring`: Pipeline processing (test generation → execution → analysis)

**Port Configuration:**
```typescript
interface QuicSwarmConfig {
  transport: 'quic' | 'http2' | 'auto';
  quicPort: number;              // Default: 4433
  enableFallback: boolean;       // Fallback to HTTP/2
  maxAgents: number;             // Per topology limits
}
```

---

## Implementation Plan

### Phase 1: Foundation (Week 1)
**Goal:** Establish integration infrastructure

| Action | Owner | Agents | Parallel |
|--------|-------|--------|----------|
| Add agentic-flow dependency | DevOps | - | - |
| Create adapter interfaces | Architect | - | - |
| Baseline performance benchmarks | QE Lead | qe-performance-tester | - |
| Create ADR-051 spec files | Architecture | - | - |

### Phase 2: Agent Booster (Week 2)
**Goal:** 352x faster mechanical transforms

| Action | Owner | Agents | Parallel |
|--------|-------|--------|----------|
| Create AgentBoosterAdapter | Coder | coder, tester | Yes |
| Build transform pattern library | QE Lead | qe-test-architect | Yes |
| Integrate with qe-test-refactorer | Coder | coder, reviewer | Yes |
| Add MCP tool: `booster_transform` | Coder | coder | - |
| Validate 352x performance claim | QE Lead | qe-performance-tester | - |

### Phase 3: ReasoningBank (Week 3)
**Goal:** Cross-session learning

| Action | Owner | Agents | Parallel |
|--------|-------|--------|----------|
| Create ReasoningBankAdapter | Coder | coder, tester | Yes |
| Implement AgentDB backend bridge | Coder | coder | - |
| Integrate with qe-learning-coordinator | QE Lead | qe-learning-coordinator | Yes |
| Enable cross-agent knowledge sharing | Architect | architect | - |
| Implement pattern quality gates | QE Lead | qe-quality-gate | - |

### Phase 4: Multi-Model Router (Week 4)
**Goal:** 87% cost reduction

| Action | Owner | Agents | Parallel |
|--------|-------|--------|----------|
| Create ComplexityAnalyzer | Coder | coder, tester | Yes |
| Implement BudgetEnforcer | Coder | coder | Yes |
| Enhance ADR-026 tier system | Architect | architect | - |
| Configure provider failover | DevOps | - | - |
| Add cost tracking MCP tools | Coder | coder | - |

### Phase 5: ONNX + QUIC (Weeks 5-6) - Conditional
**Goal:** Local embeddings + fast coordination

| Action | Owner | Agents | Parallel |
|--------|-------|--------|----------|
| ONNX feasibility assessment | Architect | researcher | - |
| Create ONNXEmbeddingAdapter | Coder | coder, tester | Yes |
| QUIC container environment test | DevOps | - | - |
| Create QuicSwarmAdapter | Coder | coder | Conditional |
| Benchmark coordination latency | QE Lead | qe-performance-tester | - |

---

## Parallel Swarm Execution Strategy

### Conflict Avoidance

**Shared Memory Namespaces:**
```
aqe/agentic-flow/
├── booster/          - Agent Booster patterns (Phase 2)
├── reasoning/        - ReasoningBank data (Phase 3)
├── routing/          - Model routing decisions (Phase 4)
├── embeddings/       - ONNX cache (Phase 5)
└── coordination/     - QUIC swarm state (Phase 5)
```

**File Ownership:**
| Phase | Files Modified | Lock Strategy |
|-------|---------------|---------------|
| Phase 2 | `src/adapters/agent-booster/*` | Exclusive |
| Phase 3 | `src/adapters/reasoning-bank/*` | Exclusive |
| Phase 4 | `src/adapters/model-router/*` | Exclusive |
| Phase 5a | `src/adapters/onnx/*` | Exclusive |
| Phase 5b | `src/adapters/quic-swarm/*` | Exclusive |

### Swarm Topology

```
                    ┌─────────────────┐
                    │  Queen (ADR-051)│
                    │  Coordinator    │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ Phase 2 Swarm │   │ Phase 3 Swarm │   │ Phase 4 Swarm │
│ (Booster)     │   │ (Reasoning)   │   │ (Router)      │
├───────────────┤   ├───────────────┤   ├───────────────┤
│ - coder       │   │ - coder       │   │ - coder       │
│ - tester      │   │ - tester      │   │ - tester      │
│ - reviewer    │   │ - architect   │   │ - architect   │
└───────────────┘   └───────────────┘   └───────────────┘
```

### Knowledge Sharing Protocol

```typescript
// After each phase completion, share learnings
await mcp__agentic-qe__memory_share({
  sourceAgentId: 'phase-N-lead',
  targetAgentIds: ['queen-coordinator', 'all-phase-agents'],
  knowledgeDomain: 'agentic-flow-integration'
});

// Store integration patterns
await mcp__claude-flow__memory_store({
  key: 'adr-051-phase-N-patterns',
  value: { patterns, lessons, blockers },
  namespace: 'integration-learnings'
});
```

---

## Success Metrics

| Metric | Current | Target | Verification |
|--------|---------|--------|--------------|
| Mechanical edit latency | 352ms | <5ms | Benchmark suite |
| Cross-session pattern hits | 0% | 50% | Learning metrics |
| LLM cost per test cycle | $0.03 | $0.01 | Cost tracking |
| Model routing accuracy | Manual | >90% | A/B testing |
| Agent coordination latency | 200ms | <50ms | Latency benchmarks |
| Pattern retention rate | 0% | 100% | Session tests |

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Dependency explosion | High | High | Selective integration, tree-shaking |
| Pattern quality degradation | High | Medium | Quality gates, confidence thresholds |
| QUIC port restrictions | Medium | Medium | Feasibility study first, HTTP/2 fallback |
| Version conflicts | Medium | Medium | Pin versions, integration tests |
| Over-engineering | Medium | Low | Phased rollout, validate each phase |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| ANALYSIS | Six Hats Integration Analysis | Analysis | [docs/reports/agentic-flow-integration-analysis.md](/workspaces/agentic-qe/docs/reports/agentic-flow-integration-analysis.md) |
| AF-BOOSTER | Agent Booster Documentation | External | [github.com/ruvnet/agentic-flow/.../AGENT-BOOSTER.md](https://github.com/ruvnet/agentic-flow/blob/main/docs/guides/AGENT-BOOSTER.md) |
| AF-REASONING | ReasoningBank Documentation | External | [github.com/ruvnet/agentic-flow/.../REASONINGBANK.md](https://github.com/ruvnet/agentic-flow/blob/main/docs/guides/REASONINGBANK.md) |
| AF-ROUTER | Multi-Model Router Documentation | External | [github.com/ruvnet/agentic-flow/.../MULTI-MODEL-ROUTER.md](https://github.com/ruvnet/agentic-flow/blob/main/docs/guides/MULTI-MODEL-ROUTER.md) |
| AF-QUIC | QUIC Swarm Quickstart | External | [github.com/ruvnet/agentic-flow/.../QUIC-SWARM-QUICKSTART.md](https://github.com/ruvnet/agentic-flow/blob/main/docs/guides/QUIC-SWARM-QUICKSTART.md) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-01-20 | Accepted | 2026-01-27 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-01-20 | Created from Six Thinking Hats analysis |
| Accepted | 2026-01-20 | Architecture review approved |
| In Progress | - | Pending Phase 1 kickoff |
