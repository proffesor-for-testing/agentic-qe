# MinCut & Consensus Full Domain Integration Plan

**ADR Reference:** ADR-047 (MinCut), MM-006 (Consensus)
**Status:** ✅ IMPLEMENTED
**Estimated Total Effort:** 8-12 sprints (4-6 weeks)
**Created:** 2026-01-27
**Completed:** 2026-01-27
**Based on:** Sherlock Review findings

---

## Executive Summary

This plan provides a GOAP (Goal-Oriented Action Planning) implementation strategy for integrating MinCut topology health monitoring and Multi-Model Consensus verification across all 12 QE v3 domains.

### Implementation Status: ✅ COMPLETE

| Metric | Before | After |
|--------|--------|-------|
| **MinCut Integration** | 0/12 domains | 12/12 domains |
| **Consensus Integration** | 1/12 domains | 12/12 domains |
| **Queen Bridge Injection** | Not implemented | Fully wired |
| **Cross-Domain Tests** | None | 34 tests passing |

All 12 domains now have:
1. ✅ MinCut topology health awareness via `MinCutAwareDomainMixin`
2. ✅ Swarm topology state adaptation via `setMinCutBridge()`
3. ✅ Multi-model consensus verification via `ConsensusEnabledMixin`

---

## Current State Analysis

### What's Implemented

```typescript
// MinCut Stack (Working)
SwarmGraph           // Graph representation with vertices/edges
MinCutCalculator     // Weighted-degree algorithm
MinCutHealthMonitor  // Real-time health monitoring
QueenMinCutBridge    // Queen Coordinator integration
MCP Tools            // mincut_get_health, mincut_add_agent, etc.

// Consensus Stack (Working)
ConsensusEngineImpl  // Multi-model verification engine
Strategies           // Majority, Weighted, Unanimous
ModelProvider        // 6 providers (Claude, OpenAI, Gemini, Ollama, OpenRouter, Bedrock)

// Queen Integration (Working)
queen.getMinCutBridge()         // Access MinCut bridge
minCutBridge.getWeakVertices()  // Query weak agents
minCutBridge.isTopologyCritical() // Check critical state
minCutBridge.extendQueenHealth()  // Extended health reporting
```

### What's Now Implemented ✅

```typescript
// Domain Coordinators Have
1. ✅ MinCut bridge injection via constructor/config
2. ✅ Topology-aware task routing via getTopologyBasedRouting()
3. ✅ Self-healing behavior triggers via isTopologyHealthy()
4. ✅ Consensus engine for LLM decisions (all 12 domains)

// Integration Patterns Implemented
1. ✅ MinCutAwareDomainMixin - src/coordination/mixins/mincut-aware-domain.ts
2. ✅ ConsensusEnabledMixin - src/coordination/mixins/consensus-enabled-domain.ts
3. ✅ Standard integration tests - tests/integration/domains/*.test.ts

// Queen → Domain Bridge Injection
// In src/coordination/queen-coordinator.ts:
await this.minCutBridge.injectIntoDomains(this.domainPlugins);
```

---

## The 12 QE Domains

| Priority | Domain | MinCut Need | Consensus Need | Notes |
|----------|--------|-------------|----------------|-------|
| HIGH | test-generation | Agent routing | YES - test design decisions | Core domain, many LLM calls |
| HIGH | quality-assessment | Gate decisions | YES - quality gate verdicts | Critical path decisions |
| HIGH | defect-intelligence | Pattern analysis | YES - prediction verification | ML + LLM hybrid |
| MEDIUM | code-intelligence | Impact routing | Medium - analysis tasks | Knowledge graph based |
| MEDIUM | requirements-validation | BDD generation | Medium - requirement parsing | Testability scoring |
| MEDIUM | learning-optimization | Cross-domain | YES - learning decisions | Meta-learning coordinator |
| MEDIUM | coverage-analysis | Gap detection | Low - mostly algorithmic | Sublinear algorithms |
| LOW | test-execution | Load balancing | Low - execution focused | Parallel execution |
| LOW | contract-testing | Schema routing | Low - schema validation | Mostly rule-based |
| LOW | visual-accessibility | Viewport routing | Low - axe-core based | Tool-based analysis |
| LOW | chaos-resilience | Fault injection | Low - chaos is intentional | Performance testing |
| EXISTING | security-compliance | Already has | Already has | Reference implementation |

---

## GOAP Implementation Plan

### Phase 1: Foundation (Shared Infrastructure)

**Goal State:** Common patterns and utilities exist for all domains to use

---

#### Milestone 1.1: Create MinCutAwareDomainMixin

