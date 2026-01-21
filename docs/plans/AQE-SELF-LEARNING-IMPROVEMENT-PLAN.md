# AQE v3 Self-Learning & Self-Improving Platform Plan

**Date**: 2026-01-09
**Status**: Draft
**Analysis Base**: claude-flow v3 hooks + AQE helpers

---

## Executive Summary

This plan outlines how to evolve AQE v3 into a self-learning, self-improving quality engineering platform by integrating patterns from claude-flow v3 hooks with AQE's existing infrastructure.

### Key Capabilities to Implement
1. **Pattern Learning** - Learn from successful test generation, coverage analysis
2. **Adaptive Routing** - Smart agent selection based on task patterns
3. **Quality Feedback Loop** - Continuous improvement from test outcomes
4. **Cross-Session Memory** - Persistent learning across sessions
5. **Self-Optimization** - Auto-tuning parameters based on performance

---

## Part 1: Architecture Analysis

### 1.1 Claude-Flow V3 Hooks Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    HOOKS SYSTEM                               │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐       │
│  │  Registry   │ -> │  Executor   │ -> │  Daemons    │       │
│  │ (events)    │    │ (handlers)  │    │ (background)│       │
│  └─────────────┘    └─────────────┘    └─────────────┘       │
│         │                  │                  │               │
│         ▼                  ▼                  ▼               │
│  ┌─────────────────────────────────────────────────┐         │
│  │              ReasoningBank                       │         │
│  │  - HNSW Vector Index (150x-12,500x faster)      │         │
│  │  - Pattern Storage (short/long term)            │         │
│  │  - Quality Scoring & Promotion                  │         │
│  │  - Agent Routing via Similarity                 │         │
│  └─────────────────────────────────────────────────┘         │
│         │                  │                  │               │
│         ▼                  ▼                  ▼               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐       │
│  │  Guidance   │    │  Workers    │    │  Bridge     │       │
│  │  Provider   │    │ (12 types)  │    │ (Official)  │       │
│  └─────────────┘    └─────────────┘    └─────────────┘       │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

**Key Components:**
- **ReasoningBank**: Vector-based pattern storage with HNSW indexing
- **GuidanceProvider**: Generates Claude-visible context from patterns
- **Workers**: 12 background workers (health, security, ADR, DDD, etc.)
- **OfficialHooksBridge**: Maps internal events to Claude Code hooks

### 1.2 AQE Helpers Architecture (Current)

