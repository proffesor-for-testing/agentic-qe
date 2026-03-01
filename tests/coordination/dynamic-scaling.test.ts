/**
 * Unit tests for Dynamic Agent Scaling
 * ADR-064 Phase 4C: Workload-Based Auto-Scaling
 *
 * Tests DynamicScaler metrics recording, evaluation logic (scale-up, scale-down,
 * maintain, cooldown, clamping), execution with executor callbacks, policy
 * management, statistics, disposal, and factory function.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DynamicScaler,
  createDynamicScaler,
  DEFAULT_SCALING_POLICY,
} from '../../src/coordination/dynamic-scaling/index.js';
import type {
  WorkloadMetrics,
  ScalingPolicy,
  ScalingDecision,
} from '../../src/coordination/dynamic-scaling/index.js';

// ============================================================================
// Helpers
// ============================================================================

/** Build a WorkloadMetrics snapshot with sensible defaults and overrides. */
function makeMetrics(overrides: Partial<WorkloadMetrics> = {}): WorkloadMetrics {
  return {
    queueDepth: 0,
    activeAgents: 4,
    idleAgents: 0,
    avgTaskDurationMs: 1000,
    errorRate: 0,
    throughput: 10,
    timestamp: Date.now(),
    ...overrides,
  };
}

/** A minimal policy with short cooldown for fast tests. */
const TEST_POLICY: ScalingPolicy = {
  name: 'test-policy',
  scaleUpQueueRatio: 3,
  scaleDownIdleRatio: 0.5,
  errorRateScaleUpThreshold: 0.3,
  minAgents: 2,
  maxAgents: 10,
  cooldownMs: 100, // very short for test speed
  sampleWindowSize: 3,
};

// ============================================================================
// DynamicScaler
// ============================================================================