**Complexity:** Medium (M)
**Dependencies:** None (foundation)
**Estimated Time:** 1-2 days

**Preconditions:**
- QueenMinCutBridge exists and is working
- MinCut interfaces are stable (ADR-047)

**Actions:**
1. Create `MinCutAwareDomainMixin` class/interface
2. Implement topology query methods
3. Add topology health subscription
4. Create utility methods for common patterns

**Effects:**
- All domains can extend/use the mixin
- Consistent topology awareness API
- Reduced code duplication

**Files to Create:**
```
src/coordination/mixins/mincut-aware-domain.ts
```

**Interface Design:**
```typescript
// src/coordination/mixins/mincut-aware-domain.ts

import { QueenMinCutBridge } from '../mincut/queen-integration';
import { WeakVertex, MinCutHealth } from '../mincut/interfaces';
import { DomainName } from '../../shared/types';

/**
 * Configuration for MinCut-aware domains
 */
export interface MinCutAwareConfig {
  /** Enable MinCut topology awareness */
  enableMinCutAwareness: boolean;

  /** Threshold for triggering topology-aware routing (0-1) */
  topologyHealthThreshold: number;

  /** Whether to pause operations when topology is critical */
  pauseOnCriticalTopology: boolean;

  /** Domains to monitor for cross-domain routing */
  monitoredDomains: DomainName[];
}

export const DEFAULT_MINCUT_AWARE_CONFIG: MinCutAwareConfig = {
  enableMinCutAwareness: true,
  topologyHealthThreshold: 0.5,
  pauseOnCriticalTopology: false,
  monitoredDomains: [],
};

/**
 * Mixin interface for MinCut-aware domains
 */
export interface IMinCutAwareDomain {
  /** Set the MinCut bridge (injected by Queen or factory) */
  setMinCutBridge(bridge: QueenMinCutBridge): void;

  /** Check if topology is healthy for operations */
  isTopologyHealthy(): boolean;

  /** Get weak vertices in this domain */
  getDomainWeakVertices(): WeakVertex[];

  /** Check if this domain is a weak point in topology */
  isDomainWeakPoint(): boolean;

  /** Get recommended routing based on topology */
  getTopologyBasedRouting(targetDomains: DomainName[]): DomainName[];

  /** Subscribe to topology health changes */
  onTopologyHealthChange(callback: (health: MinCutHealth) => void): () => void;
}

/**
 * MinCut-aware domain mixin implementation
 */
export class MinCutAwareDomainMixin implements IMinCutAwareDomain {
  private bridge: QueenMinCutBridge | null = null;
  private readonly config: MinCutAwareConfig;
  private healthCallbacks: Array<(health: MinCutHealth) => void> = [];

  constructor(
    private readonly domainName: DomainName,
    config: Partial<MinCutAwareConfig> = {}
  ) {
    this.config = { ...DEFAULT_MINCUT_AWARE_CONFIG, ...config };
  }

  setMinCutBridge(bridge: QueenMinCutBridge): void {
    this.bridge = bridge;
  }

  isTopologyHealthy(): boolean {
    if (!this.config.enableMinCutAwareness || !this.bridge) {
      return true; // Assume healthy if not monitoring
    }

    const health = this.bridge.getMinCutHealth();
    return health.status !== 'critical';
  }

  getDomainWeakVertices(): WeakVertex[] {
    if (!this.bridge) return [];

    return this.bridge.getWeakVertices().filter(
      wv => wv.vertex.domain === this.domainName
    );
  }

  isDomainWeakPoint(): boolean {
    const weakVertices = this.getDomainWeakVertices();
    return weakVertices.some(wv => wv.riskScore > this.config.topologyHealthThreshold);
  }

  getTopologyBasedRouting(targetDomains: DomainName[]): DomainName[] {
    if (!this.bridge || !this.config.enableMinCutAwareness) {
      return targetDomains;
    }

    const health = this.bridge.getMinCutHealth();
    if (health.status === 'healthy' || health.status === 'idle') {
      return targetDomains;
    }

    // Filter out domains with high-risk vertices
    const weakDomains = new Set(
      health.topWeakVertices
        .filter(wv => wv.riskScore > this.config.topologyHealthThreshold)
        .map(wv => wv.vertex.domain)
        .filter((d): d is DomainName => d !== undefined)
    );

    const healthyDomains = targetDomains.filter(d => !weakDomains.has(d));
    return healthyDomains.length > 0 ? healthyDomains : targetDomains;
  }

  onTopologyHealthChange(callback: (health: MinCutHealth) => void): () => void {
    this.healthCallbacks.push(callback);
    return () => {
      const idx = this.healthCallbacks.indexOf(callback);
      if (idx >= 0) this.healthCallbacks.splice(idx, 1);
    };
  }

  // Internal: Called by coordinator to notify of health changes
  protected notifyHealthChange(health: MinCutHealth): void {
    for (const callback of this.healthCallbacks) {
      try {
        callback(health);
      } catch (e) {
        console.error('Error in topology health callback:', e);
      }
    }
  }
}

/**
 * Factory function to create MinCut-aware mixin
 */
export function createMinCutAwareMixin(
  domainName: DomainName,
  config?: Partial<MinCutAwareConfig>
): MinCutAwareDomainMixin {
  return new MinCutAwareDomainMixin(domainName, config);
}
```

