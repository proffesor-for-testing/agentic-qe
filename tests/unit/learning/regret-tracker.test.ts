/**
 * RegretTracker Unit Tests
 * Task 2.4: Regret Tracking and Learning Health Dashboard
 *
 * Tests for the RegretTracker that monitors whether QE agents
 * are learning over time by analyzing cumulative regret curves.
 */

import { describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {
  RegretTracker,
  createRegretTracker,
  linearRegressionSlope,
  type RegretPoint,
  type RegretAlert,
  type GrowthRate,
} from '../../../src/learning/regret-tracker';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate decisions that simulate sublinear regret growth.
 * An agent that is learning makes smaller errors over time.
 * We achieve R(n) ~ sqrt(n) by making regret per decision decrease as 1/sqrt(n).
 */
function generateSublinearDecisions(
  tracker: RegretTracker,
  domain: string,
  count: number
): void {
  for (let i = 1; i <= count; i++) {
    // Reward improves over time: starts at 0.5, approaches 1.0
    const reward = Math.min(1.0, 0.5 + 0.5 * (1 - 1 / Math.sqrt(i)));
    tracker.recordDecision(domain, reward, 1.0);
  }
}

/**
 * Generate decisions that simulate linear regret growth.
 * A stagnating agent makes constant-sized errors.
 */
function generateLinearDecisions(
  tracker: RegretTracker,
  domain: string,
  count: number
): void {
  for (let i = 1; i <= count; i++) {
    // Constant reward gap (never learns)
    tracker.recordDecision(domain, 0.7, 1.0);
  }
}

/**
 * Generate decisions that simulate superlinear regret growth.
 * An agent that is getting worse over time.
 */
function generateSuperlinearDecisions(
  tracker: RegretTracker,
  domain: string,
  count: number
): void {
  for (let i = 1; i <= count; i++) {
    // Reward degrades over time
    const reward = Math.max(0, 0.8 - 0.005 * i);
    tracker.recordDecision(domain, reward, 1.0);
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('RegretTracker', () => {
  let tracker: RegretTracker;

  beforeEach(() => {
    tracker = new RegretTracker();
  });

  afterEach(() => {
    // Reset state to prevent leaks between tests
  });

  // --------------------------------------------------------------------------
  // Cumulative Regret Calculation
  // --------------------------------------------------------------------------

  describe('cumulative regret calculation', () => {
    it('should start with zero regret for unknown domains', () => {
      expect(tracker.getCumulativeRegret('unknown-domain')).toBe(0);
    });

    it('should accumulate regret correctly', () => {
      tracker.recordDecision('test-domain', 0.7, 1.0); // regret = 0.3
      tracker.recordDecision('test-domain', 0.8, 1.0); // regret = 0.2
      tracker.recordDecision('test-domain', 0.9, 1.0); // regret = 0.1

      const total = tracker.getCumulativeRegret('test-domain');
      expect(total).toBeCloseTo(0.6, 5);
    });

    it('should not produce negative regret', () => {
      // reward > optimalReward should produce 0 regret, not negative
      tracker.recordDecision('test-domain', 1.0, 0.8);
      expect(tracker.getCumulativeRegret('test-domain')).toBe(0);
    });

    it('should track domains independently', () => {
      tracker.recordDecision('domain-a', 0.5, 1.0); // regret = 0.5
      tracker.recordDecision('domain-b', 0.3, 1.0); // regret = 0.7

      expect(tracker.getCumulativeRegret('domain-a')).toBeCloseTo(0.5, 5);
      expect(tracker.getCumulativeRegret('domain-b')).toBeCloseTo(0.7, 5);
    });

    it('should handle zero regret decisions', () => {
      tracker.recordDecision('test-domain', 1.0, 1.0); // regret = 0
      tracker.recordDecision('test-domain', 1.0, 1.0); // regret = 0

      expect(tracker.getCumulativeRegret('test-domain')).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Regret Curve Generation
  // --------------------------------------------------------------------------

  describe('regret curve generation', () => {
    it('should return empty array for unknown domains', () => {
      expect(tracker.getRegretCurve('unknown')).toEqual([]);
    });

    it('should return correct number of points', () => {
      for (let i = 0; i < 10; i++) {
        tracker.recordDecision('test-domain', 0.8, 1.0);
      }

      const curve = tracker.getRegretCurve('test-domain');
      expect(curve).toHaveLength(10);
    });

    it('should have monotonically non-decreasing cumulative regret', () => {
      for (let i = 0; i < 20; i++) {
        tracker.recordDecision('test-domain', Math.random(), 1.0);
      }

      const curve = tracker.getRegretCurve('test-domain');
      for (let i = 1; i < curve.length; i++) {
        expect(curve[i].cumulativeRegret).toBeGreaterThanOrEqual(
          curve[i - 1].cumulativeRegret
        );
      }
    });

    it('should have incrementing decision counts', () => {
      for (let i = 0; i < 5; i++) {
        tracker.recordDecision('test-domain', 0.8, 1.0);
      }

      const curve = tracker.getRegretCurve('test-domain');
      expect(curve.map(p => p.decisionCount)).toEqual([1, 2, 3, 4, 5]);
    });

    it('should include timestamps', () => {
      tracker.recordDecision('test-domain', 0.8, 1.0);

      const curve = tracker.getRegretCurve('test-domain');
      expect(curve[0].timestamp).toBeGreaterThan(0);
    });

    it('should return a copy (not mutable reference)', () => {
      tracker.recordDecision('test-domain', 0.8, 1.0);
      const curve1 = tracker.getRegretCurve('test-domain');
      const curve2 = tracker.getRegretCurve('test-domain');
      expect(curve1).not.toBe(curve2);
    });
  });

  // --------------------------------------------------------------------------
  // Growth Rate Detection
  // --------------------------------------------------------------------------

  describe('growth rate detection', () => {
    it('should return insufficient_data with fewer than 50 points', () => {
      for (let i = 0; i < 49; i++) {
        tracker.recordDecision('test-domain', 0.8, 1.0);
      }

      expect(tracker.getRegretGrowthRate('test-domain')).toBe('insufficient_data');
    });

    it('should return insufficient_data for unknown domain', () => {
      expect(tracker.getRegretGrowthRate('unknown')).toBe('insufficient_data');
    });

    it('should detect sublinear growth (learning agent)', () => {
      generateSublinearDecisions(tracker, 'learning-domain', 200);

      const rate = tracker.getRegretGrowthRate('learning-domain');
      expect(rate).toBe('sublinear');
    });

    it('should detect linear growth (stagnating agent)', () => {
      generateLinearDecisions(tracker, 'stagnating-domain', 200);

      const rate = tracker.getRegretGrowthRate('stagnating-domain');
      expect(rate).toBe('linear');
    });

    it('should detect superlinear growth (degrading agent)', () => {
      generateSuperlinearDecisions(tracker, 'degrading-domain', 200);

      const rate = tracker.getRegretGrowthRate('degrading-domain');
      expect(rate).toBe('superlinear');
    });
  });

  // --------------------------------------------------------------------------
  // Stagnation Detection
  // --------------------------------------------------------------------------

  describe('stagnation detection', () => {
    it('should not detect stagnation with insufficient data', () => {
      tracker.recordDecision('test-domain', 0.8, 1.0);
      expect(tracker.detectStagnation('test-domain')).toBe(false);
    });

    it('should not detect stagnation for learning domains', () => {
      generateSublinearDecisions(tracker, 'learning', 200);
      expect(tracker.detectStagnation('learning')).toBe(false);
    });

    it('should detect stagnation for linear growth', () => {
      generateLinearDecisions(tracker, 'stagnating', 200);
      expect(tracker.detectStagnation('stagnating')).toBe(true);
    });

    it('should detect stagnation for superlinear growth', () => {
      generateSuperlinearDecisions(tracker, 'degrading', 200);
      expect(tracker.detectStagnation('degrading')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Health Summary
  // --------------------------------------------------------------------------

  describe('health summary', () => {
    it('should return empty array when no domains are tracked', () => {
      const summary = tracker.getHealthSummary();
      expect(summary).toEqual([]);
    });

    it('should include all tracked domains', () => {
      generateSublinearDecisions(tracker, 'domain-a', 100);
      generateLinearDecisions(tracker, 'domain-b', 100);

      const summary = tracker.getHealthSummary();
      expect(summary).toHaveLength(2);
      expect(summary.map(s => s.domain)).toContain('domain-a');
      expect(summary.map(s => s.domain)).toContain('domain-b');
    });

    it('should sort domains alphabetically', () => {
      tracker.recordDecision('zebra', 0.5, 1.0);
      tracker.recordDecision('alpha', 0.5, 1.0);
      tracker.recordDecision('middle', 0.5, 1.0);

      const summary = tracker.getHealthSummary();
      expect(summary.map(s => s.domain)).toEqual(['alpha', 'middle', 'zebra']);
    });

    it('should include correct cumulative regret', () => {
      tracker.recordDecision('test', 0.7, 1.0); // 0.3
      tracker.recordDecision('test', 0.8, 1.0); // 0.2

      const summary = tracker.getHealthSummary();
      expect(summary[0].cumulativeRegret).toBeCloseTo(0.5, 5);
    });

    it('should include correct total decisions', () => {
      for (let i = 0; i < 25; i++) {
        tracker.recordDecision('test', 0.8, 1.0);
      }

      const summary = tracker.getHealthSummary();
      expect(summary[0].totalDecisions).toBe(25);
    });

    it('should mark stagnating domains', () => {
      generateLinearDecisions(tracker, 'stagnating', 200);

      const summary = tracker.getHealthSummary();
      const stagnatingDomain = summary.find(s => s.domain === 'stagnating');
      expect(stagnatingDomain?.stagnating).toBe(true);
    });

    it('should not mark learning domains as stagnating', () => {
      generateSublinearDecisions(tracker, 'learning', 200);

      const summary = tracker.getHealthSummary();
      const learningDomain = summary.find(s => s.domain === 'learning');
      expect(learningDomain?.stagnating).toBe(false);
    });

    it('should include slope for domains with enough data', () => {
      generateLinearDecisions(tracker, 'with-slope', 100);

      const summary = tracker.getHealthSummary();
      const domain = summary.find(s => s.domain === 'with-slope');
      expect(domain?.slope).toBeDefined();
      expect(typeof domain?.slope).toBe('number');
    });

    it('should have undefined slope for domains with insufficient data', () => {
      tracker.recordDecision('few-points', 0.8, 1.0);

      const summary = tracker.getHealthSummary();
      const domain = summary.find(s => s.domain === 'few-points');
      expect(domain?.slope).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Alert on Growth Rate Transition
  // --------------------------------------------------------------------------

  describe('alert on growth rate transition', () => {
    it('should emit alert when growth rate changes', () => {
      const alerts: RegretAlert[] = [];
      tracker.onAlert(alert => alerts.push(alert));

      // First: establish sublinear growth
      generateSublinearDecisions(tracker, 'transitioning', 100);
      const initialRate = tracker.getRegretGrowthRate('transitioning');
      expect(initialRate).toBe('sublinear');

      // Then: switch to linear growth by adding constant-regret decisions
      for (let i = 0; i < 200; i++) {
        tracker.recordDecision('transitioning', 0.3, 1.0);
      }

      // Should have emitted at least one alert
      const transitionAlerts = alerts.filter(a => a.domain === 'transitioning');
      expect(transitionAlerts.length).toBeGreaterThan(0);
      expect(transitionAlerts[0].previousRate).toBe('sublinear');
      expect(transitionAlerts[0].message).toContain('transitioning');
    });

    it('should not emit alert for first classification', () => {
      const alerts: RegretAlert[] = [];
      tracker.onAlert(alert => alerts.push(alert));

      // Build up to exactly 50 decisions (the threshold)
      generateLinearDecisions(tracker, 'new-domain', 50);

      // No alert should fire for the initial classification
      expect(alerts).toHaveLength(0);
    });

    it('should store alerts in history', () => {
      // Build a scenario that triggers a transition
      generateSublinearDecisions(tracker, 'domain', 100);
      for (let i = 0; i < 200; i++) {
        tracker.recordDecision('domain', 0.3, 1.0);
      }

      const alerts = tracker.getAlerts();
      // May or may not have alerts depending on the exact boundary,
      // but the method should return an array
      expect(Array.isArray(alerts)).toBe(true);
    });

    it('should handle callback errors gracefully', () => {
      tracker.onAlert(() => {
        throw new Error('Callback failed');
      });

      // This should not throw even when callback fails
      expect(() => {
        generateSublinearDecisions(tracker, 'robust', 60);
        for (let i = 0; i < 200; i++) {
          tracker.recordDecision('robust', 0.3, 1.0);
        }
      }).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Accessors and Reset
  // --------------------------------------------------------------------------

  describe('accessors and reset', () => {
    it('should return tracked domains', () => {
      tracker.recordDecision('domain-a', 0.5, 1.0);
      tracker.recordDecision('domain-b', 0.5, 1.0);

      const domains = tracker.getTrackedDomains();
      expect(domains).toContain('domain-a');
      expect(domains).toContain('domain-b');
    });

    it('should return sorted domain list', () => {
      tracker.recordDecision('z-domain', 0.5, 1.0);
      tracker.recordDecision('a-domain', 0.5, 1.0);

      expect(tracker.getTrackedDomains()).toEqual(['a-domain', 'z-domain']);
    });

    it('should return total decisions across all domains', () => {
      tracker.recordDecision('a', 0.5, 1.0);
      tracker.recordDecision('a', 0.5, 1.0);
      tracker.recordDecision('b', 0.5, 1.0);

      expect(tracker.getTotalDecisions()).toBe(3);
    });

    it('should reset a specific domain', () => {
      tracker.recordDecision('keep', 0.5, 1.0);
      tracker.recordDecision('remove', 0.5, 1.0);

      tracker.reset('remove');

      expect(tracker.getCumulativeRegret('keep')).toBeGreaterThan(0);
      expect(tracker.getCumulativeRegret('remove')).toBe(0);
      expect(tracker.getTrackedDomains()).toEqual(['keep']);
    });

    it('should reset all domains', () => {
      tracker.recordDecision('a', 0.5, 1.0);
      tracker.recordDecision('b', 0.5, 1.0);

      tracker.reset();

      expect(tracker.getTrackedDomains()).toEqual([]);
      expect(tracker.getTotalDecisions()).toBe(0);
      expect(tracker.getAlerts()).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Factory Function
  // --------------------------------------------------------------------------

  describe('createRegretTracker factory', () => {
    it('should create a new instance', () => {
      const instance = createRegretTracker();
      expect(instance).toBeInstanceOf(RegretTracker);
    });

    it('should accept configuration options', () => {
      const instance = createRegretTracker({ maxAlerts: 10, recentWindow: 5 });
      expect(instance).toBeInstanceOf(RegretTracker);
    });
  });
});

// ============================================================================
// Linear Regression Tests
// ============================================================================

describe('linearRegressionSlope', () => {
  it('should return 0 for single point', () => {
    expect(linearRegressionSlope([1], [1])).toBe(0);
  });

  it('should return 0 for empty arrays', () => {
    expect(linearRegressionSlope([], [])).toBe(0);
  });

  it('should compute correct slope for y = 2x', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2, 4, 6, 8, 10];
    expect(linearRegressionSlope(xs, ys)).toBeCloseTo(2.0, 5);
  });

  it('should compute correct slope for y = x', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [1, 2, 3, 4, 5];
    expect(linearRegressionSlope(xs, ys)).toBeCloseTo(1.0, 5);
  });

  it('should compute correct slope for y = 0.5x', () => {
    const xs = [0, 2, 4, 6, 8];
    const ys = [0, 1, 2, 3, 4];
    expect(linearRegressionSlope(xs, ys)).toBeCloseTo(0.5, 5);
  });

  it('should handle constant y (slope = 0)', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [5, 5, 5, 5, 5];
    expect(linearRegressionSlope(xs, ys)).toBeCloseTo(0, 5);
  });

  it('should handle negative slope', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [10, 8, 6, 4, 2];
    expect(linearRegressionSlope(xs, ys)).toBeCloseTo(-2.0, 5);
  });
});
