/**
 * Tests for ContextBudgetTracker (IMP-08)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextBudgetTracker, type BudgetTransition } from '../../../src/context/compaction/context-budget';

describe('ContextBudgetTracker', () => {
  let tracker: ContextBudgetTracker;

  beforeEach(() => {
    tracker = new ContextBudgetTracker({ totalBudget: 100_000 });
  });

  describe('initial state', () => {
    it('should start in normal state', () => {
      expect(tracker.getState()).toBe('normal');
    });

    it('should report full budget available', () => {
      const snap = tracker.getSnapshot();
      expect(snap.usedTokens).toBe(0);
      expect(snap.remainingTokens).toBe(100_000);
      expect(snap.utilizationPercent).toBe(0);
    });

    it('should not be blocking initially', () => {
      expect(tracker.isBlocking()).toBe(false);
    });
  });

  describe('state transitions', () => {
    it('should transition to warning when remaining drops below 25k', () => {
      const transitions: BudgetTransition[] = [];
      tracker.on('transition', (t: BudgetTransition) => transitions.push(t));

      tracker.addTokens(76_000); // remaining = 24_000
      expect(tracker.getState()).toBe('warning');
      expect(transitions).toHaveLength(1);
      expect(transitions[0].from).toBe('normal');
      expect(transitions[0].to).toBe('warning');
    });

    it('should transition to pressure when remaining drops below 18k', () => {
      tracker.addTokens(83_000); // remaining = 17_000
      expect(tracker.getState()).toBe('pressure');
      expect(tracker.shouldProactiveCompact()).toBe(true);
    });

    it('should transition to auto-compact when remaining drops below 13k', () => {
      tracker.addTokens(88_000); // remaining = 12_000
      expect(tracker.getState()).toBe('auto-compact');
      expect(tracker.shouldAutoCompact()).toBe(true);
    });

    it('should transition to blocking when remaining drops below 3k', () => {
      tracker.addTokens(98_000); // remaining = 2_000
      expect(tracker.getState()).toBe('blocking');
      expect(tracker.isBlocking()).toBe(true);
    });

    it('should skip intermediate states on large jumps', () => {
      const transitions: BudgetTransition[] = [];
      tracker.on('transition', (t: BudgetTransition) => transitions.push(t));

      tracker.addTokens(98_000); // normal -> blocking directly
      expect(transitions).toHaveLength(1);
      expect(transitions[0].from).toBe('normal');
      expect(transitions[0].to).toBe('blocking');
    });

    it('should recover to lower states when tokens are released', () => {
      tracker.addTokens(98_000); // blocking
      expect(tracker.getState()).toBe('blocking');

      tracker.releaseTokens(90_000); // remaining = 92_000
      expect(tracker.getState()).toBe('normal');
    });

    it('should not emit transition if state does not change', () => {
      const handler = vi.fn();
      tracker.on('transition', handler);

      tracker.addTokens(10_000); // still normal
      tracker.addTokens(10_000); // still normal
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('token management', () => {
    it('should not go below zero tokens on over-release', () => {
      tracker.addTokens(5_000);
      tracker.releaseTokens(10_000);
      expect(tracker.getSnapshot().usedTokens).toBe(0);
    });

    it('should set absolute token count', () => {
      tracker.setUsedTokens(50_000);
      expect(tracker.getSnapshot().usedTokens).toBe(50_000);
      expect(tracker.getSnapshot().remainingTokens).toBe(50_000);
    });

    it('should compute utilization percent correctly', () => {
      tracker.addTokens(75_000);
      expect(tracker.getSnapshot().utilizationPercent).toBe(75);
    });
  });

  describe('convenience predicates', () => {
    it('shouldProactiveCompact returns false for normal/warning', () => {
      expect(tracker.shouldProactiveCompact()).toBe(false);
      tracker.addTokens(76_000); // warning
      expect(tracker.shouldProactiveCompact()).toBe(false);
    });

    it('shouldProactiveCompact returns true for pressure+', () => {
      tracker.addTokens(83_000); // pressure
      expect(tracker.shouldProactiveCompact()).toBe(true);
    });

    it('shouldAutoCompact returns true only for auto-compact and blocking', () => {
      tracker.addTokens(83_000); // pressure
      expect(tracker.shouldAutoCompact()).toBe(false);
      tracker.addTokens(5_000); // auto-compact (remaining=12k)
      expect(tracker.shouldAutoCompact()).toBe(true);
    });
  });

  describe('custom thresholds', () => {
    it('should respect custom threshold values', () => {
      const custom = new ContextBudgetTracker({
        totalBudget: 50_000,
        warningThreshold: 10_000,
        pressureThreshold: 7_000,
        autoCompactThreshold: 5_000,
        blockingThreshold: 1_000,
      });

      custom.addTokens(41_000); // remaining = 9_000
      expect(custom.getState()).toBe('warning');

      custom.addTokens(3_000); // remaining = 6_000
      expect(custom.getState()).toBe('pressure');

      custom.addTokens(2_000); // remaining = 4_000
      expect(custom.getState()).toBe('auto-compact');

      custom.addTokens(3_500); // remaining = 500
      expect(custom.getState()).toBe('blocking');
    });
  });
});