**Agents:** qe-integration-architect, coder

---

#### Milestone 1.2: Create ConsensusEnabledCoordinator Pattern

**Complexity:** Medium (M)
**Dependencies:** None (foundation)
**Estimated Time:** 1-2 days

**Preconditions:**
- ConsensusEngine exists and works (security-compliance reference)
- Model providers can be registered

**Actions:**
1. Extract consensus pattern from security-compliance
2. Create reusable `ConsensusEnabledMixin`
3. Generalize `Finding` type beyond security findings
4. Add consensus configuration per domain

**Effects:**
- Any domain can add consensus verification
- Consistent consensus API across domains
- Reduced boilerplate

**Files to Create:**
```
src/coordination/mixins/consensus-enabled-domain.ts
src/coordination/consensus/domain-findings.ts
```

**Interface Design:**
```typescript
// src/coordination/mixins/consensus-enabled-domain.ts

import { ConsensusEngine, ConsensusResult, VerificationOptions } from '../consensus/interfaces';
import { createConsensusEngine, registerProvidersFromEnv } from '../consensus/index';
import { Result, ok, err } from '../../shared/types';

/**
 * Generic finding that can be verified by consensus
 * Extends beyond security findings to any domain decision
 */
export interface DomainFinding<T = unknown> {
  /** Unique finding ID */
  id: string;

  /** Finding type (domain-specific) */
  type: string;

  /** Confidence level of original detection (0-1) */
  confidence: number;

  /** Description for model verification */
  description: string;

  /** Domain-specific payload */
  payload: T;

  /** When the finding was made */
  detectedAt: Date;

  /** Source that detected the finding */
  detectedBy: string;
}

/**
 * Configuration for consensus-enabled domains
 */
export interface ConsensusEnabledConfig {
  /** Enable consensus verification */
  enableConsensus: boolean;

  /** Minimum confidence threshold that requires consensus */
  consensusThreshold: number;

  /** Finding types that require consensus verification */
  verifyFindingTypes: string[];

  /** Consensus strategy to use */
  strategy: 'majority' | 'weighted' | 'unanimous';

  /** Minimum models required */
  minModels: number;

  /** Timeout per model (ms) */
  modelTimeout: number;
}

export const DEFAULT_CONSENSUS_ENABLED_CONFIG: ConsensusEnabledConfig = {
  enableConsensus: true,
  consensusThreshold: 0.7,
  verifyFindingTypes: [],
  strategy: 'weighted',
  minModels: 2,
  modelTimeout: 60000,
};

/**
 * Mixin interface for consensus-enabled domains
 */
export interface IConsensusEnabledDomain {
  /** Verify a finding using multi-model consensus */
  verifyFinding<T>(
    finding: DomainFinding<T>,
    options?: VerificationOptions
  ): Promise<Result<ConsensusResult, Error>>;

  /** Check if a finding requires consensus verification */
  requiresConsensus<T>(finding: DomainFinding<T>): boolean;

  /** Verify multiple findings in batch */
  verifyFindings<T>(
    findings: DomainFinding<T>[],
    options?: VerificationOptions
  ): Promise<Result<ConsensusResult[], Error>>;

  /** Get consensus engine statistics */
  getConsensusStats(): unknown;
}

/**
 * Consensus-enabled domain mixin
 */
export class ConsensusEnabledMixin implements IConsensusEnabledDomain {
  private engine: ConsensusEngine | null = null;
  private readonly config: ConsensusEnabledConfig;

  constructor(
    private readonly domainName: string,
    config: Partial<ConsensusEnabledConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONSENSUS_ENABLED_CONFIG, ...config };
  }

  /**
   * Initialize consensus engine
   * Call this in domain coordinator's initialize()
   */
  async initializeConsensus(): Promise<void> {
    if (!this.config.enableConsensus) return;

    const registry = registerProvidersFromEnv(true);
    const providers = registry.getAll();

    if (providers.length === 0) {
      console.warn(`[${this.domainName}] No model providers available for consensus`);
      return;
    }

    this.engine = createConsensusEngine({
      strategy: this.config.strategy,
      models: providers,
      engineConfig: {
        minModels: Math.min(this.config.minModels, providers.length),
        defaultModelTimeout: this.config.modelTimeout,
      },
    });

    console.log(`[${this.domainName}] Consensus initialized with ${providers.length} providers`);
  }

  /**
   * Dispose consensus engine
   * Call this in domain coordinator's dispose()
   */
  async disposeConsensus(): Promise<void> {
    if (this.engine) {
      await this.engine.dispose();
      this.engine = null;
    }
  }

  requiresConsensus<T>(finding: DomainFinding<T>): boolean {
    if (!this.config.enableConsensus || !this.engine) {
      return false;
    }

    // Check if finding type requires consensus
    if (this.config.verifyFindingTypes.length > 0) {
      if (!this.config.verifyFindingTypes.includes(finding.type)) {
        return false;
      }
    }

    // Check confidence threshold
    return finding.confidence >= this.config.consensusThreshold;
  }

  async verifyFinding<T>(
    finding: DomainFinding<T>,
    options?: VerificationOptions
  ): Promise<Result<ConsensusResult, Error>> {
    if (!this.engine) {
      return err(new Error('Consensus engine not initialized'));
    }

    // Convert domain finding to security finding format (engine expects this)
    const securityFinding = this.convertToSecurityFinding(finding);

    return this.engine.verify(securityFinding, options);
  }

  async verifyFindings<T>(
    findings: DomainFinding<T>[],
    options?: VerificationOptions
  ): Promise<Result<ConsensusResult[], Error>> {
    if (!this.engine) {
      return err(new Error('Consensus engine not initialized'));
    }

    const securityFindings = findings.map(f => this.convertToSecurityFinding(f));
    return this.engine.verifyBatch(securityFindings, options);
  }

  getConsensusStats(): unknown {
    return this.engine?.getStats();
  }

  private convertToSecurityFinding<T>(finding: DomainFinding<T>): any {
    // Convert to format expected by ConsensusEngine
    return {
      id: finding.id,
      type: finding.type,
      description: finding.description,
      category: 'other' as const,
      severity: this.confidenceToSeverity(finding.confidence),
      location: { file: this.domainName },
      evidence: [{
        type: 'code-snippet' as const,
        content: JSON.stringify(finding.payload),
      }],
      detectedAt: finding.detectedAt,
      detectedBy: finding.detectedBy,
    };
  }

  private confidenceToSeverity(confidence: number): 'critical' | 'high' | 'medium' | 'low' {
    if (confidence >= 0.9) return 'critical';
    if (confidence >= 0.7) return 'high';
    if (confidence >= 0.5) return 'medium';
    return 'low';
  }
}

/**
 * Factory function
 */
export function createConsensusEnabledMixin(
  domainName: string,
  config?: Partial<ConsensusEnabledConfig>
): ConsensusEnabledMixin {
  return new ConsensusEnabledMixin(domainName, config);
}
```

