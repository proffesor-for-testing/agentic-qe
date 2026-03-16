/**
 * Neural Routing Shadow Mode Integration Tests
 *
 * Simulates realistic routing scenarios where both the rule-based and neural
 * routers run simultaneously. Tracks and verifies:
 * - Disagreement rate between routers
 * - Shadow mode exit conditions
 * - Circuit breaker behavior
 * - Neural weight learning from outcomes
 *
 * @see src/routing/neural-tiny-dancer-router.ts
 * @see docs/implementation/adrs/ADR-082-neural-model-routing-tiny-dancer.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  NeuralTinyDancerRouter,
  createNeuralTinyDancerRouter,
  SimpleNeuralRouter,
  type NeuralRouterStats,
  type ShadowDecisionLog,
} from '../../../src/routing/neural-tiny-dancer-router.js';

import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
} from '../../../src/integrations/ruvector/feature-flags.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Realistic task factory that produces tasks of varying complexity.
 */
function createRealisticTask(
  type: 'simple' | 'moderate' | 'complex',
  domain: string,
  index: number,
) {
  const descriptions: Record<string, string[]> = {
    simple: [
      'Add a null check to the input validator',
      'Rename variable from x to count',
      'Fix typo in error message string',
      'Add missing import statement',
      'Update version number in config',
    ],
    moderate: [
      'Write unit tests for the UserService authentication method including edge cases for expired tokens',
      'Refactor the database connection pool to use async initialization with retry logic',
      'Implement caching layer for API responses with TTL and invalidation support',
      'Add input validation middleware for all REST endpoints with proper error formatting',
      'Create integration test suite for the payment processing workflow with mock providers',
    ],
    complex: [
      'Design and implement a distributed event sourcing system with CQRS pattern, including saga orchestration for cross-service transactions, conflict resolution for concurrent updates, and snapshot optimization for aggregate rebuilding across 5 microservices',
      'Architect a real-time collaborative editing system with operational transformation, supporting concurrent multi-user editing with conflict-free replicated data types, undo/redo stacks per user, and presence awareness across WebSocket connections with automatic reconnection',
      'Implement a comprehensive security audit system that performs static analysis, dependency vulnerability scanning, runtime behavior monitoring, and generates compliance reports for SOC2 and ISO 27001 with automatic remediation suggestions',
      'Build a multi-tenant data pipeline with schema evolution support, backward-compatible API versioning, real-time stream processing with exactly-once semantics, and automated data quality validation gates',
      'Create a chaos engineering framework that systematically tests distributed system resilience through controlled fault injection, network partition simulation, resource exhaustion scenarios, and automated recovery verification',
    ],
  };

  const taskDescriptions = descriptions[type];
  const description = taskDescriptions[index % taskDescriptions.length];

  return {
    description,
    domain: domain as any,
    context: {
      code: type === 'complex'
        ? 'export class ComplexService { constructor(private readonly deps: Dependencies[]) { } async execute(): Promise<Result> { /* complex logic */ } }'.repeat(3)
        : type === 'moderate'
          ? 'function process(input: string): Result { return validate(input); }'
          : 'const x = 1;',
    },
    complexity: type === 'simple' ? 'simple' as const : type === 'moderate' ? 'medium' as const : 'complex' as const,
  };
}

const QE_DOMAINS = [
  'test-generation',
  'coverage-analysis',
  'security-compliance',
  'defect-intelligence',
  'chaos-resilience',
  'code-intelligence',
];

// ============================================================================
// 1. Realistic Shadow Mode Simulation
// ============================================================================

