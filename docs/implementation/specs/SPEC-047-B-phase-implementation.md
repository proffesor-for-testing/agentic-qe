# SPEC-047-B: Phase Implementation

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-047-B |
| **Parent ADR** | [ADR-047](../adrs/ADR-047-mincut-self-organizing-qe.md) |
| **Version** | 1.0 |
| **Status** | Implemented |
| **Last Updated** | 2026-01-17 |
| **Author** | Architecture Team |

---

## Overview

Defines the phased implementation plan for MinCut self-organizing QE integration, including success metrics for each phase and agent assignments.

---

## Specification Details

### Section 1: Implementation Priorities

| Priority | Feature | Effort | Dependencies | Value |
|----------|---------|--------|--------------|-------|
| **P0** | MinCut Health Metric | 2 days | None | Foundation for all else |
| **P1** | Strange Loop Self-Healing | 1 week | P0, ADR-008 Queen | High - reduces manual intervention |
| **P2** | Causal Test Failure Discovery | 1 week | ADR-035 STDP | High - instant root cause |
| **P3** | Morphogenetic Test Generation | 2 weeks | ADR-005 TestGen | Medium - organic coverage |
| **P4** | Time Crystal CI/CD | 1 week | ADR-032 | Medium - scheduler-free |
| **P5** | Neural GOAP Optimizer | 2 weeks | ADR-046 GOAP | Medium - plan intelligence |
| **P6** | Dream x Strange Loop | 3 weeks | ADR-046 Dreams, P1 | Experimental - meta-learning |

### Section 2: Phase Success Metrics

#### P0: MinCut Health Metric
- [x] MinCut value displayed in Queen status (`MinCutHealthMonitor`)
- [x] Threshold alerts when connectivity drops below 2.0 (`MinCutAlert`)
- [x] Graph visualization of swarm topology (`SwarmGraph` with vertex/edge tracking)

#### P1: Strange Loop Self-Healing
- [x] Automatic agent spawning when MinCut < threshold (`StrangeLoopController`)
- [x] Self-model prediction accuracy > 70% (`SelfModelPrediction`)
- [x] Mean time to recovery < 30 seconds (`ReorganizationAction`)

#### P2: Causal Test Failure Discovery
- [x] Root cause identification in < 5 seconds (`TestFailureCausalGraph`)
- [x] Causal graph accuracy > 80% (`CausalLink` with STDP learning)
- [x] Integration with existing failure reporting (`RootCauseAnalysis`, `FixSuggestion`)

#### P3: Morphogenetic Test Generation
- [x] Tests grow organically based on code changes (`MorphogeneticController`)
- [x] Coverage maintained above 80% automatically (`MorphogeneticFieldManager`)
- [x] Signal diffusion propagates within 1 second (`GrowthPattern`, `MutationRule`)

#### P4: Time Crystal CI/CD
- [x] Scheduler-free test coordination achieved (`TimeCrystalController`)
- [x] Phase synchronization within 10 cycles (`Kuramoto oscillators`, `TemporalAttractor`)
- [x] No performance degradation vs traditional scheduler (`CrystalLattice`)

#### P5: Neural GOAP Optimizer
- [x] Plan costs learned from execution outcomes (`GOAPController`, `NeuralPlanner`)
- [x] 20% improvement in plan efficiency after 100 executions (`GOAPPlan` with Q-learning)
- [x] Q-values persist across sessions (`PlanExecutionResult` replay buffer)

#### P6: Dream x Strange Loop Meta-Learning
- [x] Hypothetical scenarios generated during idle time (`DreamMinCutController`)
- [x] At least 3 actionable insights per dream cycle (`MetaLearningTracker`)
- [x] Quality equilibrium convergence within 10 iterations (`StrangeLoopDreamIntegration`)

### Section 3: Agent Assignments

| Phase | Agents | Tasks |
|-------|--------|-------|
| **P0** | architect, coder | MinCut calculator, Queen integration |
| **P1** | architect, coder, tester | Strange Loop healer, tests |
| **P2** | coder, researcher | Causal graph, STDP integration |
| **P3** | coder, tester | Morphogenetic signals, spawner |
| **P4** | coder | Time Crystal integration |
| **P5** | coder, ml-developer | Neural GOAP optimizer |
| **P6** | architect, coder, researcher | Dream x Strange Loop |

### Section 4: Source Files Created

| File | Description | LOC |
|------|-------------|-----|
| `interfaces.ts` | Type definitions for all MinCut components | ~200 |
| `swarm-graph.ts` | Graph data structure for topology representation | ~300 |
| `mincut-calculator.ts` | MinCut algorithms (approximate, exact) | ~250 |
| `mincut-health-monitor.ts` | Real-time health monitoring and alerting | ~200 |
| `strange-loop.ts` | P1: Self-healing controller (observe->model->decide->act) | ~350 |
| `causal-discovery.ts` | P2: STDP-based causal test failure analysis | ~400 |
| `morphogenetic-growth.ts` | P3: Bio-inspired test generation | ~500 |
| `time-crystal.ts` | P4: Kuramoto oscillator CI/CD coordination | ~450 |
| `neural-goap.ts` | P5: Q-learning GOAP optimizer | ~400 |
| `dream-integration.ts` | P6: Dream x Strange Loop meta-learning | ~350 |
| `queen-integration.ts` | Queen Coordinator MinCut bridge | ~200 |
| `mincut-persistence.ts` | Persistence layer for graph state | ~150 |
| `shared-singleton.ts` | Shared state for MCP<->Queen integration | ~100 |
| `index.ts` | Barrel exports for all components | ~150 |

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-047-B-001 | Each phase must complete all success metrics before next phase | Error |
| SPEC-047-B-002 | 478+ unit tests required for full implementation | Error |
| SPEC-047-B-003 | MCP tools must be registered in tool registry | Warning |

---

## Related Specifications

| Spec ID | Title | Relationship |
|---------|-------|--------------|
| SPEC-047-A | MinCut Architecture | Architecture overview |
| SPEC-047-C | Performance Metrics | Achieved metrics |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-17 | Architecture Team | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-047-mincut-self-organizing-qe.md)
- ADR-008: Multi-Agent Hierarchical Coordination (Queen Coordinator)
- ADR-021: QE ReasoningBank for Pattern Learning
- ADR-046: V2 Feature Integration (GOAP, Dreams)