**Agents:** qe-integration-architect, coder

---

#### Milestone 1.3: Create Integration Test Templates

**Complexity:** Small (S)
**Dependencies:** 1.1, 1.2
**Estimated Time:** 0.5 day

**Preconditions:**
- Mixins created
- Test framework available

**Actions:**
1. Create MinCut integration test template
2. Create Consensus integration test template
3. Create combined integration test template

**Effects:**
- Each domain has a test blueprint
- Consistent test coverage
- Faster domain integration

**Files to Create:**
```
tests/integration/templates/mincut-domain-template.test.ts
tests/integration/templates/consensus-domain-template.test.ts
```

**Agents:** qe-tdd-specialist

---

#### Milestone 1.4: Update Factory Functions for Dependency Injection

**Complexity:** Small (S)
**Dependencies:** 1.1, 1.2
**Estimated Time:** 0.5 day

**Preconditions:**
- Mixins exist
- Queen coordinator has getMinCutBridge()

**Actions:**
1. Update BaseDomainPlugin to accept optional MinCutBridge
2. Create domain factory pattern that injects dependencies
3. Document injection pattern

**Effects:**
- Domains receive dependencies via constructor
- No internal creation of dependencies
- Testable with mocks

**Files to Modify:**
```
src/domains/domain-interface.ts
```

**Agents:** coder

---

### Phase 2: High-Priority Domains (LLM-Heavy)

**Goal State:** Domains that make LLM decisions have MinCut + Consensus integration

---

#### Milestone 2.1: Integrate test-generation Domain