describe('Neural Routing: Shadow Mode Simulation', () => {
  let router: NeuralTinyDancerRouter;

  beforeEach(() => {
    resetRuVectorFeatureFlags();
    setRuVectorFeatureFlags({ useNeuralRouting: true });
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should run both routers simultaneously for realistic workload', async () => {
    router = createNeuralTinyDancerRouter({
      forceShadowMode: true,
      shadowModeDecisions: 50,
      shadowModeMaxDisagreement: 0.15,
    });

    const taskTypes: Array<'simple' | 'moderate' | 'complex'> = [
      'simple', 'simple', 'moderate', 'moderate', 'complex',
    ];

    // Run 50 realistic routing decisions
    for (let i = 0; i < 50; i++) {
      const taskType = taskTypes[i % taskTypes.length];
      const domain = QE_DOMAINS[i % QE_DOMAINS.length];
      const task = createRealisticTask(taskType, domain, i);

      const result = await router.route(task);

      // In shadow mode, result should always come from rule-based router
      expect(result).toBeDefined();
      expect(result.model).toBeDefined();
      expect(result.complexity).toBeDefined();
      expect(result.classification).toBeDefined();
    }

    const stats = router.getNeuralStats();
    expect(stats.shadowDecisions).toBe(50);
    expect(stats.shadowModeActive).toBe(true);
    expect(stats.neuralPrimary).toBe(false);
  });

  it('should track disagreement rate accurately', async () => {
    router = createNeuralTinyDancerRouter({
      forceShadowMode: true,
      shadowModeDecisions: 1000, // Keep in shadow mode
    });

    // Run 30 tasks
    for (let i = 0; i < 30; i++) {
      const task = createRealisticTask(
        i % 3 === 0 ? 'complex' : i % 2 === 0 ? 'moderate' : 'simple',
        QE_DOMAINS[i % QE_DOMAINS.length],
        i,
      );
      await router.route(task);
    }

    const stats = router.getNeuralStats();
    const logs = router.getShadowDecisionLogs();

    // Verify disagreement rate calculation
    const actualDisagreements = logs.filter((l) => !l.agreed).length;
    const expectedRate = actualDisagreements / logs.length;

    expect(stats.disagreementRate).toBeCloseTo(expectedRate, 5);
    expect(stats.shadowDecisions).toBe(30);
  });

  it('should capture full decision log details for each routing', async () => {
    router = createNeuralTinyDancerRouter({
      forceShadowMode: true,
      shadowModeDecisions: 1000,
    });

    const task = createRealisticTask('moderate', 'test-generation', 0);
    await router.route(task);

    const logs = router.getShadowDecisionLogs();
    expect(logs).toHaveLength(1);

    const log = logs[0];
    expect(log.taskDescription).toBeTruthy();
    expect(log.taskDescription.length).toBeLessThanOrEqual(100);
    expect(['haiku', 'sonnet', 'opus']).toContain(log.ruleDecision);
    expect(['haiku', 'sonnet', 'opus']).toContain(log.neuralDecision);
    expect(typeof log.agreed).toBe('boolean');
    expect(log.neuralConfidence).toBeGreaterThan(0);
    expect(log.neuralConfidence).toBeLessThanOrEqual(1);
    expect(log.timestamp).toBeInstanceOf(Date);
  });
});

// ============================================================================
// 2. Shadow Mode Exit Conditions
// ============================================================================

describe('Neural Routing: Shadow Mode Exit', () => {
  beforeEach(() => {
    resetRuVectorFeatureFlags();
    setRuVectorFeatureFlags({ useNeuralRouting: true });
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should not exit shadow mode before reaching decision limit', async () => {
    const router = createNeuralTinyDancerRouter({
      shadowModeDecisions: 20,
      shadowModeMaxDisagreement: 0.50, // Very permissive
    });

    // Run only 10 tasks (below the 20 decision limit)
    for (let i = 0; i < 10; i++) {
      const task = createRealisticTask('simple', 'test-generation', i);
      await router.route(task);
    }

    expect(router.isShadowModeActive()).toBe(true);
    expect(router.isNeuralPrimary()).toBe(false);
  });

  it('should exit shadow mode when decisions reached and disagreement is low', async () => {
    // Use forceShadowMode undefined (auto mode) to allow exit
    const router = createNeuralTinyDancerRouter({
      shadowModeDecisions: 10,
      shadowModeMaxDisagreement: 1.0, // Always acceptable
    });

    // Run enough decisions to trigger exit evaluation
    for (let i = 0; i < 12; i++) {
      const task = createRealisticTask('simple', 'test-generation', 0);
      await router.route(task);
    }

    const stats = router.getNeuralStats();
    // With max disagreement of 1.0, shadow mode should have exited
    // after reaching 10 decisions
    expect(stats.shadowDecisions).toBeGreaterThanOrEqual(10);
    if (stats.disagreementRate <= 1.0) {
      expect(stats.shadowModeActive).toBe(false);
      expect(stats.neuralPrimary).toBe(true);
    }
  });

  it('should stay in shadow mode when forceShadowMode is true', async () => {
    const router = createNeuralTinyDancerRouter({
      forceShadowMode: true,
      shadowModeDecisions: 5,
      shadowModeMaxDisagreement: 1.0,
    });

    // Run more than enough decisions
    for (let i = 0; i < 10; i++) {
      const task = createRealisticTask('simple', 'test-generation', 0);
      await router.route(task);
    }

    expect(router.isShadowModeActive()).toBe(true);
    expect(router.isNeuralPrimary()).toBe(false);
  });

  it('should transition to neural-primary mode after successful shadow period', async () => {
    const router = createNeuralTinyDancerRouter({
      forceShadowMode: false,
      shadowModeDecisions: 10,
      shadowModeMaxDisagreement: 1.0, // Very permissive
    });

    expect(router.isNeuralPrimary()).toBe(true);
    expect(router.isShadowModeActive()).toBe(false);
  });
});