```
┌──────────────────────────────────────────────────────────────┐
│                    .claude/helpers/                           │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────┐    ┌─────────────────┐                  │
│  │ learning-       │    │ learning-hooks. │                  │
│  │ service.mjs     │    │ sh              │                  │
│  │ (HNSW+SQLite)   │    │ (CLI wrapper)   │                  │
│  └─────────────────┘    └─────────────────┘                  │
│                                                               │
│  ┌─────────────────┐    ┌─────────────────┐                  │
│  │ swarm-hooks.sh  │    │ swarm-comms.sh  │                  │
│  │ (Agent comms)   │    │ (Messaging)     │                  │
│  └─────────────────┘    └─────────────────┘                  │
│                                                               │
│  ┌─────────────────┐    ┌─────────────────┐                  │
│  │ metrics-db.mjs  │    │ statusline.js   │                  │
│  │ (SQLite metrics)│    │ (Visual status) │                  │
│  └─────────────────┘    └─────────────────┘                  │
│                                                               │
│  ┌─────────────────┐    ┌─────────────────┐                  │
│  │ worker-         │    │ daemon-         │                  │
│  │ manager.sh      │    │ manager.sh      │                  │
│  └─────────────────┘    └─────────────────┘                  │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

**Current Capabilities:**
- Basic pattern storage with HNSW (in-memory)
- Swarm communication (messages, consensus, handoffs)
- Metrics collection and persistence
- Worker management for background tasks
- Status line generation

### 1.3 Gap Analysis

| Capability | Claude-Flow V3 | AQE Current | Gap |
|------------|----------------|-------------|-----|
| Pattern Learning | TypeScript + AgentDB | SQLite + in-memory HNSW | Medium - Need AgentDB integration |
| Agent Routing | ReasoningBank patterns | Basic regex matching | High - Need ML-based routing |
| Quality Feedback | Outcome tracking | Partial | Medium - Need feedback loop |
| Cross-Session Memory | AgentDB persistence | SQLite (fragile) | Low - Already have SQLite |
| Background Workers | 12 TypeScript workers | Shell scripts | Medium - Need TypeScript migration |
| Official Hooks Bridge | Full implementation | Not integrated | High - Need bridge |
| Domain-Specific Guidance | 5 domain templates | None | High - QE-specific guidance needed |
| ONNX Embeddings | Via @claude-flow/embeddings | Fallback hash | Medium - Optional improvement |

---

## Part 2: Improvement Plan

### Phase 1: Core Learning Infrastructure (Week 1-2)

#### 1.1 AQE ReasoningBank Implementation

Create QE-specific ReasoningBank that understands quality engineering patterns.

```typescript
// v3/@aqe-platform/learning/src/qe-reasoning-bank.ts
export class QEReasoningBank extends ReasoningBank {
  // QE-specific domain patterns
  private static QE_DOMAINS = {
    'test-generation': /test|spec|describe|it\(|expect|assert/i,
    'coverage-analysis': /coverage|branch|line|uncovered|gap/i,
    'mutation-testing': /mutant|mutation|kill|survive/i,
    'api-testing': /endpoint|request|response|api|contract/i,
    'security-testing': /vuln|cve|owasp|xss|sqli|injection/i,
    'visual-testing': /screenshot|visual|snapshot|regression/i,
    'accessibility': /a11y|aria|wcag|screen.?reader/i,
    'performance': /load|stress|benchmark|latency|throughput/i,
  };

  // QE-specific guidance templates
  private static QE_GUIDANCE = {
    'test-generation': [
      'Follow Arrange-Act-Assert pattern',
      'One assertion per logical concept',
      'Use descriptive test names (should_when_given)',
      'Mock external dependencies',
      'Test edge cases and boundaries',
    ],
    'coverage-analysis': [
      'Focus on risk-weighted coverage, not percentage',
      'Prioritize untested critical paths',
      'Use O(log n) sublinear algorithms for large codebases',
      'Consider mutation score over line coverage',
    ],
    // ... more domains
  };

  async routeQETask(task: string): Promise<QERoutingResult> {
    const routing = await this.routeTask(task);
    return this.enrichWithQEContext(routing, task);
  }
}
```

#### 1.2 QE Pattern Types

Define specific pattern types for QE domain:

```typescript
// v3/@aqe-platform/learning/src/qe-patterns.ts
export interface QEPattern extends GuidancePattern {
  patternType: QEPatternType;
  testFramework?: string;
  language?: string;
  complexity?: 'simple' | 'medium' | 'complex';
  applicability: {
    codeTypes: string[];  // ['class', 'function', 'module']
    domains: string[];    // ['api', 'ui', 'db']
  };
}

export type QEPatternType =
  | 'test-template'           // Reusable test structure
  | 'assertion-pattern'       // How to assert specific conditions
  | 'mock-pattern'           // How to mock specific dependencies
  | 'coverage-strategy'      // Coverage improvement approaches
  | 'mutation-strategy'      // Mutation testing patterns
  | 'api-contract'           // API testing patterns
  | 'visual-baseline'        // Visual regression patterns
  | 'a11y-check'             // Accessibility test patterns
  | 'perf-benchmark';        // Performance test patterns
```

#### 1.3 Learning Hooks Integration

Create AQE-specific hooks that feed into the learning system:

```typescript
// v3/@aqe-platform/hooks/src/qe-hooks.ts
export const QE_HOOK_EVENTS = {
  // Test lifecycle
  PreTestGeneration: 'qe:pre-test-generation',
  PostTestGeneration: 'qe:post-test-generation',
  TestExecutionResult: 'qe:test-execution-result',

  // Coverage lifecycle
  PreCoverageAnalysis: 'qe:pre-coverage-analysis',
  PostCoverageAnalysis: 'qe:post-coverage-analysis',
  CoverageGapIdentified: 'qe:coverage-gap-identified',

  // Agent routing
  QEAgentRouting: 'qe:agent-routing',
  QEAgentCompletion: 'qe:agent-completion',

  // Quality metrics
  QualityScoreCalculated: 'qe:quality-score',
  RiskAssessmentComplete: 'qe:risk-assessment',
};

export function createQEHookHandlers(): Record<string, HookHandler> {
  return {
    [QE_HOOK_EVENTS.PostTestGeneration]: async (ctx) => {
      // Learn from successful test generation
      const pattern = extractTestPattern(ctx);
      await qeReasoningBank.storePattern(
        pattern.strategy,
        pattern.domain,
        { testFramework: pattern.framework, complexity: pattern.complexity }
      );
      return { success: true };
    },

    [QE_HOOK_EVENTS.TestExecutionResult]: async (ctx) => {
      // Update pattern quality based on test outcome
      if (ctx.data?.patternId) {
        await qeReasoningBank.recordOutcome(
          ctx.data.patternId,
          ctx.data.testsPassed
        );
      }
      return { success: true };
    },
  };
}
```

### Phase 2: Adaptive Agent Routing (Week 2-3)

#### 2.1 QE Agent Registry

Map all 78 QE agents with their capabilities:

```typescript
// v3/@aqe-platform/routing/src/qe-agent-registry.ts
export const QE_AGENT_REGISTRY: Record<string, QEAgentProfile> = {
  'qe-test-generator': {
    capabilities: ['test-generation', 'tdd', 'bdd'],
    frameworks: ['jest', 'vitest', 'pytest', 'junit'],
    languages: ['typescript', 'javascript', 'python', 'java'],
    complexity: { min: 'simple', max: 'complex' },
    performanceScore: 0.85,
  },
  'qe-coverage-analyzer': {
    capabilities: ['coverage-analysis', 'gap-detection'],
    algorithms: ['sublinear', 'O(log n)'],
    scalability: '10M+ lines',
    performanceScore: 0.92,
  },
  'qe-mutation-tester': {
    capabilities: ['mutation-testing', 'test-quality'],
    tools: ['stryker', 'pitest', 'mutmut'],
    performanceScore: 0.78,
  },
  // ... 75 more agents
};
```

#### 2.2 ML-Based Task Router

Replace regex-based routing with vector similarity + historical performance:

```typescript
// v3/@aqe-platform/routing/src/qe-router.ts
export class QETaskRouter {
  constructor(
    private reasoningBank: QEReasoningBank,
    private agentRegistry: typeof QE_AGENT_REGISTRY,
  ) {}