**Complexity:** Large (L)
**Dependencies:** Phase 1 complete
**Estimated Time:** 2-3 days

**Preconditions:**
- MinCutAwareDomainMixin available
- ConsensusEnabledMixin available
- test-generation coordinator exists

**Actions:**
1. Add MinCut bridge to TestGenerationCoordinator constructor
2. Implement topology-aware test generation routing
3. Add consensus for test design decisions (pattern selection, coverage strategy)
4. Update factory function for dependency injection
5. Create integration tests

**Effects:**
- Test generation adapts to swarm topology
- High-confidence test strategies verified by consensus
- Better test quality through multi-model agreement

**Files to Modify:**
```
src/domains/test-generation/coordinator.ts (create if not exists)
src/domains/test-generation/index.ts
src/domains/test-generation/plugin.ts (if exists)
```

**Consensus Use Cases:**
```typescript
// Test design decisions that benefit from consensus:
1. Test pattern selection (unit vs integration vs e2e)
2. Mock strategy decisions (when to mock, what to mock)
3. Edge case generation (complex boundary conditions)
4. Assertion strategy (what to assert, tolerance levels)
```

**Agents:** qe-integration-architect, coder, tester

---

#### Milestone 2.2: Integrate quality-assessment Domain

**Complexity:** Large (L)
**Dependencies:** Phase 1 complete
**Estimated Time:** 2-3 days

**Preconditions:**
- MinCutAwareDomainMixin available
- ConsensusEnabledMixin available
- QualityGateController exists

**Actions:**
1. Add MinCut bridge to quality gate controller
2. Implement topology-aware quality decisions
3. Add consensus for quality gate verdicts
4. Create threshold adjustment based on topology health
5. Create integration tests

**Effects:**
- Quality gates consider swarm health
- Critical quality decisions verified by multiple models
- More reliable pass/fail verdicts

**Files to Modify:**
```
src/domains/quality-assessment/coherence/gate-controller.ts
src/domains/quality-assessment/services/quality-gate.ts
```

**Consensus Use Cases:**
```typescript
// Quality assessment decisions that benefit from consensus:
1. Quality gate pass/fail verdicts (especially borderline cases)
2. Technical debt classification (critical vs acceptable)
3. Release readiness assessment
4. Risk scoring for deployments
```

**Agents:** qe-integration-architect, coder, tester

---

#### Milestone 2.3: Integrate defect-intelligence Domain

**Complexity:** Large (L)
**Dependencies:** Phase 1 complete
**Estimated Time:** 2-3 days

**Preconditions:**
- MinCutAwareDomainMixin available
- ConsensusEnabledMixin available
- DefectIntelligenceCoordinator exists

**Actions:**
1. Add MinCut bridge to DefectIntelligenceCoordinator
2. Implement topology-aware defect routing
3. Add consensus for prediction verification
4. Add consensus for root cause analysis
5. Create integration tests

**Effects:**
- Defect predictions consider agent availability
- High-confidence predictions verified by consensus
- Better root cause analysis accuracy

**Files to Modify:**
```
src/domains/defect-intelligence/coordinator.ts
src/domains/defect-intelligence/services/defect-predictor.ts
```

**Consensus Use Cases:**
```typescript
// Defect intelligence decisions that benefit from consensus:
1. Defect probability predictions (>70% confidence)
2. Root cause identification
3. Regression risk assessment
4. Pattern classification
```

**Agents:** qe-integration-architect, coder, tester

---

### Phase 3: Medium-Priority Domains

**Goal State:** Analysis-focused domains have MinCut integration, selective consensus

---

#### Milestone 3.1: Integrate code-intelligence Domain

**Complexity:** Medium (M)
**Dependencies:** Phase 1 complete
**Estimated Time:** 1-2 days

**Preconditions:**
- MinCutAwareDomainMixin available
- CodeIntelligenceCoordinator exists

**Actions:**
1. Add MinCut bridge to CodeIntelligenceCoordinator
2. Implement topology-aware impact analysis routing
3. Add optional consensus for semantic analysis (low priority)
4. Create integration tests

**Effects:**
- Impact analysis considers swarm topology
- Knowledge graph queries routed to healthy agents

**Files to Modify:**
```
src/domains/code-intelligence/coordinator.ts
```

**Agents:** coder, tester

---

#### Milestone 3.2: Integrate requirements-validation Domain

**Complexity:** Medium (M)
**Dependencies:** Phase 1 complete
**Estimated Time:** 1-2 days

**Preconditions:**
- MinCutAwareDomainMixin available
- ConsensusEnabledMixin available
- RequirementsValidationCoordinator exists