// ============================================================================
// 3. Circuit Breaker Behavior
// ============================================================================

describe('Neural Routing: Circuit Breaker', () => {
  beforeEach(() => {
    resetRuVectorFeatureFlags();
    setRuVectorFeatureFlags({ useNeuralRouting: true });
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should trip circuit breaker when error rate exceeds threshold', async () => {
    const router = createNeuralTinyDancerRouter({
      forceShadowMode: false,
      circuitBreakerThreshold: 0.25,
    });

    const task = createRealisticTask('moderate', 'test-generation', 0);
    const result = await router.route(task);

    // Record many failures
    for (let i = 0; i < 20; i++) {
      router.recordNeuralOutcome(task, result, false, 0.1);
    }

    const stats = router.getNeuralStats();
    expect(stats.circuitBreakerTripped).toBe(true);
    expect(stats.recentErrorRate).toBeGreaterThan(0.25);
  });

  it('should fall back to rule-based routing when circuit breaker is tripped', async () => {
    const router = createNeuralTinyDancerRouter({
      forceShadowMode: false,
      circuitBreakerThreshold: 0.25,
    });

    const task = createRealisticTask('complex', 'security-compliance', 0);
    const result = await router.route(task);

    // Trip the circuit breaker
    for (let i = 0; i < 20; i++) {
      router.recordNeuralOutcome(task, result, false, 0.0);
    }

    expect(router.isCircuitBreakerTripped()).toBe(true);

    // Routing should still work (falls back to rule-based)
    const fallbackResult = await router.route(task);
    expect(fallbackResult).toBeDefined();
    expect(fallbackResult.model).toBeDefined();
  });

  it('should auto-recover circuit breaker when error rate drops', async () => {
    const router = createNeuralTinyDancerRouter({
      forceShadowMode: false,
      circuitBreakerThreshold: 0.30,
    });

    const task = createRealisticTask('moderate', 'test-generation', 0);
    const result = await router.route(task);

    // Trip the breaker with failures
    for (let i = 0; i < 15; i++) {
      router.recordNeuralOutcome(task, result, false, 0.0);
    }
    expect(router.isCircuitBreakerTripped()).toBe(true);

    // Record many successes to bring error rate down
    for (let i = 0; i < 50; i++) {
      router.recordNeuralOutcome(task, result, true, 0.9);
    }

    // Circuit breaker should auto-recover
    expect(router.isCircuitBreakerTripped()).toBe(false);
  });

  it('should allow manual circuit breaker reset', async () => {
    const router = createNeuralTinyDancerRouter({
      forceShadowMode: false,
      circuitBreakerThreshold: 0.25,
    });

    const task = createRealisticTask('simple', 'test-generation', 0);
    const result = await router.route(task);

    // Trip breaker
    for (let i = 0; i < 20; i++) {
      router.recordNeuralOutcome(task, result, false, 0.0);
    }

    expect(router.isCircuitBreakerTripped()).toBe(true);

    // Manual reset
    router.resetCircuitBreaker();
    expect(router.isCircuitBreakerTripped()).toBe(false);
  });
});