  async route(task: QETask): Promise<QERoutingDecision> {
    // 1. Get embedding for task
    const taskEmbedding = await this.reasoningBank.embed(task.description);

    // 2. Search for similar past tasks
    const similarTasks = await this.reasoningBank.searchPatterns(taskEmbedding, 10);

    // 3. Get historical performance by agent
    const agentPerformance = this.calculateAgentPerformance(similarTasks);

    // 4. Match task requirements to agent capabilities
    const capabilityScores = this.matchCapabilities(task, this.agentRegistry);

    // 5. Combine scores with weights
    const finalScores = this.combineScores({
      similarity: 0.3,      // How similar to past successful tasks
      performance: 0.4,     // Historical agent performance
      capabilities: 0.3,    // Capability match
    }, similarTasks, agentPerformance, capabilityScores);

    // 6. Return ranked recommendations
    return {
      recommended: finalScores[0].agent,
      confidence: finalScores[0].score,
      alternatives: finalScores.slice(1, 4),
      reasoning: this.generateReasoning(task, finalScores[0]),
    };
  }
}
```

#### 2.3 Routing Feedback Loop

Learn from routing outcomes:

```typescript
// v3/@aqe-platform/routing/src/routing-feedback.ts
export class RoutingFeedbackCollector {
  async recordRoutingOutcome(
    taskId: string,
    routingDecision: QERoutingDecision,
    outcome: TaskOutcome
  ): Promise<void> {
    // Store outcome
    await this.db.insert('routing_outcomes', {
      taskId,
      recommendedAgent: routingDecision.recommended,
      actualAgent: outcome.usedAgent,
      followedRecommendation: routingDecision.recommended === outcome.usedAgent,
      success: outcome.success,
      quality: outcome.qualityScore,
      duration: outcome.durationMs,
      timestamp: Date.now(),
    });

    // Update agent performance metrics
    await this.updateAgentMetrics(outcome.usedAgent, outcome);

    // Store as pattern if successful
    if (outcome.success && outcome.qualityScore > 0.8) {
      await this.qeReasoningBank.storePattern(
        `Routed "${outcome.taskDescription}" to ${outcome.usedAgent}`,
        this.detectDomain(outcome),
        { agent: outcome.usedAgent, quality: outcome.qualityScore }
      );
    }
  }
}
```

### Phase 3: Quality Feedback Loop (Week 3-4)

#### 3.1 Test Outcome Tracking

Track all test-related outcomes:

```typescript
// v3/@aqe-platform/feedback/src/test-outcome-tracker.ts
export interface TestOutcome {
  testId: string;
  generatedBy: string;       // Agent that generated
  patternId?: string;        // Pattern used
  framework: string;
  passed: boolean;
  coverage: {
    lines: number;
    branches: number;
    functions: number;
  };
  mutationScore?: number;
  executionTime: number;
  flaky: boolean;
  maintainability: number;   // 0-1 score
}

export class TestOutcomeTracker {
  async track(outcome: TestOutcome): Promise<void> {
    // 1. Store outcome
    await this.db.insert('test_outcomes', outcome);

    // 2. Update pattern quality if pattern was used
    if (outcome.patternId) {
      const qualityDelta = this.calculateQualityDelta(outcome);
      await this.qeReasoningBank.recordOutcome(
        outcome.patternId,
        outcome.passed && !outcome.flaky
      );
    }

    // 3. Emit event for other systems
    this.emit('test:outcome', outcome);

    // 4. Check for pattern promotion
    await this.checkPatternPromotion(outcome.patternId);
  }