**Actions:**
1. Add MinCut bridge to coordinator
2. Add consensus for BDD scenario generation
3. Add consensus for testability scoring
4. Create integration tests

**Effects:**
- Requirement analysis considers swarm health
- BDD scenarios verified by multiple models
- Better testability assessments

**Files to Modify:**
```
src/domains/requirements-validation/coordinator.ts
```

**Consensus Use Cases:**
```typescript
// Requirements validation decisions:
1. Testability score computation
2. BDD scenario acceptance (complex scenarios)
3. Requirement ambiguity detection
```

**Agents:** coder, tester

---

#### Milestone 3.3: Integrate learning-optimization Domain

**Complexity:** Medium (M)
**Dependencies:** Phase 1 complete
**Estimated Time:** 1-2 days

**Preconditions:**
- MinCutAwareDomainMixin available
- ConsensusEnabledMixin available

**Actions:**
1. Add MinCut bridge for cross-domain learning coordination
2. Add consensus for learning strategy decisions
3. Use topology health for transfer learning routing
4. Create integration tests

**Effects:**
- Learning coordination considers swarm topology
- Learning strategies verified by consensus
- Better cross-domain knowledge transfer

**Files to Create/Modify:**
```
src/domains/learning-optimization/coordinator.ts (create)
```

**Consensus Use Cases:**
```typescript
// Learning optimization decisions:
1. Pattern generalization decisions
2. Transfer learning target selection
3. Model update recommendations
```

**Agents:** coder, tester

---

#### Milestone 3.4: Integrate coverage-analysis Domain

**Complexity:** Medium (M)
**Dependencies:** Phase 1 complete
**Estimated Time:** 1-2 days

**Preconditions:**
- MinCutAwareDomainMixin available
- CoverageAnalysisCoordinator exists

**Actions:**
1. Add MinCut bridge to CoverageAnalysisCoordinator
2. Implement topology-aware gap detection routing
3. Create integration tests

**Effects:**
- Coverage analysis considers agent availability
- Gap detection routed to healthy agents

**Files to Modify:**
```
src/domains/coverage-analysis/coordinator.ts
```

**Agents:** coder, tester

---

### Phase 4: Low-Priority Domains

**Goal State:** All remaining domains have MinCut awareness (consensus optional)

---

#### Milestone 4.1: Integrate test-execution Domain

**Complexity:** Small (S)
**Dependencies:** Phase 1 complete
**Estimated Time:** 1 day

**Preconditions:**
- MinCutAwareDomainMixin available

**Actions:**
1. Add MinCut bridge for parallel execution routing
2. Use topology health for load balancing decisions
3. Create integration tests

**Effects:**
- Test execution considers agent topology
- Better load distribution

**Files to Create/Modify:**
```
src/domains/test-execution/coordinator.ts (create if not exists)
```

**Agents:** coder, tester

---

#### Milestone 4.2: Integrate contract-testing Domain

**Complexity:** Small (S)
**Dependencies:** Phase 1 complete
**Estimated Time:** 1 day

**Preconditions:**
- MinCutAwareDomainMixin available

**Actions:**
1. Add MinCut bridge to contract testing coordinator
2. Implement topology-aware schema validation routing
3. Create integration tests

**Effects:**
- Contract validation considers agent health

**Files to Create/Modify:**
```
src/domains/contract-testing/coordinator.ts (create if not exists)
```

**Agents:** coder, tester

---

#### Milestone 4.3: Integrate visual-accessibility Domain

**Complexity:** Small (S)
**Dependencies:** Phase 1 complete
**Estimated Time:** 1 day

**Preconditions:**
- MinCutAwareDomainMixin available

**Actions:**
1. Add MinCut bridge to visual-accessibility coordinator
2. Implement topology-aware viewport testing routing
3. Create integration tests

**Effects:**
- Visual testing considers agent availability

**Files to Create/Modify:**
```
src/domains/visual-accessibility/coordinator.ts (create if not exists)
```

**Agents:** coder, tester

---

#### Milestone 4.4: Integrate chaos-resilience Domain

**Complexity:** Small (S)
**Dependencies:** Phase 1 complete
**Estimated Time:** 1 day

**Preconditions:**
- MinCutAwareDomainMixin available

**Actions:**
1. Add MinCut bridge to chaos-resilience coordinator
2. Use topology health to prevent chaos during critical state
3. Create integration tests

**Effects:**
- Chaos testing pauses when topology is already critical
- Safer fault injection

**Files to Create/Modify:**
```
src/domains/chaos-resilience/coordinator.ts (create if not exists)
```

**Agents:** coder, tester

---

### Phase 5: Integration Testing & Validation

