/**
 * Auto-Escalation Tracker Tests
 */

import { describe, it, expect, beforeEach, afterEach} from 'vitest';
import {
  AutoEscalationTracker,
  DEFAULT_ESCALATION_CONFIG,
  type EscalationConfig,
} from '../../../src/routing/escalation/auto-escalation-tracker.js';

describe('AutoEscalationTracker', () => {
  let tracker: AutoEscalationTracker;

  beforeEach(() => {
    tracker = new AutoEscalationTracker();
  });

  afterEach(() => {
    // Reset state to prevent leaks between tests
  });

  describe('default config', () => {
    it('should use default config values', () => {
      expect(DEFAULT_ESCALATION_CONFIG).toEqual({
        escalateAfterFailures: 2,
        deEscalateAfterSuccesses: 5,
        maxTier: 'opus',
        minTier: 'haiku',
      });
    });
  });

  describe('escalation after consecutive failures', () => {
    it('should escalate from haiku to sonnet after 2 failures', () => {
      const result1 = tracker.recordOutcome('agent-1', false, 'haiku');
      expect(result1.action).toBe('none');
      expect(result1.newTier).toBe('haiku');

      const result2 = tracker.recordOutcome('agent-1', false, 'haiku');
      expect(result2.action).toBe('escalate');
      expect(result2.previousTier).toBe('haiku');
      expect(result2.newTier).toBe('sonnet');
    });

    it('should escalate from haiku to sonnet to opus after 4 consecutive failures', () => {
      // First 2 failures: haiku -> sonnet
      tracker.recordOutcome('agent-1', false, 'haiku');
      const esc1 = tracker.recordOutcome('agent-1', false, 'haiku');
      expect(esc1.action).toBe('escalate');
      expect(esc1.newTier).toBe('sonnet');

      // Next 2 failures: sonnet -> opus
      tracker.recordOutcome('agent-1', false, 'haiku');
      const esc2 = tracker.recordOutcome('agent-1', false, 'haiku');
      expect(esc2.action).toBe('escalate');
      expect(esc2.previousTier).toBe('sonnet');
      expect(esc2.newTier).toBe('opus');
    });

    it('should escalate from booster to haiku', () => {
      tracker.recordOutcome('agent-1', false, 'booster');
      const result = tracker.recordOutcome('agent-1', false, 'booster');
      expect(result.action).toBe('escalate');
      expect(result.previousTier).toBe('booster');
      expect(result.newTier).toBe('haiku');
    });
  });

  describe('de-escalation after consecutive successes', () => {
    it('should de-escalate from opus to sonnet after 5 successes', () => {
      // Start at opus by recording outcomes with baseTier opus
      for (let i = 0; i < 4; i++) {
        const r = tracker.recordOutcome('agent-1', true, 'opus');
        expect(r.action).toBe('none');
      }

      const result = tracker.recordOutcome('agent-1', true, 'opus');
      expect(result.action).toBe('de-escalate');
      expect(result.previousTier).toBe('opus');
      expect(result.newTier).toBe('sonnet');
    });

    it('should de-escalate from sonnet to haiku after 5 successes', () => {
      for (let i = 0; i < 4; i++) {
        tracker.recordOutcome('agent-1', true, 'sonnet');
      }

      const result = tracker.recordOutcome('agent-1', true, 'sonnet');
      expect(result.action).toBe('de-escalate');
      expect(result.previousTier).toBe('sonnet');
      expect(result.newTier).toBe('haiku');
    });
  });

  describe('mixed outcomes reset counters', () => {
    it('should reset failure counter on success', () => {
      tracker.recordOutcome('agent-1', false, 'haiku');
      // One failure, then a success resets the counter
      tracker.recordOutcome('agent-1', true, 'haiku');

      // Next failure starts from 0 again
      const r1 = tracker.recordOutcome('agent-1', false, 'haiku');
      expect(r1.action).toBe('none');

      // Second failure triggers escalation
      const r2 = tracker.recordOutcome('agent-1', false, 'haiku');
      expect(r2.action).toBe('escalate');
    });

    it('should reset success counter on failure', () => {
      // 4 successes (not enough for de-escalation)
      for (let i = 0; i < 4; i++) {
        tracker.recordOutcome('agent-1', true, 'opus');
      }

      // One failure resets the success counter
      tracker.recordOutcome('agent-1', false, 'opus');

      // 4 more successes should not trigger de-escalation (counter was reset)
      for (let i = 0; i < 4; i++) {
        const r = tracker.recordOutcome('agent-1', true, 'opus');
        expect(r.action).toBe('none');
      }

      // 5th success after reset triggers de-escalation
      const result = tracker.recordOutcome('agent-1', true, 'opus');
      expect(result.action).toBe('de-escalate');
    });

    it('should escalate then reset failures on escalation', () => {
      // Escalate: haiku -> sonnet
      tracker.recordOutcome('agent-1', false, 'haiku');
      tracker.recordOutcome('agent-1', false, 'haiku');

      const state = tracker.getState('agent-1');
      expect(state?.currentTier).toBe('sonnet');
      expect(state?.consecutiveFailures).toBe(0);
    });
  });

  describe('maxTier bound', () => {
    it('should not escalate beyond opus', () => {
      // Force agent to opus first
      tracker.recordOutcome('agent-1', false, 'sonnet');
      const esc = tracker.recordOutcome('agent-1', false, 'sonnet');
      expect(esc.newTier).toBe('opus');

      // Further failures should not escalate
      tracker.recordOutcome('agent-1', false, 'sonnet');
      const result = tracker.recordOutcome('agent-1', false, 'sonnet');
      expect(result.action).toBe('none');
      expect(result.newTier).toBe('opus');
    });

    it('should respect custom maxTier', () => {
      const customTracker = new AutoEscalationTracker({ maxTier: 'sonnet' });

      customTracker.recordOutcome('agent-1', false, 'haiku');
      const esc = customTracker.recordOutcome('agent-1', false, 'haiku');
      expect(esc.newTier).toBe('sonnet');

      // Cannot go beyond sonnet
      customTracker.recordOutcome('agent-1', false, 'haiku');
      const result = customTracker.recordOutcome('agent-1', false, 'haiku');
      expect(result.action).toBe('none');
      expect(result.newTier).toBe('sonnet');
    });
  });

  describe('minTier bound', () => {
    it('should not de-escalate below haiku', () => {
      // Start at haiku, 5 successes should not de-escalate
      for (let i = 0; i < 5; i++) {
        const r = tracker.recordOutcome('agent-1', true, 'haiku');
        expect(r.action).toBe('none');
      }

      expect(tracker.getCurrentTier('agent-1')).toBe('haiku');
    });

    it('should respect custom minTier', () => {
      const customTracker = new AutoEscalationTracker({ minTier: 'sonnet' });

      // Start at opus, de-escalate to sonnet
      for (let i = 0; i < 5; i++) {
        customTracker.recordOutcome('agent-1', true, 'opus');
      }
      expect(customTracker.getCurrentTier('agent-1')).toBe('sonnet');

      // Cannot go below sonnet
      for (let i = 0; i < 5; i++) {
        const r = customTracker.recordOutcome('agent-1', true, 'opus');
        expect(r.action).toBe('none');
      }
      expect(customTracker.getCurrentTier('agent-1')).toBe('sonnet');
    });
  });

  describe('reset', () => {
    it('should clear state for a specific agent', () => {
      tracker.recordOutcome('agent-1', false, 'haiku');
      tracker.recordOutcome('agent-2', false, 'haiku');

      tracker.reset('agent-1');

      expect(tracker.getState('agent-1')).toBeNull();
      expect(tracker.getState('agent-2')).not.toBeNull();
    });

    it('should clear all state when no agent specified', () => {
      tracker.recordOutcome('agent-1', false, 'haiku');
      tracker.recordOutcome('agent-2', false, 'haiku');

      tracker.reset();

      expect(tracker.getAllStates()).toHaveLength(0);
    });
  });

  describe('getCurrentTier', () => {
    it('should return null for unknown agent', () => {
      expect(tracker.getCurrentTier('nonexistent')).toBeNull();
    });

    it('should return current tier for tracked agent', () => {
      tracker.recordOutcome('agent-1', true, 'sonnet');
      expect(tracker.getCurrentTier('agent-1')).toBe('sonnet');
    });
  });

  describe('getState', () => {
    it('should return null for unknown agent', () => {
      expect(tracker.getState('nonexistent')).toBeNull();
    });

    it('should return full state for tracked agent', () => {
      tracker.recordOutcome('agent-1', true, 'haiku');

      const state = tracker.getState('agent-1');
      expect(state).not.toBeNull();
      expect(state!.agentId).toBe('agent-1');
      expect(state!.currentTier).toBe('haiku');
      expect(state!.baseTier).toBe('haiku');
      expect(state!.consecutiveSuccesses).toBe(1);
      expect(state!.consecutiveFailures).toBe(0);
      expect(state!.escalationCount).toBe(0);
      expect(state!.deEscalationCount).toBe(0);
      expect(state!.lastAction).toBe('none');
      expect(state!.lastActionTimestamp).toBeInstanceOf(Date);
    });
  });

  describe('getAllStates', () => {
    it('should return all tracked agents', () => {
      tracker.recordOutcome('agent-1', true, 'haiku');
      tracker.recordOutcome('agent-2', false, 'sonnet');
      tracker.recordOutcome('agent-3', true, 'opus');

      const states = tracker.getAllStates();
      expect(states).toHaveLength(3);
      expect(states.map(s => s.agentId).sort()).toEqual(['agent-1', 'agent-2', 'agent-3']);
    });
  });

  describe('custom config thresholds', () => {
    it('should escalate after 3 failures with custom threshold', () => {
      const customTracker = new AutoEscalationTracker({ escalateAfterFailures: 3 });

      customTracker.recordOutcome('agent-1', false, 'haiku');
      customTracker.recordOutcome('agent-1', false, 'haiku');
      // 2 failures - no escalation yet with threshold of 3
      expect(customTracker.getCurrentTier('agent-1')).toBe('haiku');

      const result = customTracker.recordOutcome('agent-1', false, 'haiku');
      expect(result.action).toBe('escalate');
      expect(result.newTier).toBe('sonnet');
    });

    it('should de-escalate after 3 successes with custom threshold', () => {
      const customTracker = new AutoEscalationTracker({ deEscalateAfterSuccesses: 3 });

      for (let i = 0; i < 2; i++) {
        customTracker.recordOutcome('agent-1', true, 'opus');
      }
      expect(customTracker.getCurrentTier('agent-1')).toBe('opus');

      const result = customTracker.recordOutcome('agent-1', true, 'opus');
      expect(result.action).toBe('de-escalate');
      expect(result.newTier).toBe('sonnet');
    });
  });

  describe('baseTier tracking', () => {
    it('should store baseTier from first call', () => {
      tracker.recordOutcome('agent-1', true, 'sonnet');

      const state = tracker.getState('agent-1');
      expect(state!.baseTier).toBe('sonnet');
    });

    it('should not change baseTier on subsequent calls', () => {
      tracker.recordOutcome('agent-1', false, 'haiku');
      tracker.recordOutcome('agent-1', false, 'haiku'); // escalates to sonnet

      const state = tracker.getState('agent-1');
      expect(state!.baseTier).toBe('haiku');
      expect(state!.currentTier).toBe('sonnet');
    });
  });

  describe('escalation and de-escalation counts', () => {
    it('should track escalation count', () => {
      // Escalate twice: haiku -> sonnet -> opus
      tracker.recordOutcome('agent-1', false, 'haiku');
      tracker.recordOutcome('agent-1', false, 'haiku');
      tracker.recordOutcome('agent-1', false, 'haiku');
      tracker.recordOutcome('agent-1', false, 'haiku');

      const state = tracker.getState('agent-1');
      expect(state!.escalationCount).toBe(2);
    });

    it('should track de-escalation count', () => {
      // Start at opus, de-escalate once
      for (let i = 0; i < 5; i++) {
        tracker.recordOutcome('agent-1', true, 'opus');
      }

      const state = tracker.getState('agent-1');
      expect(state!.deEscalationCount).toBe(1);
    });
  });
});
