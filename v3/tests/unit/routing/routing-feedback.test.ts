/**
 * Routing Feedback Tests
 * ADR-022: Adaptive QE Agent Routing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RoutingFeedbackCollector,
  createRoutingFeedbackCollector,
} from '../../../src/routing/routing-feedback.js';
import type { QETask, QERoutingDecision } from '../../../src/routing/types.js';

describe('Routing Feedback Collector', () => {
  let collector: RoutingFeedbackCollector;

  beforeEach(() => {
    collector = createRoutingFeedbackCollector(100);
  });

  const createMockTask = (description: string): QETask => ({
    description,
  });

  const createMockDecision = (recommended: string, confidence: number): QERoutingDecision => ({
    recommended,
    confidence,
    alternatives: [
      { agent: 'alt-agent-1', score: 0.7, reason: 'alternative' },
    ],
    reasoning: `Selected ${recommended}`,
    scores: {
      similarity: 0.8,
      performance: 0.7,
      capabilities: 0.9,
      combined: confidence,
    },
    latencyMs: 50,
    timestamp: new Date(),
  });

  describe('Recording Outcomes', () => {
    it('should record a successful outcome', () => {
      const task = createMockTask('Generate unit tests');
      const decision = createMockDecision('qe-test-generator', 0.85);

      const outcome = collector.recordOutcome(task, decision, 'qe-test-generator', {
        success: true,
        qualityScore: 0.9,
        durationMs: 5000,
      });

      expect(outcome.id).toBeTruthy();
      expect(outcome.task).toBe(task);
      expect(outcome.decision).toBe(decision);
      expect(outcome.usedAgent).toBe('qe-test-generator');
      expect(outcome.followedRecommendation).toBe(true);
      expect(outcome.outcome.success).toBe(true);
    });

    it('should detect when recommendation was overridden', () => {
      const task = createMockTask('Analyze coverage');
      const decision = createMockDecision('qe-coverage-analyzer', 0.75);

      const outcome = collector.recordOutcome(task, decision, 'v3-qe-coverage-specialist', {
        success: true,
        qualityScore: 0.85,
        durationMs: 3000,
      });

      expect(outcome.followedRecommendation).toBe(false);
    });

    it('should record failed outcomes', () => {
      const task = createMockTask('Security scan');
      const decision = createMockDecision('qe-security-scanner', 0.9);

      const outcome = collector.recordOutcome(task, decision, 'qe-security-scanner', {
        success: false,
        qualityScore: 0.2,
        durationMs: 10000,
        error: 'Timeout exceeded',
      });

      expect(outcome.outcome.success).toBe(false);
      expect(outcome.outcome.error).toBe('Timeout exceeded');
    });
  });

  describe('Agent Metrics', () => {
    beforeEach(() => {
      // Record several outcomes
      for (let i = 0; i < 10; i++) {
        collector.recordOutcome(
          createMockTask(`Task ${i}`),
          createMockDecision('qe-test-generator', 0.85),
          'qe-test-generator',
          {
            success: i < 8, // 80% success rate
            qualityScore: 0.7 + (i % 3) * 0.1,
            durationMs: 4000 + i * 100,
          }
        );
      }

      // Record some for another agent
      for (let i = 0; i < 5; i++) {
        collector.recordOutcome(
          createMockTask(`Coverage task ${i}`),
          createMockDecision('qe-coverage-analyzer', 0.8),
          'qe-coverage-analyzer',
          {
            success: true,
            qualityScore: 0.9,
            durationMs: 3000,
          }
        );
      }
    });

    it('should calculate agent metrics correctly', () => {
      const metrics = collector.getAgentMetrics('qe-test-generator');

      expect(metrics).not.toBeNull();
      expect(metrics!.agentId).toBe('qe-test-generator');
      expect(metrics!.totalTasks).toBe(10);
      expect(metrics!.successfulTasks).toBe(8);
      expect(metrics!.successRate).toBeCloseTo(0.8, 2);
      expect(metrics!.avgDurationMs).toBeGreaterThan(0);
    });

    it('should return null for agent with no outcomes', () => {
      const metrics = collector.getAgentMetrics('unknown-agent');
      expect(metrics).toBeNull();
    });

    it('should get all agent metrics', () => {
      const allMetrics = collector.getAllAgentMetrics();

      expect(allMetrics.length).toBe(2);
      // Sorted by success rate
      expect(allMetrics[0].successRate).toBeGreaterThanOrEqual(allMetrics[1].successRate);
    });

    it('should calculate performance trend', () => {
      const metrics = collector.getAgentMetrics('qe-coverage-analyzer');

      expect(metrics).not.toBeNull();
      expect(['improving', 'stable', 'declining']).toContain(metrics!.trend);
    });
  });

  describe('Routing Accuracy Analysis', () => {
    beforeEach(() => {
      // Record outcomes where recommendation was followed
      for (let i = 0; i < 7; i++) {
        collector.recordOutcome(
          createMockTask(`Followed task ${i}`),
          createMockDecision('qe-test-generator', 0.85),
          'qe-test-generator',
          {
            success: i < 5, // ~71% success
            qualityScore: 0.75,
            durationMs: 5000,
          }
        );
      }

      // Record outcomes where recommendation was overridden
      for (let i = 0; i < 3; i++) {
        collector.recordOutcome(
          createMockTask(`Override task ${i}`),
          createMockDecision('qe-test-generator', 0.7),
          'v3-qe-test-architect', // Override
          {
            success: i < 2, // ~67% success
            qualityScore: 0.8,
            durationMs: 4000,
          }
        );
      }
    });

    it('should calculate override rate', () => {
      const accuracy = collector.analyzeRoutingAccuracy();

      expect(accuracy.totalOutcomes).toBe(10);
      expect(accuracy.followedRecommendations).toBe(7);
      expect(accuracy.overrideRate).toBeCloseTo(0.3, 2);
    });

    it('should calculate recommendation success rate', () => {
      const accuracy = collector.analyzeRoutingAccuracy();

      expect(accuracy.recommendationSuccessRate).toBeCloseTo(5 / 7, 2);
    });

    it('should calculate override success rate', () => {
      const accuracy = collector.analyzeRoutingAccuracy();

      expect(accuracy.overrideSuccessRate).toBeCloseTo(2 / 3, 2);
    });

    it('should calculate confidence correlation', () => {
      const accuracy = collector.analyzeRoutingAccuracy();

      // Should be a number between -1 and 1
      expect(accuracy.confidenceCorrelation).toBeGreaterThanOrEqual(-1);
      expect(accuracy.confidenceCorrelation).toBeLessThanOrEqual(1);
    });
  });

  describe('Improvement Recommendations', () => {
    it('should recommend collecting more data when few outcomes', () => {
      collector.recordOutcome(
        createMockTask('Single task'),
        createMockDecision('qe-test-generator', 0.8),
        'qe-test-generator',
        { success: true, qualityScore: 0.9, durationMs: 5000 }
      );

      const recommendations = collector.getImprovementRecommendations();

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0]).toContain('Collect more');
    });

    it('should provide recommendations when enough data', () => {
      // Record 60 outcomes
      for (let i = 0; i < 60; i++) {
        collector.recordOutcome(
          createMockTask(`Task ${i}`),
          createMockDecision('qe-test-generator', 0.8),
          'qe-test-generator',
          {
            success: i % 2 === 0, // 50% success rate
            qualityScore: 0.7,
            durationMs: 5000,
          }
        );
      }

      const recommendations = collector.getImprovementRecommendations();
      expect(recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Export/Import', () => {
    it('should export outcomes', () => {
      collector.recordOutcome(
        createMockTask('Export test 1'),
        createMockDecision('qe-test-generator', 0.8),
        'qe-test-generator',
        { success: true, qualityScore: 0.9, durationMs: 5000 }
      );

      collector.recordOutcome(
        createMockTask('Export test 2'),
        createMockDecision('qe-coverage-analyzer', 0.75),
        'qe-coverage-analyzer',
        { success: true, qualityScore: 0.85, durationMs: 3000 }
      );

      const exported = collector.exportOutcomes();
      expect(exported.length).toBe(2);
    });

    it('should import outcomes', () => {
      const outcome = collector.recordOutcome(
        createMockTask('Import test'),
        createMockDecision('qe-test-generator', 0.8),
        'qe-test-generator',
        { success: true, qualityScore: 0.9, durationMs: 5000 }
      );

      const exported = collector.exportOutcomes();

      // Create new collector and import
      const newCollector = createRoutingFeedbackCollector();
      newCollector.importOutcomes(exported);

      const stats = newCollector.getStats();
      expect(stats.totalOutcomes).toBe(1);
    });
  });

  describe('Statistics', () => {
    it('should provide accurate stats', () => {
      for (let i = 0; i < 5; i++) {
        collector.recordOutcome(
          createMockTask(`Stats task ${i}`),
          createMockDecision('qe-test-generator', 0.8),
          i < 3 ? 'qe-test-generator' : 'v3-qe-test-architect',
          { success: true, qualityScore: 0.85, durationMs: 4000 }
        );
      }

      const stats = collector.getStats();

      expect(stats.totalOutcomes).toBe(5);
      expect(stats.uniqueAgentsUsed).toBe(2);
      expect(stats.recentOverrides).toBe(2); // Tasks where agent != recommended
    });
  });

  describe('Clear', () => {
    it('should clear all stored outcomes', () => {
      collector.recordOutcome(
        createMockTask('Clear test'),
        createMockDecision('qe-test-generator', 0.8),
        'qe-test-generator',
        { success: true, qualityScore: 0.9, durationMs: 5000 }
      );

      expect(collector.getStats().totalOutcomes).toBe(1);

      collector.clear();

      expect(collector.getStats().totalOutcomes).toBe(0);
    });
  });

  describe('Outcome Store Eviction', () => {
    it('should evict old outcomes when over limit', () => {
      const smallCollector = createRoutingFeedbackCollector(5);

      for (let i = 0; i < 10; i++) {
        smallCollector.recordOutcome(
          createMockTask(`Eviction task ${i}`),
          createMockDecision('qe-test-generator', 0.8),
          'qe-test-generator',
          { success: true, qualityScore: 0.9, durationMs: 5000 }
        );
      }

      const stats = smallCollector.getStats();
      expect(stats.totalOutcomes).toBe(5);
    });
  });
});