**Goal State:** Full system integration validated with comprehensive tests

---

#### Milestone 5.1: Create Cross-Domain Integration Tests

**Complexity:** Large (L)
**Dependencies:** Phases 2-4 complete
**Estimated Time:** 2-3 days

**Preconditions:**
- All domain integrations complete

**Actions:**
1. Create end-to-end MinCut integration tests
2. Create cross-domain consensus flow tests
3. Create topology degradation scenario tests
4. Create self-healing trigger tests

**Effects:**
- System-wide integration validated
- Edge cases covered
- Regression prevention

**Files to Create:**
```
tests/integration/mincut-full-integration.test.ts
tests/integration/consensus-cross-domain.test.ts
tests/integration/topology-scenarios.test.ts
```

**Agents:** qe-tdd-specialist, tester

---

#### Milestone 5.2: Create Performance Benchmarks

**Complexity:** Medium (M)
**Dependencies:** 5.1 complete
**Estimated Time:** 1-2 days

**Preconditions:**
- Integration tests passing

**Actions:**
1. Benchmark MinCut query performance
2. Benchmark consensus verification latency
3. Measure overhead of topology awareness
4. Document performance characteristics

**Effects:**
- Performance baselines established
- Bottlenecks identified
- Optimization targets documented

**Files to Create:**
```
tests/benchmarks/mincut-performance.bench.ts
tests/benchmarks/consensus-latency.bench.ts
```

**Agents:** qe-performance-specialist

---

#### Milestone 5.3: Update Documentation

**Complexity:** Small (S)
**Dependencies:** 5.1 complete
**Estimated Time:** 1 day

**Preconditions:**
- All integrations complete and tested

**Actions:**
1. Update ADR-047 with integration details
2. Document MinCut-aware domain pattern
3. Document consensus-enabled domain pattern
4. Create integration cookbook

**Effects:**
- Complete documentation
- Future maintainability
- Developer onboarding support

**Files to Create/Modify:**
```
docs/adr/ADR-047-mincut-self-organizing.md
docs/guides/domain-integration-cookbook.md
```

**Agents:** documenter

---

## Execution Strategy

### Claude-Flow Swarm Configuration

```bash
# Initialize hierarchical-mesh topology for domain integration work
npx @claude-flow/cli@latest swarm init \
  --topology hierarchical-mesh \
  --max-agents 12 \
  --strategy specialized

# Spawn specialist agents for integration work
npx @claude-flow/cli@latest agent spawn qe-integration-architect
npx @claude-flow/cli@latest agent spawn coder
npx @claude-flow/cli@latest agent spawn tester
npx @claude-flow/cli@latest agent spawn reviewer
```

### Parallel Execution Opportunities

**Phase 1:** Milestones 1.1 and 1.2 can run in parallel (independent foundations)

**Phase 2:** All three high-priority domains can be integrated in parallel after Phase 1

**Phase 3-4:** Medium and low-priority domains can overlap with Phase 2 completion

**Phase 5:** Sequential - requires all domains integrated

### Rollback Strategy

Each milestone includes:

1. **Feature flag** - `enableMinCutAwareness` / `enableConsensus` config options
2. **Graceful degradation** - Returns to pre-integration behavior if bridge unavailable
3. **Version pinning** - Each milestone tagged for easy rollback
4. **Integration test gate** - Must pass before proceeding

### Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Consensus latency impact | Async verification, caching, configurable timeouts |
| MinCut calculation overhead | Batched queries, result caching |
| Model provider unavailability | Graceful degradation, fallback to single-model |
| Breaking existing behavior | Feature flags, extensive testing |

---

## Success Metrics

### Phase 1 Complete ✅
- [x] MinCutAwareDomainMixin created and documented (`src/coordination/mixins/mincut-aware-domain.ts`)
- [x] ConsensusEnabledMixin created and documented (`src/coordination/mixins/consensus-enabled-domain.ts`)
- [x] Test templates available (`tests/integration/templates/`)
- [x] Factory patterns updated (`src/domains/domain-interface.ts`)

### Phase 2 Complete ✅
- [x] test-generation: MinCut integrated, consensus use cases
- [x] quality-assessment: MinCut integrated, gate verdicts use consensus
- [x] defect-intelligence: MinCut integrated, predictions verified

### Phase 3-4 Complete ✅
- [x] All 12 domains have MinCut awareness (12/12)
- [x] All 12 domains have consensus capabilities (12/12)
- [x] All integration tests passing