  private calculateQualityDelta(outcome: TestOutcome): number {
    let score = 0;
    if (outcome.passed) score += 0.3;
    if (!outcome.flaky) score += 0.2;
    if (outcome.coverage.lines > 80) score += 0.2;
    if (outcome.mutationScore && outcome.mutationScore > 70) score += 0.2;
    if (outcome.maintainability > 0.7) score += 0.1;
    return score;
  }
}
```

#### 3.2 Coverage Improvement Learning

Learn what coverage strategies work:

```typescript
// v3/@aqe-platform/feedback/src/coverage-learner.ts
export class CoverageLearner {
  async learnFromCoverageSession(session: CoverageSession): Promise<void> {
    const improvement = session.afterCoverage - session.beforeCoverage;

    if (improvement > 5) { // Significant improvement
      // Extract and store the strategy
      const strategy = this.extractStrategy(session);
      await this.qeReasoningBank.storePattern(
        strategy.description,
        'coverage-analysis',
        {
          improvement,
          codeType: session.targetType,
          technique: session.technique,
          agent: session.agentUsed,
        }
      );
    }

    // Always record metrics for trend analysis
    await this.metrics.record({
      sessionId: session.id,
      improvement,
      technique: session.technique,
      targetSize: session.targetLinesOfCode,
    });
  }
}
```

### Phase 4: Self-Optimization (Week 4-5)

#### 4.1 Parameter Auto-Tuning

Automatically adjust system parameters based on performance:

```typescript
// v3/@aqe-platform/optimization/src/auto-tuner.ts
export class AQEAutoTuner {
  private tunableParams: TunableParameter[] = [
    {
      name: 'hnsw.efSearch',
      current: 100,
      min: 50,
      max: 500,
      metric: 'search_latency_ms',
      target: 1, // <1ms
    },
    {
      name: 'routing.confidence_threshold',
      current: 0.7,
      min: 0.5,
      max: 0.95,
      metric: 'routing_accuracy',
      target: 0.9, // 90% accuracy
    },
    {
      name: 'pattern.promotion_threshold',
      current: 3,
      min: 2,
      max: 10,
      metric: 'pattern_quality_long_term',
      target: 0.8,
    },
    {
      name: 'test_gen.complexity_limit',
      current: 'complex',
      options: ['simple', 'medium', 'complex'],
      metric: 'test_maintainability',
      target: 0.7,
    },
  ];

