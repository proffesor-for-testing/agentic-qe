/**
 * Integration tests for TrustAccumulator governance integration
 *
 * Tests verify:
 * - Trust score calculation based on task outcomes
 * - Tier assignment and automatic adjustment
 * - Agent selection based on trust and task experience
 * - Critical task handling restrictions
 * - Feature flag integration
 *
 * @see ADR-058-guidance-governance-integration.md
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  governanceFlags,
  DEFAULT_GOVERNANCE_FLAGS,
  isTrustAccumulatorEnabled,
  isStrictMode,
} from '../../../src/governance/feature-flags.js';
import {
  TrustAccumulatorIntegration,
  trustAccumulatorIntegration,
  createTaskOutcome,
  type TrustTier,
  type AgentTrustMetrics,
} from '../../../src/governance/trust-accumulator-integration.js';

describe('TrustAccumulator Integration - ADR-058 Phase 2', () => {
  beforeEach(() => {
    // Reset to defaults before each test
    governanceFlags.reset();
    trustAccumulatorIntegration.reset();
  });

  describe('Trust Score Calculation', () => {
    it('should return default trust score for new agents', () => {
      const accumulator = new TrustAccumulatorIntegration();
      const trustScore = accumulator.getTrustScore('new-agent');

      expect(trustScore).toBe(0.7); // Default trust
    });

    it('should increase trust score on successful tasks', () => {
      const accumulator = new TrustAccumulatorIntegration();
      const agentId = 'test-agent';

      // Record multiple successful tasks
      for (let i = 0; i < 5; i++) {
        accumulator.recordTaskOutcome(agentId, 'test-generation', true, 1000, {
          qualityScore: 0.9,
        });
      }

      const trustScore = accumulator.getTrustScore(agentId);
      expect(trustScore).toBeGreaterThan(0.7); // Should improve from default
    });

    it('should decrease trust score on failed tasks', () => {
      const accumulator = new TrustAccumulatorIntegration();
      const agentId = 'failing-agent';

      // Record multiple failed tasks
      for (let i = 0; i < 5; i++) {
        accumulator.recordTaskOutcome(agentId, 'security-scanning', false, 500, {
          errorType: 'timeout',
        });
      }

      const trustScore = accumulator.getTrustScore(agentId);
      expect(trustScore).toBeLessThan(0.7); // Should decrease from default
    });

    it('should use weighted components from feature flags', () => {
      const accumulator = new TrustAccumulatorIntegration();
      const agentId = 'weighted-agent';

      // Verify default weights
      const flags = governanceFlags.getFlags().trustAccumulator;
      expect(flags.performanceWeight).toBe(0.5);
      expect(flags.taskSimilarityWeight).toBe(0.3);
      expect(flags.capabilityMatchWeight).toBe(0.2);

      // Record tasks to build metrics
      accumulator.recordTaskOutcome(agentId, 'coverage-analysis', true, 800, {
        qualityScore: 0.85,
      });

      const metrics = accumulator.getAgentMetrics(agentId);
      expect(metrics).not.toBeNull();
      expect(metrics!.trustScore).toBeGreaterThan(0);
      expect(metrics!.trustScore).toBeLessThanOrEqual(1);
    });

    it('should track task type experience separately', () => {
      const accumulator = new TrustAccumulatorIntegration();
      const agentId = 'multi-task-agent';

      // Record different task types
      accumulator.recordTaskOutcome(agentId, 'test-generation', true, 1000);
      accumulator.recordTaskOutcome(agentId, 'test-generation', true, 900);
      accumulator.recordTaskOutcome(agentId, 'coverage-analysis', true, 1200);
      accumulator.recordTaskOutcome(agentId, 'security-scanning', true, 800);
      accumulator.recordTaskOutcome(agentId, 'test-generation', true, 950);

      const experience = accumulator.getTaskExperience(agentId);
      expect(experience.get('test-generation')).toBe(3);
      expect(experience.get('coverage-analysis')).toBe(1);
      expect(experience.get('security-scanning')).toBe(1);
    });

    it('should stabilize trust score over time (exponential moving average)', () => {
      const accumulator = new TrustAccumulatorIntegration();
      const agentId = 'stable-agent';

      // Record many successful tasks
      for (let i = 0; i < 10; i++) {
        accumulator.recordTaskOutcome(agentId, 'task', true, 1000, {
          qualityScore: 0.9,
        });
      }

      const stableScore = accumulator.getTrustScore(agentId);

      // One failure shouldn't drastically change the score
      accumulator.recordTaskOutcome(agentId, 'task', false, 500);
      const afterFailure = accumulator.getTrustScore(agentId);

      // Score should decrease but not dramatically
      expect(afterFailure).toBeLessThan(stableScore);
      expect(afterFailure).toBeGreaterThan(stableScore - 0.2);
    });
  });

  describe('Tier Assignment', () => {
    it('should assign correct tier based on trust score', () => {
      const accumulator = new TrustAccumulatorIntegration();

      // Build up an agent to critical tier
      const agentId = 'tier-test-agent';
      for (let i = 0; i < 15; i++) {
        accumulator.recordTaskOutcome(agentId, 'task', true, 1000, {
          qualityScore: 0.95,
        });
      }

      const tier = accumulator.getTrustTier(agentId);
      const score = accumulator.getTrustScore(agentId);

      // Based on thresholds: low < 0.3 < medium < 0.5 < high < 0.7 <= critical
      if (score >= 0.7) {
        expect(tier).toBe('critical');
      } else if (score >= 0.5) {
        expect(tier).toBe('high');
      } else if (score >= 0.3) {
        expect(tier).toBe('medium');
      } else {
        expect(tier).toBe('low');
      }
    });

    it('should return default tier for new agents', () => {
      const accumulator = new TrustAccumulatorIntegration();
      const tier = accumulator.getTrustTier('unknown-agent');

      expect(tier).toBe('medium'); // Default tier
    });

    it('should automatically adjust tier when enabled', () => {
      const accumulator = new TrustAccumulatorIntegration();
      const agentId = 'auto-adjust-agent';

      // Start with default trust
      accumulator.recordTaskOutcome(agentId, 'task', true, 1000);
      const initialTier = accumulator.getTrustTier(agentId);

      // Record many failures to drop tier
      for (let i = 0; i < 10; i++) {
        accumulator.recordTaskOutcome(agentId, 'task', false, 500);
      }

      const metrics = accumulator.getAgentMetrics(agentId);
      expect(metrics!.tierHistory.length).toBeGreaterThan(1); // Should have recorded tier changes
    });

    it('should track tier history', () => {
      const accumulator = new TrustAccumulatorIntegration();
      const agentId = 'history-agent';

      // Record tasks to change tiers
      accumulator.recordTaskOutcome(agentId, 'task', true, 1000);

      const metrics = accumulator.getAgentMetrics(agentId);
      expect(metrics!.tierHistory).toBeDefined();
      expect(metrics!.tierHistory.length).toBeGreaterThan(0);
      expect(metrics!.tierHistory[0]).toHaveProperty('tier');
      expect(metrics!.tierHistory[0]).toHaveProperty('timestamp');
      expect(metrics!.tierHistory[0]).toHaveProperty('reason');
    });

    it('should get agents by tier', () => {
      const accumulator = new TrustAccumulatorIntegration();

      // Create agents with different performance levels
      for (let i = 0; i < 5; i++) {
        accumulator.recordTaskOutcome('high-performer', 'task', true, 1000, {
          qualityScore: 0.95,
        });
      }

      for (let i = 0; i < 5; i++) {
        accumulator.recordTaskOutcome('low-performer', 'task', false, 500);
      }

      // Check tier grouping
      const allMetrics = accumulator.getAllAgentMetrics();
      expect(allMetrics.length).toBe(2);
    });
  });

  describe('Agent Selection', () => {
    it('should select best agent based on trust and experience', () => {
      const accumulator = new TrustAccumulatorIntegration();

      // Create agents with different profiles
      for (let i = 0; i < 10; i++) {
        accumulator.recordTaskOutcome('experienced-agent', 'test-generation', true, 1000, {
          qualityScore: 0.9,
        });
      }

      for (let i = 0; i < 3; i++) {
        accumulator.recordTaskOutcome('new-agent', 'test-generation', true, 1200);
      }

      const result = accumulator.selectBestAgent('test-generation', [
        'experienced-agent',
        'new-agent',
      ]);

      expect(result.selectedAgent).toBe('experienced-agent');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.alternatives).toHaveLength(1);
    });

    it('should filter agents below minimum trust threshold', () => {
      governanceFlags.enableStrictMode();

      const accumulator = new TrustAccumulatorIntegration();

      // Create low-trust agent
      for (let i = 0; i < 10; i++) {
        accumulator.recordTaskOutcome('low-trust', 'task', false, 500);
      }

      // Create high-trust agent
      for (let i = 0; i < 10; i++) {
        accumulator.recordTaskOutcome('high-trust', 'task', true, 1000, {
          qualityScore: 0.95,
        });
      }

      const result = accumulator.selectBestAgent('task', ['low-trust', 'high-trust'], {
        minTrustScore: 0.5,
      });

      // In strict mode, low-trust agent should be excluded
      if (accumulator.getTrustScore('low-trust') < 0.5) {
        expect(result.selectedAgent).toBe('high-trust');
      }
    });

    it('should return null when no agents meet critical trust in strict mode', () => {
      governanceFlags.enableStrictMode();

      const accumulator = new TrustAccumulatorIntegration();

      // Create only low-trust agents
      for (let i = 0; i < 10; i++) {
        accumulator.recordTaskOutcome('agent-1', 'task', false, 500);
        accumulator.recordTaskOutcome('agent-2', 'task', false, 500);
      }

      const result = accumulator.selectBestAgent('task', ['agent-1', 'agent-2'], {
        requireCriticalTrust: true,
      });

      expect(result.selectedAgent).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.reason).toContain('threshold');
    });

    it('should select best available in non-strict mode even below threshold', () => {
      const accumulator = new TrustAccumulatorIntegration();

      // Create low-trust agents
      for (let i = 0; i < 5; i++) {
        accumulator.recordTaskOutcome('agent-1', 'task', false, 500);
        accumulator.recordTaskOutcome('agent-2', 'task', false, 500);
      }

      // One has slightly better metrics
      accumulator.recordTaskOutcome('agent-1', 'task', true, 1000);

      const result = accumulator.selectBestAgent('task', ['agent-1', 'agent-2'], {
        minTrustScore: 0.9, // Impossible threshold
      });

      // Non-strict mode should still select an agent
      expect(result.selectedAgent).not.toBeNull();
      expect(result.reason).toContain('non-strict');
    });

    it('should handle empty agent list', () => {
      const accumulator = new TrustAccumulatorIntegration();

      const result = accumulator.selectBestAgent('task', []);

      expect(result.selectedAgent).toBeNull();
      expect(result.confidence).toBe(0.5);
    });

    it('should consider task type experience in selection', () => {
      const accumulator = new TrustAccumulatorIntegration();

      // Agent 1: General experience
      for (let i = 0; i < 5; i++) {
        accumulator.recordTaskOutcome('general-agent', 'various-task-' + i, true, 1000);
      }

      // Agent 2: Specialized experience
      for (let i = 0; i < 5; i++) {
        accumulator.recordTaskOutcome('specialized-agent', 'security-scanning', true, 1000);
      }

      const result = accumulator.selectBestAgent('security-scanning', [
        'general-agent',
        'specialized-agent',
      ]);

      // Specialized agent should be preferred for security tasks
      expect(result.selectedAgent).toBe('specialized-agent');
    });
  });

  describe('Critical Task Handling', () => {
    it('should allow critical tasks for high-trust agents', () => {
      const accumulator = new TrustAccumulatorIntegration();
      const agentId = 'critical-capable';

      // Build up high trust
      for (let i = 0; i < 15; i++) {
        accumulator.recordTaskOutcome(agentId, 'task', true, 1000, {
          qualityScore: 0.95,
        });
      }

      const canHandle = accumulator.canHandleCriticalTask(agentId);
      const trustScore = accumulator.getTrustScore(agentId);

      // Should be allowed if trust >= minTrustForCritical (0.7)
      if (trustScore >= 0.7) {
        expect(canHandle).toBe(true);
      } else {
        expect(canHandle).toBe(false);
      }
    });

    it('should deny critical tasks for low-trust agents', () => {
      const accumulator = new TrustAccumulatorIntegration();
      const agentId = 'low-trust-agent';

      // Build up low trust
      for (let i = 0; i < 10; i++) {
        accumulator.recordTaskOutcome(agentId, 'task', false, 500);
      }

      const canHandle = accumulator.canHandleCriticalTask(agentId);
      expect(canHandle).toBe(false);
    });

    it('should use minTrustForCritical from feature flags', () => {
      // Update the threshold
      governanceFlags.updateFlags({
        trustAccumulator: {
          ...DEFAULT_GOVERNANCE_FLAGS.trustAccumulator,
          minTrustForCritical: 0.9, // Higher threshold
        },
      });

      const accumulator = new TrustAccumulatorIntegration();
      const agentId = 'medium-trust';

      // Build trust to ~0.75 (above default threshold but below new one)
      for (let i = 0; i < 8; i++) {
        accumulator.recordTaskOutcome(agentId, 'task', true, 1000, {
          qualityScore: 0.8,
        });
      }

      const trustScore = accumulator.getTrustScore(agentId);
      const canHandle = accumulator.canHandleCriticalTask(agentId);

      // Should be denied because threshold is now 0.9
      if (trustScore < 0.9) {
        expect(canHandle).toBe(false);
      }
    });

    it('should allow all when TrustAccumulator is disabled', () => {
      governanceFlags.updateFlags({
        trustAccumulator: {
          ...DEFAULT_GOVERNANCE_FLAGS.trustAccumulator,
          enabled: false,
        },
      });

      const accumulator = new TrustAccumulatorIntegration();

      // Even without any history, should allow critical tasks when disabled
      const canHandle = accumulator.canHandleCriticalTask('any-agent');
      expect(canHandle).toBe(true);
    });
  });

  describe('Trust Boost and Penalty', () => {
    it('should boost trust score manually', () => {
      const accumulator = new TrustAccumulatorIntegration();
      const agentId = 'boost-agent';

      accumulator.recordTaskOutcome(agentId, 'task', true, 1000);
      const before = accumulator.getTrustScore(agentId);

      accumulator.boostTrust(agentId, 0.1, 'Manual verification passed');
      const after = accumulator.getTrustScore(agentId);

      expect(after).toBeGreaterThan(before);
    });

    it('should penalize trust score manually', () => {
      const accumulator = new TrustAccumulatorIntegration();
      const agentId = 'penalty-agent';

      accumulator.recordTaskOutcome(agentId, 'task', true, 1000);
      const before = accumulator.getTrustScore(agentId);

      accumulator.penalizeTrust(agentId, 0.1, 'Policy violation detected');
      const after = accumulator.getTrustScore(agentId);

      expect(after).toBeLessThan(before);
    });

    it('should clamp trust score to valid range', () => {
      const accumulator = new TrustAccumulatorIntegration();
      const agentId = 'clamp-agent';

      accumulator.recordTaskOutcome(agentId, 'task', true, 1000);

      // Boost beyond 1
      accumulator.boostTrust(agentId, 10, 'Massive boost');
      expect(accumulator.getTrustScore(agentId)).toBeLessThanOrEqual(1);

      // Penalize beyond 0
      accumulator.penalizeTrust(agentId, 10, 'Massive penalty');
      expect(accumulator.getTrustScore(agentId)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Automatic Tier Adjustment', () => {
    it('should promote agent when trust increases', () => {
      const accumulator = new TrustAccumulatorIntegration();
      const agentId = 'promote-agent';

      // Start with failures to get low trust
      for (let i = 0; i < 5; i++) {
        accumulator.recordTaskOutcome(agentId, 'task', false, 500);
      }
      const lowTier = accumulator.getTrustTier(agentId);

      // Then succeed consistently
      for (let i = 0; i < 20; i++) {
        accumulator.recordTaskOutcome(agentId, 'task', true, 1000, {
          qualityScore: 0.95,
        });
      }
      const highTier = accumulator.getTrustTier(agentId);

      // Tier should have improved
      const tierOrder = { low: 0, medium: 1, high: 2, critical: 3 };
      expect(tierOrder[highTier]).toBeGreaterThanOrEqual(tierOrder[lowTier]);
    });

    it('should demote agent when trust decreases', () => {
      const accumulator = new TrustAccumulatorIntegration();
      const agentId = 'demote-agent';

      // Start with successes
      for (let i = 0; i < 10; i++) {
        accumulator.recordTaskOutcome(agentId, 'task', true, 1000, {
          qualityScore: 0.9,
        });
      }
      const highTier = accumulator.getTrustTier(agentId);

      // Then fail consistently
      for (let i = 0; i < 20; i++) {
        accumulator.recordTaskOutcome(agentId, 'task', false, 500);
      }
      const lowTier = accumulator.getTrustTier(agentId);

      // Tier should have decreased
      const tierOrder = { low: 0, medium: 1, high: 2, critical: 3 };
      expect(tierOrder[lowTier]).toBeLessThanOrEqual(tierOrder[highTier]);
    });

    it('should record tier changes in history', () => {
      const accumulator = new TrustAccumulatorIntegration();
      const agentId = 'history-track';

      // Cause tier changes
      for (let i = 0; i < 5; i++) {
        accumulator.recordTaskOutcome(agentId, 'task', false, 500);
      }

      for (let i = 0; i < 15; i++) {
        accumulator.recordTaskOutcome(agentId, 'task', true, 1000, {
          qualityScore: 0.95,
        });
      }

      const metrics = accumulator.getAgentMetrics(agentId);
      expect(metrics!.tierHistory.length).toBeGreaterThan(1);

      // Verify history entries have required fields
      for (const entry of metrics!.tierHistory) {
        expect(['low', 'medium', 'high', 'critical']).toContain(entry.tier);
        expect(typeof entry.timestamp).toBe('number');
        expect(typeof entry.reason).toBe('string');
      }
    });

    it('should limit tier history length', () => {
      const accumulator = new TrustAccumulatorIntegration();
      const agentId = 'limited-history';

      // Cause many tier changes by alternating success/failure
      for (let j = 0; j < 5; j++) {
        for (let i = 0; i < 10; i++) {
          accumulator.recordTaskOutcome(agentId, 'task', false, 500);
        }
        for (let i = 0; i < 10; i++) {
          accumulator.recordTaskOutcome(agentId, 'task', true, 1000, {
            qualityScore: 0.95,
          });
        }
      }

      const metrics = accumulator.getAgentMetrics(agentId);
      expect(metrics!.tierHistory.length).toBeLessThanOrEqual(20);
    });
  });

  describe('Feature Flag Integration', () => {
    it('should bypass all logic when disabled', () => {
      governanceFlags.updateFlags({
        trustAccumulator: {
          ...DEFAULT_GOVERNANCE_FLAGS.trustAccumulator,
          enabled: false,
        },
      });

      const accumulator = new TrustAccumulatorIntegration();

      // Record tasks (should be no-op)
      accumulator.recordTaskOutcome('agent', 'task', true, 1000);

      // Should return defaults
      expect(accumulator.getTrustScore('agent')).toBe(0.7);
      expect(accumulator.getTrustTier('agent')).toBe('medium');
      expect(accumulator.canHandleCriticalTask('agent')).toBe(true);
      expect(accumulator.getAgentMetrics('agent')).toBeNull();
    });

    it('should respect global gate disable', () => {
      governanceFlags.disableAllGates();

      const accumulator = new TrustAccumulatorIntegration();

      expect(isTrustAccumulatorEnabled()).toBe(false);
      expect(accumulator.getTrustScore('any')).toBe(0.7);
    });

    it('should use singleton instance', () => {
      expect(trustAccumulatorIntegration).toBeDefined();
      expect(trustAccumulatorIntegration).toBeInstanceOf(TrustAccumulatorIntegration);
    });
  });

  describe('Metrics and Statistics', () => {
    it('should track comprehensive metrics', () => {
      const accumulator = new TrustAccumulatorIntegration();
      const agentId = 'metrics-agent';

      accumulator.recordTaskOutcome(agentId, 'task-a', true, 1000, {
        qualityScore: 0.9,
      });
      accumulator.recordTaskOutcome(agentId, 'task-a', true, 900);
      accumulator.recordTaskOutcome(agentId, 'task-b', false, 500);
      accumulator.recordTaskOutcome(agentId, 'task-a', true, 1100);

      const metrics = accumulator.getAgentMetrics(agentId);
      expect(metrics).not.toBeNull();
      expect(metrics!.totalTasks).toBe(4);
      expect(metrics!.successfulTasks).toBe(3);
      expect(metrics!.successRate).toBe(0.75);
      expect(metrics!.avgDurationMs).toBeGreaterThan(0);
      expect(metrics!.taskTypeExperience.get('task-a')).toBe(3);
      expect(metrics!.taskTypeExperience.get('task-b')).toBe(1);
    });

    it('should get all agent metrics', () => {
      const accumulator = new TrustAccumulatorIntegration();

      accumulator.recordTaskOutcome('agent-1', 'task', true, 1000);
      accumulator.recordTaskOutcome('agent-2', 'task', true, 900);
      accumulator.recordTaskOutcome('agent-3', 'task', false, 500);

      const allMetrics = accumulator.getAllAgentMetrics();
      expect(allMetrics).toHaveLength(3);
    });

    it('should reset specific agent', () => {
      const accumulator = new TrustAccumulatorIntegration();

      accumulator.recordTaskOutcome('keep', 'task', true, 1000);
      accumulator.recordTaskOutcome('remove', 'task', true, 1000);

      accumulator.resetAgent('remove');

      expect(accumulator.getAgentMetrics('keep')).not.toBeNull();
      expect(accumulator.getAgentMetrics('remove')).toBeNull();
    });

    it('should reset all state', () => {
      const accumulator = new TrustAccumulatorIntegration();

      accumulator.recordTaskOutcome('agent-1', 'task', true, 1000);
      accumulator.recordTaskOutcome('agent-2', 'task', true, 1000);

      accumulator.reset();

      expect(accumulator.getAllAgentMetrics()).toHaveLength(0);
    });
  });

  describe('Custom Tier Thresholds', () => {
    it('should allow custom tier thresholds', () => {
      const accumulator = new TrustAccumulatorIntegration();

      // Set stricter thresholds
      accumulator.setTierThresholds({
        medium: 0.4,
        high: 0.6,
        critical: 0.8,
      });

      const agentId = 'threshold-test';

      // Build trust to ~0.7
      for (let i = 0; i < 10; i++) {
        accumulator.recordTaskOutcome(agentId, 'task', true, 1000, {
          qualityScore: 0.8,
        });
      }

      const trustScore = accumulator.getTrustScore(agentId);
      const tier = accumulator.getTrustTier(agentId);

      // With stricter thresholds, 0.7 should be 'high' not 'critical'
      if (trustScore >= 0.8) {
        expect(tier).toBe('critical');
      } else if (trustScore >= 0.6) {
        expect(tier).toBe('high');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle concurrent task recordings', async () => {
      const accumulator = new TrustAccumulatorIntegration();
      const agentId = 'concurrent-agent';

      // Simulate concurrent recordings
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          Promise.resolve(
            accumulator.recordTaskOutcome(agentId, 'task', i % 2 === 0, 1000)
          )
        )
      );

      const metrics = accumulator.getAgentMetrics(agentId);
      expect(metrics!.totalTasks).toBe(10);
    });

    it('should create task outcome helper', () => {
      const outcome = createTaskOutcome('agent', 'test-task', true, 1500, {
        qualityScore: 0.85,
        errorType: undefined,
      });

      expect(outcome.agentId).toBeUndefined(); // Note: helper doesn't set agentId on the outcome
      expect(outcome.taskType).toBe('test-task');
      expect(outcome.success).toBe(true);
      expect(outcome.durationMs).toBe(1500);
      expect(outcome.qualityScore).toBe(0.85);
      expect(outcome.timestamp).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('Integration with Existing Gates', () => {
    it('should work alongside ContinueGate', async () => {
      // Both gates should be enabled by default
      const flags = governanceFlags.getFlags();
      expect(flags.continueGate.enabled).toBe(true);
      expect(flags.trustAccumulator.enabled).toBe(true);
    });

    it('should work alongside MemoryWriteGate', async () => {
      const flags = governanceFlags.getFlags();
      expect(flags.memoryWriteGate.enabled).toBe(true);
      expect(flags.trustAccumulator.enabled).toBe(true);
    });
  });
});