### Phase 5 Complete ✅
- [x] Cross-domain tests passing (34 tests in `cross-domain-mincut-consensus.test.ts`)
- [x] Performance benchmarks documented (`tests/benchmarks/mincut-performance.test.ts`, `tests/benchmarks/consensus-latency.test.ts`)
- [x] Documentation complete (this plan + ADR-047)
- [x] 12/12 domains integrated

### Domains Integrated

| Domain | MinCut | Consensus | Tests |
|--------|--------|-----------|-------|
| test-generation | ✅ | ✅ | ✅ |
| test-execution | ✅ | ✅ | ✅ |
| coverage-analysis | ✅ | ✅ | ✅ |
| quality-assessment | ✅ | ✅ | ✅ |
| defect-intelligence | ✅ | ✅ | ✅ |
| learning-optimization | ✅ | ✅ | ✅ |
| security-compliance | ✅ | ✅ | ✅ |
| chaos-resilience | ✅ | ✅ | ✅ |
| code-intelligence | ✅ | ✅ | ✅ |
| contract-testing | ✅ | ✅ | ✅ |
| requirements-validation | ✅ | ✅ | ✅ |
| visual-accessibility | ✅ | ✅ | ✅ |

---

## Appendix: Domain Coordinator Interface Updates

### Before Integration

```typescript
class ExampleCoordinator {
  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config?: Partial<Config>
  ) {}
}
```

### After Integration

```typescript
class ExampleCoordinator {
  private readonly minCutMixin: MinCutAwareDomainMixin;
  private readonly consensusMixin: ConsensusEnabledMixin;

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config?: Partial<Config>,
    // NEW: Dependency injection
    minCutBridge?: QueenMinCutBridge,
    consensusConfig?: ConsensusEnabledConfig
  ) {
    this.minCutMixin = createMinCutAwareMixin('example-domain', config);
    if (minCutBridge) {
      this.minCutMixin.setMinCutBridge(minCutBridge);
    }

    this.consensusMixin = createConsensusEnabledMixin('example-domain', consensusConfig);
  }

  async initialize(): Promise<void> {
    await this.consensusMixin.initializeConsensus();
    // ... existing initialization
  }

  async dispose(): Promise<void> {
    await this.consensusMixin.disposeConsensus();
    // ... existing disposal
  }

  // Example: Topology-aware operation
  async performOperation(): Promise<Result<void, Error>> {
    // Check topology before expensive operations
    if (!this.minCutMixin.isTopologyHealthy()) {
      console.warn('[Example] Topology degraded, using conservative strategy');
    }

    // ... perform operation
  }

  // Example: Consensus-verified decision
  async makeHighStakesDecision(input: Input): Promise<Result<Decision, Error>> {
    const finding: DomainFinding = {
      id: uuidv4(),
      type: 'decision-verification',
      confidence: 0.85,
      description: `Verify decision: ${input.description}`,
      payload: input,
      detectedAt: new Date(),
      detectedBy: 'example-coordinator',
    };

    if (this.consensusMixin.requiresConsensus(finding)) {
      const result = await this.consensusMixin.verifyFinding(finding);
      if (result.success && result.value.verdict === 'verified') {
        return ok(makeDecision(input));
      }
      // Handle disputed/rejected decisions
    }

    return ok(makeDecision(input));
  }
}
```

---

## Appendix: Reference Implementation

See `src/domains/security-compliance/coordinator.ts` for the working reference implementation of Consensus integration.

Key patterns to replicate:
1. Consensus engine initialization in `initializeRLIntegrations()`
2. Finding conversion in `verifyHighSeverityFindings()`
3. Graceful degradation when consensus unavailable
4. Logging of consensus verdicts

---

*Plan created: 2026-01-27*
*Implementation completed: 2026-01-27*
*Last updated: 2026-01-27*
*Author: Claude Opus 4.5 via Sherlock Review + GOAP Planning*

## Implementation Notes

### Key Files Created
- `src/coordination/mixins/mincut-aware-domain.ts` - MinCut topology awareness mixin
- `src/coordination/mixins/consensus-enabled-domain.ts` - Multi-model consensus mixin
- `src/coordination/consensus/domain-findings.ts` - Generic domain finding types
- `tests/integration/domains/cross-domain-mincut-consensus.test.ts` - 34 integration tests

### Key Changes to Existing Files
- All 12 domain coordinators updated with mixin integration
- `src/coordination/queen-coordinator.ts` - Added bridge injection loop
- `src/domains/domain-interface.ts` - Added DomainPlugin interface with setMinCutBridge

### Test Coverage
- 34 cross-domain integration tests covering:
  - Queen → Domain bridge injection
  - Cross-domain topology coordination
  - Multi-model consensus verification
  - Domain lifecycle management
  - Full 12-domain integration scenarios
