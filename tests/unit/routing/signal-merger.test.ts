/**
 * Signal Merger Tests
 * Issue #342, Item 3: Multi-Signal Confidence Merging
 */

import { describe, it, expect } from 'vitest';
import {
  SignalMerger,
  createSignalMerger,
  DEFAULT_SIGNAL_MERGER_CONFIG,
} from '../../../src/routing/signal-merger.js';
import type { CoExecutionStats } from '../../../src/routing/co-execution-repository.js';

/** Helper to create CoExecutionStats */
function makeStats(agentA: string, agentB: string, successCount: number, totalExecutions: number): CoExecutionStats {
  return {
    agentA,
    agentB,
    totalExecutions,
    successCount,
    successRate: totalExecutions > 0 ? successCount / totalExecutions : 0,
    behavioralConfidence: Math.min(1.0, successCount / 20),
  };
}

describe('Signal Merger (Issue #342 Item 3)', () => {
  describe('Default configuration', () => {
    it('should have correct default weights', () => {
      expect(DEFAULT_SIGNAL_MERGER_CONFIG.staticAnalysisWeight).toBe(0.7);
      expect(DEFAULT_SIGNAL_MERGER_CONFIG.behavioralWeight).toBe(0.3);
      expect(DEFAULT_SIGNAL_MERGER_CONFIG.minBehavioralConfidence).toBe(0.05);
    });
  });

  describe('User declaration signal', () => {
    it('should give confidence 1.0 to user-declared agent', () => {
      const merger = createSignalMerger();
      const results = merger.merge(
        ['qe-test-architect', 'qe-test-generator'],
        {
          userDeclaration: 'qe-test-architect',
          staticAnalysis: new Map(),
          behavioral: new Map(),
        },
      );

      const declared = results.find(r => r.agentId === 'qe-test-architect');
      expect(declared).toBeDefined();
      expect(declared!.mergedConfidence).toBe(1.0);
      expect(declared!.determinedBy).toBe('user-declaration');
    });

    it('should override all other signals when user declares', () => {
      const merger = createSignalMerger();
      const results = merger.merge(
        ['qe-test-architect', 'qe-test-generator'],
        {
          userDeclaration: 'qe-test-architect',
          staticAnalysis: new Map([
            ['qe-test-generator', { confidence: 0.95, reason: 'Strong match' }],
          ]),
          behavioral: new Map([
            ['qe-test-generator', makeStats('a', 'qe-test-generator', 20, 20)],
          ]),
        },
      );

      // User-declared agent should be first despite strong competing signals
      expect(results[0].agentId).toBe('qe-test-architect');
      expect(results[0].mergedConfidence).toBe(1.0);
    });

    it('should dedup: when declaration and analysis agree, drop analysis signal', () => {
      const merger = createSignalMerger();
      const results = merger.merge(
        ['qe-test-architect'],
        {
          userDeclaration: 'qe-test-architect',
          staticAnalysis: new Map([
            ['qe-test-architect', { confidence: 0.9, reason: 'Code match' }],
          ]),
          behavioral: new Map(),
        },
      );

      const agent = results[0];
      // Should only have user-declaration signal, not both (Skillsmith dedup)
      const sources = agent.signals.map(s => s.source);
      expect(sources).toContain('user-declaration');
      expect(sources).not.toContain('static-analysis');
    });
  });

  describe('Static analysis signal', () => {
    it('should use static analysis confidence when no declaration', () => {
      const merger = createSignalMerger();
      const results = merger.merge(
        ['qe-coverage-specialist'],
        {
          staticAnalysis: new Map([
            ['qe-coverage-specialist', { confidence: 0.85, reason: 'Coverage tool refs' }],
          ]),
          behavioral: new Map(),
        },
      );

      expect(results[0].mergedConfidence).toBe(0.85);
      expect(results[0].determinedBy).toBe('static-analysis');
    });

    it('should assign 0 confidence to agents with no signals', () => {
      const merger = createSignalMerger();
      const results = merger.merge(
        ['qe-no-signals'],
        {
          staticAnalysis: new Map(),
          behavioral: new Map(),
        },
      );

      expect(results[0].mergedConfidence).toBe(0);
    });
  });

  describe('Behavioral signal', () => {
    it('should use behavioral confidence when no other signals', () => {
      const merger = createSignalMerger();
      const stats = makeStats('a', 'qe-partner', 10, 12);
      const results = merger.merge(
        ['qe-partner'],
        {
          staticAnalysis: new Map(),
          behavioral: new Map([['qe-partner', stats]]),
        },
      );

      // Behavioral only: behavioralConfidence * successRate
      const expected = stats.behavioralConfidence * stats.successRate;
      expect(results[0].mergedConfidence).toBeCloseTo(expected, 4);
      expect(results[0].determinedBy).toBe('behavioral');
    });

    it('should ramp linearly: 1 success = 0.05, 10 = 0.5, 20 = 1.0', () => {
      expect(makeStats('a', 'b', 1, 1).behavioralConfidence).toBeCloseTo(0.05, 4);
      expect(makeStats('a', 'b', 10, 10).behavioralConfidence).toBeCloseTo(0.5, 4);
      expect(makeStats('a', 'b', 20, 20).behavioralConfidence).toBeCloseTo(1.0, 4);
      expect(makeStats('a', 'b', 30, 30).behavioralConfidence).toBeCloseTo(1.0, 4);
    });

    it('should ignore behavioral signal below minBehavioralConfidence', () => {
      const merger = createSignalMerger({ minBehavioralConfidence: 0.1 });
      // 1 success = 0.05 confidence, below threshold of 0.1
      const stats = makeStats('a', 'qe-weak', 1, 1);
      const results = merger.merge(
        ['qe-weak'],
        {
          staticAnalysis: new Map(),
          behavioral: new Map([['qe-weak', stats]]),
        },
      );

      expect(results[0].mergedConfidence).toBe(0);
      expect(results[0].signals).toHaveLength(0);
    });
  });

  describe('Combined signals', () => {
    it('should blend static and behavioral with configured weights', () => {
      const merger = createSignalMerger({ staticAnalysisWeight: 0.7, behavioralWeight: 0.3 });
      const staticConf = 0.8;
      const stats = makeStats('a', 'qe-blended', 20, 20); // Full confidence, 100% success

      const results = merger.merge(
        ['qe-blended'],
        {
          staticAnalysis: new Map([
            ['qe-blended', { confidence: staticConf, reason: 'Match' }],
          ]),
          behavioral: new Map([['qe-blended', stats]]),
        },
      );

      // Expected: 0.7 * 0.8 + 0.3 * (1.0 * 1.0) = 0.56 + 0.3 = 0.86
      expect(results[0].mergedConfidence).toBeCloseTo(0.86, 2);
    });

    it('should sort results by merged confidence descending', () => {
      const merger = createSignalMerger();
      const results = merger.merge(
        ['qe-low', 'qe-high', 'qe-mid'],
        {
          staticAnalysis: new Map([
            ['qe-low', { confidence: 0.3, reason: 'Weak' }],
            ['qe-high', { confidence: 0.9, reason: 'Strong' }],
            ['qe-mid', { confidence: 0.6, reason: 'Medium' }],
          ]),
          behavioral: new Map(),
        },
      );

      expect(results[0].agentId).toBe('qe-high');
      expect(results[1].agentId).toBe('qe-mid');
      expect(results[2].agentId).toBe('qe-low');
    });

    it('should clamp merged confidence to [0, 1]', () => {
      const merger = createSignalMerger({ staticAnalysisWeight: 1.0, behavioralWeight: 1.0 });
      const results = merger.merge(
        ['qe-over'],
        {
          staticAnalysis: new Map([
            ['qe-over', { confidence: 0.9, reason: 'High' }],
          ]),
          behavioral: new Map([
            ['qe-over', makeStats('a', 'qe-over', 20, 20)],
          ]),
        },
      );

      expect(results[0].mergedConfidence).toBeLessThanOrEqual(1.0);
      expect(results[0].mergedConfidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('createSignalMerger factory', () => {
    it('should create merger with default config', () => {
      const merger = createSignalMerger();
      expect(merger).toBeInstanceOf(SignalMerger);
    });

    it('should accept partial config overrides', () => {
      const merger = createSignalMerger({ staticAnalysisWeight: 0.5 });
      // Should work without errors
      const results = merger.merge(['qe-test'], {
        staticAnalysis: new Map(),
        behavioral: new Map(),
      });
      expect(results).toHaveLength(1);
    });
  });
});