describe('DynamicScaler', () => {
  let scaler: DynamicScaler;

  beforeEach(() => {
    vi.useFakeTimers();
    scaler = new DynamicScaler(4, {
      defaultPolicy: TEST_POLICY,
      metricsHistorySize: 50,
      decisionHistorySize: 20,
    });
  });

  afterEach(() => {
    scaler.dispose();
    vi.useRealTimers();
  });

  // --------------------------------------------------------------------------
  // Initial state
  // --------------------------------------------------------------------------

  it('starts with initial agent count', () => {
    expect(scaler.getCurrentAgents()).toBe(4);
  });

  // --------------------------------------------------------------------------
  // Metrics recording
  // --------------------------------------------------------------------------

  it('recordMetrics stores metrics in history', () => {
    scaler.recordMetrics(makeMetrics({ queueDepth: 5 }));
    scaler.recordMetrics(makeMetrics({ queueDepth: 10 }));

    const history = scaler.getMetricsHistory();
    expect(history).toHaveLength(2);
    expect(history[0].queueDepth).toBe(5);
    expect(history[1].queueDepth).toBe(10);
  });

  // --------------------------------------------------------------------------
  // Evaluation: maintain when no metrics
  // --------------------------------------------------------------------------

  it('evaluate returns maintain when no metrics recorded', () => {
    const decision = scaler.evaluate();

    expect(decision.action).toBe('maintain');
    expect(decision.currentAgents).toBe(4);
    expect(decision.targetAgents).toBe(4);
  });

  // --------------------------------------------------------------------------
  // Evaluation: scale-up on queue depth
  // --------------------------------------------------------------------------

  it('evaluate returns scale-up when queue depth ratio exceeded', () => {
    // scaleUpQueueRatio = 3 and currentAgents = 4, so threshold = 12
    // queueDepth = 16 -> ratio = 4 > 3 -> scale-up
    scaler.recordMetrics(makeMetrics({ queueDepth: 16, activeAgents: 4, idleAgents: 0 }));
    scaler.recordMetrics(makeMetrics({ queueDepth: 16, activeAgents: 4, idleAgents: 0 }));
    scaler.recordMetrics(makeMetrics({ queueDepth: 16, activeAgents: 4, idleAgents: 0 }));

    const decision = scaler.evaluate();

    expect(decision.action).toBe('scale-up');
    expect(decision.targetAgents).toBeGreaterThan(4);
    expect(decision.reason).toContain('Queue depth ratio');
  });

  // --------------------------------------------------------------------------
  // Evaluation: scale-up on error rate (priority over queue)
  // --------------------------------------------------------------------------

  it('evaluate returns scale-up when error rate exceeded (priority over queue)', () => {
    // Both queue ratio and error rate exceed thresholds, but error rate has
    // higher priority per the evaluate logic.
    scaler.recordMetrics(
      makeMetrics({ queueDepth: 16, errorRate: 0.5, activeAgents: 4, idleAgents: 0 }),
    );
    scaler.recordMetrics(
      makeMetrics({ queueDepth: 16, errorRate: 0.5, activeAgents: 4, idleAgents: 0 }),
    );
    scaler.recordMetrics(
      makeMetrics({ queueDepth: 16, errorRate: 0.5, activeAgents: 4, idleAgents: 0 }),
    );

    const decision = scaler.evaluate();

    expect(decision.action).toBe('scale-up');
    // Error rate scale-up adds 2 (currentAgents + 2 = 6)
    expect(decision.targetAgents).toBe(6);
    expect(decision.reason).toContain('error rate');
  });

  // --------------------------------------------------------------------------
  // Evaluation: scale-down on idle ratio
  // --------------------------------------------------------------------------

  it('evaluate returns scale-down when idle ratio exceeded', () => {
    // 4 agents, 3 idle -> idleRatio = 0.75 > 0.5 threshold
    // excess = floor(3 * 0.5) = 1 -> target = 4 - 1 = 3
    scaler.recordMetrics(makeMetrics({ queueDepth: 0, activeAgents: 1, idleAgents: 3 }));
    scaler.recordMetrics(makeMetrics({ queueDepth: 0, activeAgents: 1, idleAgents: 3 }));
    scaler.recordMetrics(makeMetrics({ queueDepth: 0, activeAgents: 1, idleAgents: 3 }));

    const decision = scaler.evaluate();

    expect(decision.action).toBe('scale-down');
    expect(decision.targetAgents).toBeLessThan(4);
    expect(decision.reason).toContain('Idle ratio');
  });

  // --------------------------------------------------------------------------
  // Evaluation: maintain during cooldown
  // --------------------------------------------------------------------------

  it('evaluate returns maintain during cooldown period', async () => {
    // Record metrics that trigger a scale-up
    scaler.recordMetrics(makeMetrics({ queueDepth: 16, activeAgents: 4, idleAgents: 0 }));
    scaler.recordMetrics(makeMetrics({ queueDepth: 16, activeAgents: 4, idleAgents: 0 }));
    scaler.recordMetrics(makeMetrics({ queueDepth: 16, activeAgents: 4, idleAgents: 0 }));

    const firstDecision = scaler.evaluate();
    expect(firstDecision.action).toBe('scale-up');

    // Execute the scale-up to set lastScaleTime
    await scaler.execute(firstDecision);

    // Immediately evaluate again -- should be in cooldown
    const secondDecision = scaler.evaluate();
    expect(secondDecision.action).toBe('maintain');
    expect(secondDecision.reason).toContain('Cooldown');
  });

  // --------------------------------------------------------------------------
  // Evaluation: clamping to minAgents / maxAgents
  // --------------------------------------------------------------------------

  it('evaluate clamps target to minAgents / maxAgents bounds', () => {
    // Scale-up beyond maxAgents (10): huge queue to force high target
    scaler.recordMetrics(makeMetrics({ queueDepth: 100, activeAgents: 4, idleAgents: 0 }));
    scaler.recordMetrics(makeMetrics({ queueDepth: 100, activeAgents: 4, idleAgents: 0 }));
    scaler.recordMetrics(makeMetrics({ queueDepth: 100, activeAgents: 4, idleAgents: 0 }));

    const upDecision = scaler.evaluate();
    expect(upDecision.targetAgents).toBeLessThanOrEqual(10);

    // Scale-down: start a new scaler at minAgents so it cannot go below
    const minScaler = new DynamicScaler(2, {
      defaultPolicy: TEST_POLICY,
    });
    minScaler.recordMetrics(makeMetrics({ queueDepth: 0, activeAgents: 0, idleAgents: 2 }));
    minScaler.recordMetrics(makeMetrics({ queueDepth: 0, activeAgents: 0, idleAgents: 2 }));
    minScaler.recordMetrics(makeMetrics({ queueDepth: 0, activeAgents: 0, idleAgents: 2 }));

    const downDecision = minScaler.evaluate();
    // Already at minAgents, target should stay at minAgents -> maintain
    expect(downDecision.targetAgents).toBeGreaterThanOrEqual(2);
    minScaler.dispose();
  });

  // --------------------------------------------------------------------------
  // Execution: scale-up
  // --------------------------------------------------------------------------

  it('execute with scale-up updates currentAgents and scaleUpCount', async () => {
    const decision: ScalingDecision = {
      action: 'scale-up',
      currentAgents: 4,
      targetAgents: 6,
      reason: 'test scale-up',
      metrics: makeMetrics(),
      timestamp: Date.now(),
    };

    const event = await scaler.execute(decision);

    expect(event.success).toBe(true);
    expect(scaler.getCurrentAgents()).toBe(6);
    expect(scaler.getStats().scaleUpCount).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Execution: scale-down
  // --------------------------------------------------------------------------

  it('execute with scale-down updates currentAgents and scaleDownCount', async () => {
    const decision: ScalingDecision = {
      action: 'scale-down',
      currentAgents: 4,
      targetAgents: 3,
      reason: 'test scale-down',
      metrics: makeMetrics(),
      timestamp: Date.now(),
    };

    const event = await scaler.execute(decision);

    expect(event.success).toBe(true);
    expect(scaler.getCurrentAgents()).toBe(3);
    expect(scaler.getStats().scaleDownCount).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Execution: maintain
  // --------------------------------------------------------------------------

  it('execute with maintain does not change currentAgents', async () => {
    const decision: ScalingDecision = {
      action: 'maintain',
      currentAgents: 4,
      targetAgents: 4,
      reason: 'test maintain',
      metrics: makeMetrics(),
      timestamp: Date.now(),
    };

    const event = await scaler.execute(decision);

    expect(event.success).toBe(true);
    expect(scaler.getCurrentAgents()).toBe(4);
    expect(scaler.getStats().scaleUpCount).toBe(0);
    expect(scaler.getStats().scaleDownCount).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Execution: executor callback
  // --------------------------------------------------------------------------

  it('execute calls executor callback when provided', async () => {
    const executor = vi.fn().mockResolvedValue(true);

    const decision: ScalingDecision = {
      action: 'scale-up',
      currentAgents: 4,
      targetAgents: 6,
      reason: 'test executor',
      metrics: makeMetrics(),
      timestamp: Date.now(),
    };

    const event = await scaler.execute(decision, executor);

    expect(executor).toHaveBeenCalledWith(4, 6);
    expect(event.success).toBe(true);
    expect(scaler.getCurrentAgents()).toBe(6);
  });

  // --------------------------------------------------------------------------
  // Execution: executor returns false
  // --------------------------------------------------------------------------

  it('execute records failure when executor returns false', async () => {
    const executor = vi.fn().mockResolvedValue(false);

    const decision: ScalingDecision = {
      action: 'scale-up',
      currentAgents: 4,
      targetAgents: 6,
      reason: 'test executor fail',
      metrics: makeMetrics(),
      timestamp: Date.now(),
    };

    const event = await scaler.execute(decision, executor);

    expect(event.success).toBe(false);
    expect(event.error).toBe('Executor returned false');
    // Agent count should NOT change on failure
    expect(scaler.getCurrentAgents()).toBe(4);
  });

  // --------------------------------------------------------------------------
  // Execution: executor throws
  // --------------------------------------------------------------------------

  it('execute records failure when executor throws', async () => {
    const executor = vi.fn().mockRejectedValue(new Error('executor boom'));

    const decision: ScalingDecision = {
      action: 'scale-down',
      currentAgents: 4,
      targetAgents: 3,
      reason: 'test executor throw',
      metrics: makeMetrics(),
      timestamp: Date.now(),
    };

    const event = await scaler.execute(decision, executor);

    expect(event.success).toBe(false);
    expect(event.error).toBe('executor boom');
    // Agent count should NOT change on failure
    expect(scaler.getCurrentAgents()).toBe(4);
  });

  // --------------------------------------------------------------------------
  // Policy management
  // --------------------------------------------------------------------------

  it('setPolicy updates scaling policy', () => {
    const newPolicy: ScalingPolicy = {
      ...TEST_POLICY,
      name: 'aggressive',
      scaleUpQueueRatio: 1,
    };

    scaler.setPolicy(newPolicy);

    expect(scaler.getPolicy().name).toBe('aggressive');
    expect(scaler.getPolicy().scaleUpQueueRatio).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Statistics
  // --------------------------------------------------------------------------

  it('getStats returns correct statistics', async () => {
    // Execute a scale-up and a scale-down
    await scaler.execute({
      action: 'scale-up',
      currentAgents: 4,
      targetAgents: 6,
      reason: 'stats test',
      metrics: makeMetrics(),
      timestamp: Date.now(),
    });

    // Advance past cooldown
    vi.advanceTimersByTime(200);

    await scaler.execute({
      action: 'scale-down',
      currentAgents: 6,
      targetAgents: 5,
      reason: 'stats test',
      metrics: makeMetrics(),
      timestamp: Date.now(),
    });

    // Call evaluate to bump totalDecisions
    scaler.recordMetrics(makeMetrics());
    scaler.evaluate();

    const stats = scaler.getStats();

    expect(stats.scaleUpCount).toBe(1);
    expect(stats.scaleDownCount).toBe(1);
    expect(stats.totalDecisions).toBe(1);
    expect(stats.currentAgents).toBe(5);
    expect(stats.policyName).toBe('test-policy');
    expect(stats.recentEvents).toHaveLength(2);
    expect(stats.lastDecision).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // Disposal
  // --------------------------------------------------------------------------

  it('dispose clears history', () => {
    scaler.recordMetrics(makeMetrics());
    scaler.recordMetrics(makeMetrics());
    expect(scaler.getMetricsHistory()).toHaveLength(2);

    scaler.dispose();

    expect(scaler.getMetricsHistory()).toHaveLength(0);
  });
});

// ============================================================================
// Factory
// ============================================================================

describe('Factory', () => {
  it('createDynamicScaler creates with defaults', () => {
    const scaler = createDynamicScaler();

    expect(scaler).toBeInstanceOf(DynamicScaler);
    expect(scaler.getCurrentAgents()).toBe(2); // default initialAgents
    expect(scaler.getPolicy().name).toBe(DEFAULT_SCALING_POLICY.name);

    scaler.dispose();
  });

  it('createDynamicScaler accepts custom config', () => {
    const customPolicy: ScalingPolicy = {
      ...DEFAULT_SCALING_POLICY,
      name: 'custom',
      maxAgents: 20,
    };

    const scaler = createDynamicScaler(8, {
      defaultPolicy: customPolicy,
      metricsHistorySize: 200,
    });

    expect(scaler.getCurrentAgents()).toBe(8);
    expect(scaler.getPolicy().name).toBe('custom');
    expect(scaler.getPolicy().maxAgents).toBe(20);

    scaler.dispose();
  });
});