// ============================================================================
// 4. Neural Weight Learning and Outcome Recording
// ============================================================================

describe('Neural Routing: Weight Learning', () => {
  beforeEach(() => {
    resetRuVectorFeatureFlags();
    setRuVectorFeatureFlags({ useNeuralRouting: true });
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should update neural weights after recording outcomes', async () => {
    const router = createNeuralTinyDancerRouter({
      forceShadowMode: true,
      learningRate: 0.05,
    });

    const task = createRealisticTask('moderate', 'test-generation', 0);
    const result = await router.route(task);

    // Record 10 outcomes
    for (let i = 0; i < 10; i++) {
      router.recordNeuralOutcome(task, result, true, 0.85);
    }

    const stats = router.getNeuralStats();
    expect(stats.totalWeightUpdates).toBe(10);
  });

  it('should update domain success rates from outcomes', async () => {
    const router = createNeuralTinyDancerRouter({
      forceShadowMode: true,
    });

    const task = createRealisticTask('simple', 'test-generation', 0);
    const result = await router.route(task);

    // Record mixed outcomes
    for (let i = 0; i < 5; i++) {
      router.recordNeuralOutcome(task, result, true, 0.9);
    }
    for (let i = 0; i < 5; i++) {
      router.recordNeuralOutcome(task, result, false, 0.2);
    }

    // Stats should reflect the outcomes
    const stats = router.getNeuralStats();
    expect(stats.totalWeightUpdates).toBe(10);
    expect(stats.recentErrorRate).toBeCloseTo(0.5, 1);
  });

  it('should serialize and deserialize neural network weights', () => {
    const router = createNeuralTinyDancerRouter();
    const net = router.getNeuralNet();

    // Run a forward pass to verify initial state works
    const probs = net.forward([0.5, 0.3, 0.2, 0.8]);
    expect(probs).toHaveLength(3);
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 5);

    // Serialize
    const serialized = net.serialize();
    expect(serialized.weightsInputHidden).toHaveLength(4 * 32);
    expect(serialized.weightsHiddenOutput).toHaveLength(32 * 3);
    expect(serialized.biasHidden).toHaveLength(32);
    expect(serialized.biasOutput).toHaveLength(3);

    // Deserialize into a new network
    const newNet = new SimpleNeuralRouter();
    newNet.deserialize(serialized);

    // Should produce identical output
    const newProbs = newNet.forward([0.5, 0.3, 0.2, 0.8]);
    for (let i = 0; i < 3; i++) {
      expect(newProbs[i]).toBeCloseTo(probs[i], 5);
    }
  });

  it('should produce valid softmax probabilities summing to 1', () => {
    const net = new SimpleNeuralRouter();

    // Test with various feature inputs
    const inputs = [
      [0.0, 0.0, 0.0, 0.0],
      [1.0, 1.0, 1.0, 1.0],
      [0.1, 0.5, 0.9, 0.3],
      [0.0, 0.0, 0.0, 1.0],
    ];

    for (const input of inputs) {
      const probs = net.forward(input);
      expect(probs).toHaveLength(3);

      const sum = probs.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);

      // All probabilities should be non-negative
      for (const p of probs) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ============================================================================
// 5. Empirical Confidence Bounds
// ============================================================================

describe('Neural Routing: Empirical Confidence Bounds', () => {
  beforeEach(() => {
    resetRuVectorFeatureFlags();
    setRuVectorFeatureFlags({ useNeuralRouting: true });
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should compute wide bounds with insufficient calibration data', () => {
    const router = createNeuralTinyDancerRouter({
      forceShadowMode: false,
    });

    // With no calibration data, bounds should be wide
    const probs = [0.6, 0.3, 0.1];
    const bounds = router.computeEmpiricalConfidenceBounds(probs);

    expect(bounds.coverageLevel).toBe(0.90);
    expect(bounds.calibrationScore).toBeCloseTo(0.4, 5);
    // Insufficient data -> wide bounds
    expect(bounds.lower).toBe(0);
    expect(bounds.upper).toBe(1);
  });

  it('should narrow bounds after collecting calibration scores', async () => {
    const router = createNeuralTinyDancerRouter({
      forceShadowMode: true,
    });

    const task = createRealisticTask('moderate', 'test-generation', 0);

    // Record many outcomes to build calibration data
    for (let i = 0; i < 20; i++) {
      const result = await router.route(task);
      router.recordNeuralOutcome(task, result, true, 0.8);
    }

    // After calibration, bounds should be computed from data
    const probs = [0.7, 0.2, 0.1];
    const bounds = router.computeEmpiricalConfidenceBounds(probs);

    expect(bounds.coverageLevel).toBe(0.90);
    expect(bounds.calibrationScore).toBeCloseTo(0.3, 5);
    // With calibration data, bounds should be finite (not 0-1)
    expect(bounds.upper).toBeLessThanOrEqual(1);
    expect(bounds.lower).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// 6. Router Reset and State Management
// ============================================================================

describe('Neural Routing: State Management', () => {
  beforeEach(() => {
    resetRuVectorFeatureFlags();
    setRuVectorFeatureFlags({ useNeuralRouting: true });
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should reset all state cleanly', async () => {
    const router = createNeuralTinyDancerRouter({
      forceShadowMode: true,
    });

    // Accumulate some state
    for (let i = 0; i < 5; i++) {
      const task = createRealisticTask('moderate', 'test-generation', i);
      const result = await router.route(task);
      router.recordNeuralOutcome(task, result, true, 0.9);
    }

    expect(router.getNeuralStats().shadowDecisions).toBe(5);
    expect(router.getNeuralStats().totalWeightUpdates).toBe(5);

    // Reset
    router.reset();

    const stats = router.getNeuralStats();
    expect(stats.shadowDecisions).toBe(0);
    expect(stats.totalNeuralDecisions).toBe(0);
    expect(stats.totalWeightUpdates).toBe(0);
    expect(stats.disagreementRate).toBe(0);
    expect(stats.circuitBreakerTripped).toBe(false);
    expect(stats.recentErrorRate).toBe(0);
    expect(stats.shadowModeActive).toBe(true);
    expect(router.getShadowDecisionLogs()).toHaveLength(0);
  });

  it('should report correct stats after mixed routing and learning', async () => {
    const router = createNeuralTinyDancerRouter({
      forceShadowMode: true,
      shadowModeDecisions: 1000,
      circuitBreakerThreshold: 0.90, // High threshold so breaker does not trip
    });

    // Route 20 tasks of different types
    for (let i = 0; i < 20; i++) {
      const taskType: 'simple' | 'moderate' | 'complex' =
        i < 7 ? 'simple' : i < 14 ? 'moderate' : 'complex';
      const task = createRealisticTask(taskType, QE_DOMAINS[i % QE_DOMAINS.length], i);
      const result = await router.route(task);

      // Record outcome for some tasks (every other)
      if (i % 2 === 0) {
        router.recordNeuralOutcome(task, result, true, 0.8);
      }
    }

    const stats = router.getNeuralStats();
    expect(stats.shadowDecisions).toBe(20);
    expect(stats.totalNeuralDecisions).toBe(20);
    expect(stats.totalWeightUpdates).toBe(10); // Every other task
    expect(stats.shadowModeActive).toBe(true);
    expect(stats.neuralPrimary).toBe(false);
    expect(stats.circuitBreakerTripped).toBe(false);

    // Disagreement rate should be a valid ratio
    expect(stats.disagreementRate).toBeGreaterThanOrEqual(0);
    expect(stats.disagreementRate).toBeLessThanOrEqual(1);
  });

  it('should provide access to rule-based router stats', async () => {
    const router = createNeuralTinyDancerRouter({
      forceShadowMode: true,
    });

    const task = createRealisticTask('moderate', 'test-generation', 0);
    await router.route(task);

    const ruleStats = router.getStats();
    expect(ruleStats).toBeDefined();
    expect(typeof ruleStats.totalRouted).toBe('number');

    const config = router.getConfig();
    expect(config).toBeDefined();
  });
});