  async tune(): Promise<TuningResult> {
    const results: ParameterAdjustment[] = [];

    for (const param of this.tunableParams) {
      const currentMetric = await this.metrics.getAverage(
        param.metric,
        { window: '24h' }
      );

      if (this.needsAdjustment(currentMetric, param.target)) {
        const adjustment = this.calculateAdjustment(param, currentMetric);
        await this.applyAdjustment(param.name, adjustment);
        results.push({ param: param.name, from: param.current, to: adjustment });
      }
    }

    return { adjustments: results, timestamp: Date.now() };
  }
}
```

#### 4.2 Background Optimization Workers

QE-specific workers for continuous improvement:

```typescript
// v3/@aqe-platform/workers/src/qe-workers.ts
export const QE_WORKERS = {
  'pattern-consolidator': {
    interval: 30 * 60 * 1000, // 30 min
    handler: async () => {
      const result = await qeReasoningBank.consolidate();
      return {
        duplicatesRemoved: result.duplicatesRemoved,
        patternsPruned: result.patternsPruned,
        patternsPromoted: result.patternsPromoted,
      };
    },
  },

  'coverage-gap-scanner': {
    interval: 60 * 60 * 1000, // 1 hour
    handler: async () => {
      const gaps = await coverageAnalyzer.findGaps();
      // Auto-prioritize based on risk
      const prioritized = await riskAssessor.prioritize(gaps);
      // Store for agent routing
      await taskQueue.addMany(prioritized.map(g => ({
        type: 'coverage-improvement',
        target: g.file,
        priority: g.riskScore,
      })));
      return { gapsFound: gaps.length, prioritized: prioritized.length };
    },
  },

  'flaky-test-detector': {
    interval: 2 * 60 * 60 * 1000, // 2 hours
    handler: async () => {
      const flaky = await testAnalyzer.detectFlakyTests();
      // Generate stabilization tasks
      for (const test of flaky) {
        await taskQueue.add({
          type: 'flaky-test-fix',
          testId: test.id,
          flakinessScore: test.score,
        });
      }
      return { flakyTests: flaky.length };
    },
  },

  'routing-accuracy-monitor': {
    interval: 15 * 60 * 1000, // 15 min
    handler: async () => {
      const stats = await routingFeedback.getStats('1h');
      if (stats.accuracy < 0.8) {
        // Trigger retraining
        await qeRouter.retrain();
      }
      return stats;
    },
  },
};
```

### Phase 5: Init System Enhancement (Week 5-6)

#### 5.1 Enhanced AQE Init Command

```bash
# aqe init --wizard
# Creates a self-learning QE environment

┌─────────────────────────────────────────────────────────────┐
│                    AQE v3 Initialization                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Project Analysis                                         │
│     ├─ Detecting frameworks... [jest, vitest]               │
│     ├─ Detecting languages... [typescript]                  │
│     └─ Existing tests found: 1,171                          │
│                                                             │
│  2. Learning System Setup                                    │
│     ├─ Initializing QEReasoningBank... ✓                   │
│     ├─ Loading pre-trained QE patterns... (847 patterns)   │
│     └─ Setting up HNSW index... ✓                          │
│                                                             │
│  3. Agent Configuration                                      │
│     ├─ Available QE agents: 78                              │
│     ├─ Routing model: ML-based (trained)                    │
│     └─ Background workers: 12 (starting)                    │
│                                                             │
│  4. Hooks Integration                                        │
│     ├─ Claude Code hooks: Configured                        │
│     ├─ Learning hooks: Active                               │
│     └─ Feedback loops: Enabled                              │
│                                                             │
│  ✓ AQE v3 initialized as self-learning platform            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 5.2 Init Configuration Schema

```typescript
// v3/@aqe-platform/init/src/config-schema.ts
export interface AQEInitConfig {
  project: {
    name: string;
    root: string;
    type: 'monorepo' | 'single' | 'library';
  };

  learning: {
    enabled: boolean;
    pretrainedPatterns: boolean;  // Load QE pattern library
    hnswConfig: {
      M: number;
      efConstruction: number;
      efSearch: number;
    };
    promotionThreshold: number;
    qualityThreshold: number;
  };

  routing: {
    mode: 'ml' | 'rules' | 'hybrid';
    confidenceThreshold: number;
    feedbackEnabled: boolean;
  };

  workers: {
    enabled: string[];  // Which workers to run
    intervals: Record<string, number>;
  };

  hooks: {
    claudeCode: boolean;
    preCommit: boolean;
    ciIntegration: boolean;
  };

  autoTuning: {
    enabled: boolean;
    parameters: string[];
  };
}
```

#### 5.3 Init Hooks for Self-Configuration

```typescript
// v3/@aqe-platform/init/src/self-configure.ts
export class AQESelfConfigurator {
  async analyzeProject(): Promise<ProjectAnalysis> {
    return {
      frameworks: await this.detectTestFrameworks(),
      languages: await this.detectLanguages(),
      existingTests: await this.countExistingTests(),
      codeComplexity: await this.analyzeComplexity(),
      testCoverage: await this.measureCoverage(),
    };
  }

  async recommendConfig(analysis: ProjectAnalysis): Promise<AQEInitConfig> {
    // Use patterns to recommend configuration
    const similarProjects = await this.qeReasoningBank.searchPatterns(
      JSON.stringify(analysis),
      5
    );

    // Generate config based on similar successful configurations
    return this.generateConfig(analysis, similarProjects);
  }

  async applyLearningFromSimilarProjects(): Promise<void> {
    // Import patterns from similar projects (opt-in)
    const patterns = await this.fetchCommunityPatterns();
    await this.qeReasoningBank.importPatterns(patterns);
  }
}
```

---

## Part 3: Implementation Roadmap

### Sprint 1 (Days 1-5): Foundation
- [ ] Create `v3/@aqe-platform/learning` package
- [ ] Implement `QEReasoningBank` extending claude-flow ReasoningBank
- [ ] Define QE-specific pattern types and domains
- [ ] Set up SQLite persistence with HNSW indexing
- [ ] Create basic QE hooks (pre/post test generation)

### Sprint 2 (Days 6-10): Routing
- [ ] Create `v3/@aqe-platform/routing` package
- [ ] Build QE agent registry (78 agents)
- [ ] Implement ML-based task router
- [ ] Add routing feedback collection
- [ ] Create routing accuracy metrics

### Sprint 3 (Days 11-15): Feedback Loops
- [ ] Create `v3/@aqe-platform/feedback` package
- [ ] Implement TestOutcomeTracker
- [ ] Build CoverageLearner
- [ ] Add quality score calculation
- [ ] Implement pattern promotion logic

### Sprint 4 (Days 16-20): Self-Optimization
- [ ] Create `v3/@aqe-platform/optimization` package
- [ ] Implement AQEAutoTuner
- [ ] Create QE-specific workers
- [ ] Add performance monitoring
- [ ] Build self-diagnostic system

### Sprint 5 (Days 21-25): Init Enhancement
- [ ] Enhance `aqe init` with wizard
- [ ] Add project analysis capabilities
- [ ] Implement self-configuration
- [ ] Create pre-trained pattern library
- [ ] Add Claude Code hooks integration

### Sprint 6 (Days 26-30): Integration & Testing
- [ ] Integration tests for all components
- [ ] Performance benchmarks
- [ ] Documentation
- [ ] Migration guide from v2
- [ ] Community pattern sharing (opt-in)

---

## Part 4: Success Metrics

### Learning Effectiveness
| Metric | Target | Measurement |
|--------|--------|-------------|
| Pattern reuse rate | >40% | Patterns used in >1 task |
| Routing accuracy | >85% | Recommended agent used |
| Quality improvement | >20% | Test quality score increase |
| Coverage improvement | >15% | Automated coverage gains |

### Performance Targets
| Metric | Target | Measurement |
|--------|--------|-------------|
| Pattern search | <1ms | P95 latency |
| Routing decision | <10ms | P95 latency |
| Feedback recording | <5ms | P95 latency |
| Worker cycle | <30s | Total worker run time |

### Self-Improvement Indicators
| Indicator | Target | Measurement |
|-----------|--------|-------------|
| Pattern promotion rate | 5-10% | Patterns promoted to long-term |
| Auto-tuning frequency | Weekly | Parameters adjusted |
| Flaky test reduction | >50% | Flaky tests fixed automatically |
| Coverage gap closure | >30% | Gaps addressed by system |

---

## Part 5: File Structure

```
v3/@aqe-platform/
├── learning/
│   ├── src/
│   │   ├── qe-reasoning-bank.ts
│   │   ├── qe-patterns.ts
│   │   ├── pattern-store.ts
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── routing/
│   ├── src/
│   │   ├── qe-router.ts
│   │   ├── qe-agent-registry.ts
│   │   ├── routing-feedback.ts
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── feedback/
│   ├── src/
│   │   ├── test-outcome-tracker.ts
│   │   ├── coverage-learner.ts
│   │   ├── quality-calculator.ts
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── optimization/
│   ├── src/
│   │   ├── auto-tuner.ts
│   │   ├── qe-workers.ts
│   │   ├── self-diagnostic.ts
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── hooks/
│   ├── src/
│   │   ├── qe-hooks.ts
│   │   ├── claude-code-bridge.ts
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── init/
│   ├── src/
│   │   ├── wizard.ts
│   │   ├── self-configure.ts
│   │   ├── config-schema.ts
│   │   └── index.ts
│   ├── templates/
│   │   └── settings.json
│   ├── package.json
│   └── tsconfig.json
└── shared/
    ├── src/
    │   ├── types.ts
    │   ├── constants.ts
    │   └── utils.ts
    ├── package.json
    └── tsconfig.json
```

---

## Part 6: Integration with Existing System

### 6.1 Backward Compatibility

The new system will:
1. Import existing patterns from `.claude-flow/learning/patterns.db`
2. Maintain compatibility with existing helpers in `.claude/helpers/`
3. Support gradual migration from shell scripts to TypeScript
4. Keep existing CLI commands working

### 6.2 Migration Path

```bash
# Step 1: Install new packages
npm install @aqe-platform/learning @aqe-platform/routing

# Step 2: Run migration
aqe migrate --from-v2

# Step 3: Verify
aqe doctor --check-learning

# Step 4: Enable self-learning
aqe config set learning.enabled true
```

### 6.3 Claude Code Hooks Integration

Add to `.claude/settings.local.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "npx @aqe-platform/hooks pre-tool $TOOL_NAME $TOOL_INPUT",
        "timeout": 5000
      }
    ],
    "PostToolUse": [
      {
        "type": "command",
        "command": "npx @aqe-platform/hooks post-tool $TOOL_NAME $TOOL_SUCCESS",
        "timeout": 5000
      }
    ],
    "SessionStart": [
      {
        "type": "command",
        "command": "npx @aqe-platform/hooks session-start",
        "timeout": 10000
      }
    ]
  }
}
```

---

## Conclusion

This plan transforms AQE v3 from a collection of QE agents into a self-learning, self-improving quality engineering platform that:

1. **Learns from every interaction** - Test generation, coverage analysis, agent routing
2. **Adapts over time** - Pattern promotion, auto-tuning, feedback loops
3. **Optimizes automatically** - Background workers, self-configuration
4. **Integrates seamlessly** - Claude Code hooks, existing helpers, v2 compatibility

The key innovation is combining claude-flow's ReasoningBank pattern learning with QE-specific domain knowledge, creating a platform that continuously improves its quality engineering capabilities.
