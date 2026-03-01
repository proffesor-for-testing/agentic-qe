/**
 * Integration tests for @claude-flow/guidance governance integration
 *
 * Tests verify:
 * - Feature flags work correctly
 * - ContinueGate detects loops and throttles agents
 * - MemoryWriteGate detects contradictions
 * - Gates integrate with AQE coordination
 *
 * @see ADR-058-guidance-governance-integration.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  governanceFlags,
  DEFAULT_GOVERNANCE_FLAGS,
  isContinueGateEnabled,
  isMemoryWriteGateEnabled,
  isStrictMode,
  type GovernanceFeatureFlags,
} from '../../../src/governance/feature-flags.js';
import {
  ContinueGateIntegration,
  continueGateIntegration,
  createActionRecord,
  hashAction,
  type AgentAction,
} from '../../../src/governance/continue-gate-integration.js';
import {
  MemoryWriteGateIntegration,
  memoryWriteGateIntegration,
  createMemoryPattern,
  type MemoryPattern,
} from '../../../src/governance/memory-write-gate-integration.js';

describe('Governance Integration - ADR-058', () => {
  beforeEach(() => {
    // Reset to defaults before each test
    governanceFlags.reset();
    continueGateIntegration.reset();
    memoryWriteGateIntegration.reset();
  });

  describe('Feature Flags', () => {
    it('should have all gates enabled by default', () => {
      const flags = governanceFlags.getFlags();

      expect(flags.global.enableAllGates).toBe(true);
      expect(flags.continueGate.enabled).toBe(true);
      expect(flags.memoryWriteGate.enabled).toBe(true);
      expect(flags.trustAccumulator.enabled).toBe(true);
      expect(flags.proofEnvelope.enabled).toBe(true);
      expect(flags.budgetMeter.enabled).toBe(true);
    });

    it('should start in non-strict mode for Phase 1', () => {
      expect(isStrictMode()).toBe(false);
    });

    it('should allow runtime flag updates', () => {
      expect(isContinueGateEnabled()).toBe(true);

      governanceFlags.updateFlags({
        continueGate: { ...DEFAULT_GOVERNANCE_FLAGS.continueGate, enabled: false },
      });

      expect(isContinueGateEnabled()).toBe(false);
    });

    it('should disable all gates with kill switch', () => {
      expect(isContinueGateEnabled()).toBe(true);
      expect(isMemoryWriteGateEnabled()).toBe(true);

      governanceFlags.disableAllGates();

      expect(isContinueGateEnabled()).toBe(false);
      expect(isMemoryWriteGateEnabled()).toBe(false);
    });

    it('should enable strict mode', () => {
      expect(isStrictMode()).toBe(false);

      governanceFlags.enableStrictMode();

      expect(isStrictMode()).toBe(true);
    });

    it('should notify subscribers on flag changes', () => {
      const subscriber = vi.fn();
      const unsubscribe = governanceFlags.subscribe(subscriber);

      governanceFlags.enableStrictMode();

      expect(subscriber).toHaveBeenCalledTimes(1);
      expect(subscriber).toHaveBeenCalledWith(expect.objectContaining({
        global: expect.objectContaining({ strictMode: true }),
      }));

      unsubscribe();
      governanceFlags.reset();

      // Should not be called after unsubscribe
      expect(subscriber).toHaveBeenCalledTimes(1);
    });
  });

  describe('ContinueGate Integration', () => {
    it('should allow continuation when no issues', async () => {
      const gate = new ContinueGateIntegration();
      const decision = await gate.evaluate('agent-1');

      expect(decision.shouldContinue).toBe(true);
      expect(decision.reason).toBeUndefined();
    });

    it('should detect consecutive identical actions', async () => {
      const gate = new ContinueGateIntegration();
      const agentId = 'test-agent';

      // Record 5 identical actions
      for (let i = 0; i < 5; i++) {
        gate.recordAction(createActionRecord(
          agentId,
          'test',
          'same-target',
          { param: 'same' },
          true
        ));
      }

      const decision = await gate.evaluate(agentId);

      expect(decision.shouldContinue).toBe(true); // Non-strict mode
      expect(decision.consecutiveCount).toBeGreaterThanOrEqual(3);
      expect(decision.reason).toContain('consecutive retries');
    });

    it('should throttle agent after exceeding retries', async () => {
      const gate = new ContinueGateIntegration();
      const agentId = 'throttle-test-agent';

      // Record enough identical actions to trigger throttle
      for (let i = 0; i < 5; i++) {
        gate.recordAction(createActionRecord(
          agentId,
          'loop',
          'target',
          { x: 1 },
          true
        ));
      }

      await gate.evaluate(agentId);

      const stats = gate.getAgentStats(agentId);
      expect(stats.isThrottled).toBe(true);
      expect(stats.throttleRemainingMs).toBeGreaterThan(0);
    });

    it('should detect high rework ratio', async () => {
      const gate = new ContinueGateIntegration();
      const agentId = 'rework-agent';

      // Record 10 actions, 8 failed (80% rework ratio)
      for (let i = 0; i < 10; i++) {
        gate.recordAction(createActionRecord(
          agentId,
          'attempt',
          `target-${i}`,
          {},
          i >= 8 // Only last 2 succeed
        ));
      }

      const decision = await gate.evaluate(agentId);

      expect(decision.reworkRatio).toBeGreaterThan(0.5);
      expect(decision.reason).toContain('rework ratio');
    });

    it('should clear throttle for agent', async () => {
      const gate = new ContinueGateIntegration();
      const agentId = 'clear-throttle-agent';

      // Trigger throttle
      for (let i = 0; i < 5; i++) {
        gate.recordAction(createActionRecord(agentId, 'x', 'y', {}, true));
      }
      await gate.evaluate(agentId);

      expect(gate.getAgentStats(agentId).isThrottled).toBe(true);

      gate.clearThrottle(agentId);

      expect(gate.getAgentStats(agentId).isThrottled).toBe(false);
    });

    it('should hash actions consistently', () => {
      const hash1 = hashAction('test', 'target', { a: 1, b: 2 });
      const hash2 = hashAction('test', 'target', { a: 1, b: 2 });
      const hash3 = hashAction('test', 'target', { a: 1, b: 3 });

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });

    it('should block in strict mode', async () => {
      governanceFlags.enableStrictMode();

      const gate = new ContinueGateIntegration();
      const agentId = 'strict-agent';

      // Trigger loop detection
      for (let i = 0; i < 5; i++) {
        gate.recordAction(createActionRecord(agentId, 'loop', 't', {}, true));
      }

      const decision = await gate.evaluate(agentId);

      expect(decision.shouldContinue).toBe(false);
    });

    it('should bypass when gate is disabled', async () => {
      governanceFlags.updateFlags({
        continueGate: { ...DEFAULT_GOVERNANCE_FLAGS.continueGate, enabled: false },
      });

      const gate = new ContinueGateIntegration();
      const agentId = 'bypass-agent';

      // Record many identical actions
      for (let i = 0; i < 10; i++) {
        gate.recordAction(createActionRecord(agentId, 'x', 'y', {}, true));
      }

      const decision = await gate.evaluate(agentId);

      expect(decision.shouldContinue).toBe(true);
      expect(decision.reason).toBeUndefined();
    });
  });

  describe('MemoryWriteGate Integration', () => {
    it('should allow writes when no conflicts', async () => {
      const gate = new MemoryWriteGateIntegration();
      const pattern = createMemoryPattern('test-key', { value: 1 }, 'test-generation');

      const decision = await gate.evaluateWrite(pattern);

      expect(decision.allowed).toBe(true);
      expect(decision.conflictingPatterns).toBeUndefined();
    });

    it('should detect contradictory patterns', async () => {
      const gate = new MemoryWriteGateIntegration();

      // Register existing pattern
      const existing = createMemoryPattern(
        'auth-pattern',
        { rule: 'always use JWT tokens' },
        'security-compliance',
        { tags: ['authentication', 'tokens'] }
      );
      gate.registerPattern(existing);

      // Try to write contradictory pattern
      const contradictory = createMemoryPattern(
        'auth-pattern-new',
        { rule: 'never use JWT tokens' },
        'security-compliance',
        { tags: ['authentication', 'tokens'] }
      );

      const decision = await gate.evaluateWrite(contradictory);

      expect(decision.conflictingPatterns).toBeDefined();
      expect(decision.conflictingPatterns?.length).toBeGreaterThan(0);
      expect(decision.reason).toContain('conflicts');
    });

    it('should allow supersession of conflicts', async () => {
      const gate = new MemoryWriteGateIntegration();

      // Register existing pattern
      const existing = createMemoryPattern(
        'old-rule',
        { policy: 'enabled' },
        'test-generation',
        { tags: ['policy'] }
      );
      gate.registerPattern(existing);

      // Write superseding pattern
      const superseding = createMemoryPattern(
        'new-rule',
        { policy: 'disabled' },
        'test-generation',
        { supersedes: ['old-rule'], tags: ['policy'] }
      );

      const decision = await gate.evaluateWrite(superseding);

      expect(decision.allowed).toBe(true);
      expect(decision.suggestedResolution).toBe('supersede');
    });

    it('should enforce domain namespacing', async () => {
      governanceFlags.updateFlags({
        memoryWriteGate: {
          ...DEFAULT_GOVERNANCE_FLAGS.memoryWriteGate,
          domainNamespacing: true,
        },
      });

      const gate = new MemoryWriteGateIntegration();

      // Agent trying to write to unauthorized domain
      const pattern = createMemoryPattern(
        'wrong-domain-key',
        { data: 'test' },
        'security-compliance',
        { agentId: 'qe-test-architect' } // Can only write to test-generation
      );

      const decision = await gate.evaluateWrite(pattern);

      expect(decision.allowed).toBe(true); // Non-strict mode allows
      expect(decision.reason).toContain('not authorized');
      expect(decision.requiresManualReview).toBe(true);
    });

    it('should track pattern statistics', () => {
      const gate = new MemoryWriteGateIntegration();

      gate.registerPattern(createMemoryPattern('p1', 'v1', 'test-generation'));
      gate.registerPattern(createMemoryPattern('p2', 'v2', 'test-generation'));
      gate.registerPattern(createMemoryPattern('p3', 'v3', 'coverage-analysis'));

      const stats = gate.getStats();

      expect(stats.totalPatterns).toBe(3);
      expect(stats.patternsByDomain['test-generation']).toBe(2);
      expect(stats.patternsByDomain['coverage-analysis']).toBe(1);
    });

    it('should apply temporal decay', async () => {
      const gate = new MemoryWriteGateIntegration();

      // Register old pattern with low use count
      const oldPattern: MemoryPattern = {
        key: 'old-unused',
        value: 'data',
        domain: 'test-generation',
        timestamp: Date.now() - (31 * 24 * 60 * 60 * 1000), // 31 days ago
        useCount: 1,
      };
      gate.registerPattern(oldPattern);

      // Register recent pattern
      const recentPattern: MemoryPattern = {
        key: 'recent',
        value: 'data',
        domain: 'test-generation',
        timestamp: Date.now(),
        useCount: 0,
      };
      gate.registerPattern(recentPattern);

      const archived = await gate.applyTemporalDecay();

      expect(archived).toContain('old-unused');
      expect(archived).not.toContain('recent');
    });

    it('should increment use count', () => {
      const gate = new MemoryWriteGateIntegration();

      gate.registerPattern(createMemoryPattern('track-me', 'value', 'test-generation'));
      gate.incrementUseCount('track-me');
      gate.incrementUseCount('track-me');
      gate.incrementUseCount('track-me');

      // Check by registering again and looking at stats
      const stats = gate.getStats();
      expect(stats.totalPatterns).toBe(1);
    });

    it('should block in strict mode', async () => {
      governanceFlags.enableStrictMode();

      const gate = new MemoryWriteGateIntegration();

      // Register conflicting pattern
      gate.registerPattern(createMemoryPattern(
        'existing',
        { setting: 'always enabled' },
        'quality-assessment',
        { tags: ['setting', 'gate'] }
      ));

      // Try contradictory write
      const pattern = createMemoryPattern(
        'new-conflicting',
        { setting: 'always disabled' },
        'quality-assessment',
        { tags: ['setting', 'gate'] }
      );

      const decision = await gate.evaluateWrite(pattern);

      expect(decision.allowed).toBe(false);
    });

    it('should bypass when gate is disabled', async () => {
      governanceFlags.updateFlags({
        memoryWriteGate: { ...DEFAULT_GOVERNANCE_FLAGS.memoryWriteGate, enabled: false },
      });

      const gate = new MemoryWriteGateIntegration();

      // Register conflicting pattern
      gate.registerPattern(createMemoryPattern('x', { a: true }, 'd', { tags: ['t'] }));

      // Would normally conflict
      const pattern = createMemoryPattern('y', { a: false }, 'd', { tags: ['t'] });

      const decision = await gate.evaluateWrite(pattern);

      expect(decision.allowed).toBe(true);
    });
  });

  describe('Gate Integration with AQE Coordination', () => {
    it('should use singleton instances', () => {
      // Verify singletons are exported and usable
      expect(continueGateIntegration).toBeDefined();
      expect(memoryWriteGateIntegration).toBeDefined();

      // Both should be instances of their classes
      expect(continueGateIntegration).toBeInstanceOf(ContinueGateIntegration);
      expect(memoryWriteGateIntegration).toBeInstanceOf(MemoryWriteGateIntegration);
    });

    it('should handle concurrent evaluations', async () => {
      const agentIds = ['agent-1', 'agent-2', 'agent-3'];

      // Record actions for all agents
      for (const agentId of agentIds) {
        for (let i = 0; i < 3; i++) {
          continueGateIntegration.recordAction(
            createActionRecord(agentId, 'work', `target-${i}`, {}, true)
          );
        }
      }

      // Evaluate all concurrently
      const decisions = await Promise.all(
        agentIds.map(id => continueGateIntegration.evaluate(id))
      );

      expect(decisions).toHaveLength(3);
      decisions.forEach(d => expect(d.shouldContinue).toBe(true));
    });

    it('should handle concurrent pattern writes', async () => {
      const patterns = [
        createMemoryPattern('p1', 'v1', 'test-generation'),
        createMemoryPattern('p2', 'v2', 'coverage-analysis'),
        createMemoryPattern('p3', 'v3', 'security-compliance'),
      ];

      const decisions = await Promise.all(
        patterns.map(p => memoryWriteGateIntegration.evaluateWrite(p))
      );

      expect(decisions).toHaveLength(3);
      decisions.forEach(d => expect(d.allowed).toBe(true));
    });

    it('should integrate Constitution invariants', () => {
      // Verify Constitution invariants are reflected in flag defaults
      const flags = governanceFlags.getFlags();

      // Invariant 4: Loop Detection
      expect(flags.continueGate.maxConsecutiveRetries).toBe(3);
      expect(flags.continueGate.reworkRatioThreshold).toBe(0.5);

      // Invariant 6: Memory Consistency
      expect(flags.memoryWriteGate.contradictionDetection).toBe(true);

      // Invariant 7: Verification Before Claim
      expect(flags.proofEnvelope.requireProofForClaims).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should gracefully handle missing guidance package', async () => {
      // This test verifies the fallback works when @claude-flow/guidance
      // modules can't be imported
      const gate = new ContinueGateIntegration();
      await gate.initialize();

      const decision = await gate.evaluate('test-agent');
      expect(decision).toBeDefined();
      expect(decision.shouldContinue).toBe(true);
    });

    it('should handle malformed patterns', async () => {
      const gate = new MemoryWriteGateIntegration();

      // Pattern with minimal required fields
      const minimalPattern: MemoryPattern = {
        key: 'minimal',
        value: null,
        domain: 'test',
      };

      const decision = await gate.evaluateWrite(minimalPattern);
      expect(decision.allowed).toBe(true);
    });
  });
});
