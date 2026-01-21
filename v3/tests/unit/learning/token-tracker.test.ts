/**
 * Unit Tests for Token Metrics Collector
 * ADR-042: Token Tracking Implementation
 *
 * Tests TokenMetricsCollector singleton behavior, metric recording,
 * aggregation, and efficiency calculations.
 *
 * Tests the actual implementation from src/learning/token-tracker.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TokenMetricsCollector,
  TokenMetricsCollectorImpl,
  TokenUsage,
  formatCostUsd,
  estimateTokens,
} from '../../../src/learning/token-tracker.js';

// ============================================================================
// Tests
// ============================================================================

describe('TokenMetricsCollector', () => {
  beforeEach(() => {
    // Reset singleton before each test
    TokenMetricsCollector.reset();
  });

  afterEach(() => {
    // Clean up after each test
    TokenMetricsCollector.stopAutoSave();
  });

  // ==========================================================================
  // Singleton Behavior
  // ==========================================================================

  describe('singleton behavior', () => {
    it('should return the same instance on multiple calls', () => {
      // Access the singleton multiple times
      const summary1 = TokenMetricsCollector.getSessionSummary();
      const summary2 = TokenMetricsCollector.getSessionSummary();

      // Both should have the same session ID (same instance)
      expect(summary1.sessionId).toBe(summary2.sessionId);
    });

    it('should return a new session after reset', () => {
      const summary1 = TokenMetricsCollector.getSessionSummary();
      const sessionId1 = summary1.sessionId;

      TokenMetricsCollector.reset();
      const summary2 = TokenMetricsCollector.getSessionSummary();
      const sessionId2 = summary2.sessionId;

      expect(sessionId1).not.toBe(sessionId2);
    });

    it('should preserve data within same instance', () => {
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'test-generation',
        'generate',
        {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        }
      );

      const summary = TokenMetricsCollector.getSessionSummary();
      expect(summary.totalUsage.totalTokens).toBe(150);
    });

    it('should not preserve data after reset', () => {
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'test-generation',
        'generate',
        {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        }
      );

      TokenMetricsCollector.reset();
      const summary = TokenMetricsCollector.getSessionSummary();
      expect(summary.totalUsage.totalTokens).toBe(0);
    });
  });

  // ==========================================================================
  // recordTokenUsage()
  // ==========================================================================

  describe('recordTokenUsage()', () => {
    it('should record basic token usage with simple signature', () => {
      TokenMetricsCollector.recordTokenUsage('task-1', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });

      const summary = TokenMetricsCollector.getSessionSummary();
      expect(summary.totalUsage.totalTokens).toBe(150);
    });

    it('should record token usage with full signature', () => {
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'test-generation',
        'generate',
        {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        }
      );

      const summary = TokenMetricsCollector.getSessionSummary();
      expect(summary.totalUsage.totalTokens).toBe(150);
      expect(summary.byAgent.get('agent-1')?.totalTokens).toBe(150);
      expect(summary.byDomain.get('test-generation')?.totalTokens).toBe(150);
    });

    it('should record optional fields correctly', () => {
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'test-generation',
        'generate',
        {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        },
        {
          patternReused: true,
          tokensSaved: 200,
        }
      );

      const summary = TokenMetricsCollector.getSessionSummary();
      expect(summary.optimizationStats.patternsReused).toBe(1);
      expect(summary.optimizationStats.tokensSaved).toBe(200);
    });

    it('should accumulate multiple records', () => {
      for (let i = 0; i < 5; i++) {
        TokenMetricsCollector.recordTokenUsage(
          `task-${i}`,
          'agent-1',
          'test-generation',
          'generate',
          {
            inputTokens: 100 * (i + 1),
            outputTokens: 50 * (i + 1),
            totalTokens: 150 * (i + 1),
          }
        );
      }

      const metrics = TokenMetricsCollector.getTaskMetrics();
      expect(metrics.length).toBe(5);
    });

    it('should calculate cost automatically based on token counts', () => {
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'test-generation',
        'generate',
        {
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
        }
      );

      const summary = TokenMetricsCollector.getSessionSummary();
      // Cost should be calculated: (1000 * 0.003/1000) + (500 * 0.015/1000) = 0.003 + 0.0075 = 0.0105
      expect(summary.totalUsage.estimatedCostUsd).toBeGreaterThan(0);
      expect(summary.totalUsage.estimatedCostUsd).toBeDefined();
    });

    it('should aggregate by agent correctly', () => {
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'domain', 'op', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });
      TokenMetricsCollector.recordTokenUsage('task-2', 'agent-1', 'domain', 'op', {
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
      });
      TokenMetricsCollector.recordTokenUsage('task-3', 'agent-2', 'domain', 'op', {
        inputTokens: 50,
        outputTokens: 25,
        totalTokens: 75,
      });

      const summary = TokenMetricsCollector.getSessionSummary();

      expect(summary.byAgent.get('agent-1')?.totalTokens).toBe(450);
      expect(summary.byAgent.get('agent-1')?.tasksExecuted).toBe(2);
      expect(summary.byAgent.get('agent-2')?.totalTokens).toBe(75);
    });

    it('should aggregate by domain correctly', () => {
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'test-generation', 'op', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });
      TokenMetricsCollector.recordTokenUsage('task-2', 'agent-2', 'test-generation', 'op', {
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
      });
      TokenMetricsCollector.recordTokenUsage('task-3', 'agent-1', 'coverage-analysis', 'op', {
        inputTokens: 50,
        outputTokens: 25,
        totalTokens: 75,
      });

      const summary = TokenMetricsCollector.getSessionSummary();

      expect(summary.byDomain.get('test-generation')?.totalTokens).toBe(450);
      expect(summary.byDomain.get('coverage-analysis')?.totalTokens).toBe(75);
    });
  });

  // ==========================================================================
  // recordPatternReuse()
  // ==========================================================================

  describe('recordPatternReuse()', () => {
    it('should record pattern reuse with savings', () => {
      TokenMetricsCollector.recordPatternReuse('task-1', 500);

      const summary = TokenMetricsCollector.getSessionSummary();
      expect(summary.optimizationStats.patternsReused).toBe(1);
      expect(summary.optimizationStats.tokensSaved).toBe(500);
    });

    it('should accumulate multiple savings records', () => {
      TokenMetricsCollector.recordPatternReuse('task-1', 500);
      TokenMetricsCollector.recordPatternReuse('task-2', 300);
      TokenMetricsCollector.recordPatternReuse('task-3', 200);

      const summary = TokenMetricsCollector.getSessionSummary();
      expect(summary.optimizationStats.patternsReused).toBe(3);
      expect(summary.optimizationStats.tokensSaved).toBe(1000);
    });

    it('should track savings correctly for efficiency calculation', () => {
      // Record some usage
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'test-generation', 'generate', {
        inputTokens: 500,
        outputTokens: 500,
        totalTokens: 1000,
      });

      // Record the savings
      TokenMetricsCollector.recordPatternReuse('task-2', 800);

      const efficiency = TokenMetricsCollector.getTokenEfficiency();
      expect(efficiency.totalTokensSaved).toBe(800);
    });
  });

  // ==========================================================================
  // recordCacheHit() and recordEarlyExit()
  // ==========================================================================

  describe('recordCacheHit()', () => {
    it('should track cache hits and tokens saved', () => {
      TokenMetricsCollector.recordCacheHit(300);
      TokenMetricsCollector.recordCacheHit(250);

      const summary = TokenMetricsCollector.getSessionSummary();
      expect(summary.optimizationStats.cacheHits).toBe(2);
      expect(summary.optimizationStats.tokensSaved).toBe(550);
    });
  });

  describe('recordEarlyExit()', () => {
    it('should track early exits and tokens saved', () => {
      TokenMetricsCollector.recordEarlyExit(400);
      TokenMetricsCollector.recordEarlyExit(600);

      const summary = TokenMetricsCollector.getSessionSummary();
      expect(summary.optimizationStats.earlyExits).toBe(2);
      expect(summary.optimizationStats.tokensSaved).toBe(1000);
    });
  });

  // ==========================================================================
  // getSessionSummary()
  // ==========================================================================

  describe('getSessionSummary()', () => {
    it('should aggregate tokens by session', () => {
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'domain', 'op', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });
      TokenMetricsCollector.recordTokenUsage('task-2', 'agent-1', 'domain', 'op', {
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
      });

      const summary = TokenMetricsCollector.getSessionSummary();

      expect(summary.totalUsage.inputTokens).toBe(300);
      expect(summary.totalUsage.outputTokens).toBe(150);
      expect(summary.totalUsage.totalTokens).toBe(450);
    });

    it('should return empty summary for empty session', () => {
      const summary = TokenMetricsCollector.getSessionSummary();

      expect(summary.totalUsage.totalTokens).toBe(0);
      expect(summary.byAgent.size).toBe(0);
      expect(summary.byDomain.size).toBe(0);
    });

    it('should calculate timeframe from records when not provided', () => {
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'domain', 'op', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });

      const summary = TokenMetricsCollector.getSessionSummary();

      expect(summary.startTime).toBeDefined();
      expect(summary.endTime).toBeDefined();
      expect(summary.endTime!).toBeGreaterThanOrEqual(summary.startTime);
    });

    it('should include optimization stats', () => {
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'domain', 'op', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      }, { patternReused: true, tokensSaved: 200 });

      TokenMetricsCollector.recordCacheHit(100);
      TokenMetricsCollector.recordEarlyExit(150);

      const summary = TokenMetricsCollector.getSessionSummary();

      expect(summary.optimizationStats.patternsReused).toBe(1);
      expect(summary.optimizationStats.cacheHits).toBe(1);
      expect(summary.optimizationStats.earlyExits).toBe(1);
      expect(summary.optimizationStats.tokensSaved).toBe(450); // 200 + 100 + 150
    });

    it('should calculate savings percentage correctly', () => {
      // Record 1000 tokens used
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'domain', 'op', {
        inputTokens: 600,
        outputTokens: 400,
        totalTokens: 1000,
      });

      // Record 1000 tokens saved (50% savings)
      TokenMetricsCollector.recordPatternReuse('task-2', 1000);

      const summary = TokenMetricsCollector.getSessionSummary();
      // Savings = 1000 / (1000 + 1000) * 100 = 50%
      expect(summary.optimizationStats.savingsPercentage).toBe(50);
    });
  });

  // ==========================================================================
  // getAgentMetrics()
  // ==========================================================================

  describe('getAgentMetrics()', () => {
    it('should aggregate metrics by agent', () => {
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'domain', 'op', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });
      TokenMetricsCollector.recordTokenUsage('task-2', 'agent-1', 'domain', 'op', {
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
      });

      const metrics = TokenMetricsCollector.getAgentMetrics('agent-1');

      expect(metrics).not.toBeInstanceOf(Array);
      const agentMetrics = metrics as any;
      expect(agentMetrics.agentId).toBe('agent-1');
      expect(agentMetrics.totalTokens).toBe(450);
      expect(agentMetrics.tasksExecuted).toBe(2);
    });

    it('should filter by agentId correctly', () => {
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'domain', 'op', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });
      TokenMetricsCollector.recordTokenUsage('task-2', 'agent-2', 'domain', 'op', {
        inputTokens: 500,
        outputTokens: 500,
        totalTokens: 1000,
      });

      const agent1Metrics = TokenMetricsCollector.getAgentMetrics('agent-1') as any;
      const agent2Metrics = TokenMetricsCollector.getAgentMetrics('agent-2') as any;

      expect(agent1Metrics.totalTokens).toBe(150);
      expect(agent2Metrics.totalTokens).toBe(1000);
    });

    it('should return all agents when no agentId specified', () => {
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'domain', 'op', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });
      TokenMetricsCollector.recordTokenUsage('task-2', 'agent-2', 'domain', 'op', {
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
      });

      const metrics = TokenMetricsCollector.getAgentMetrics();
      expect(Array.isArray(metrics)).toBe(true);
      expect((metrics as any[]).length).toBe(2);
    });
  });

  // ==========================================================================
  // getDomainMetrics()
  // ==========================================================================

  describe('getDomainMetrics()', () => {
    it('should aggregate metrics by domain', () => {
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'test-generation', 'op', {
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
      });
      TokenMetricsCollector.recordTokenUsage('task-2', 'agent-1', 'test-generation', 'op', {
        inputTokens: 150,
        outputTokens: 150,
        totalTokens: 300,
      });

      const metrics = TokenMetricsCollector.getDomainMetrics('test-generation');

      expect(metrics).not.toBeInstanceOf(Map);
      const domainUsage = metrics as TokenUsage;
      expect(domainUsage.totalTokens).toBe(600);
    });

    it('should return all domains when no domain specified', () => {
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'test-generation', 'op', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });
      TokenMetricsCollector.recordTokenUsage('task-2', 'agent-1', 'coverage-analysis', 'op', {
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
      });

      const metrics = TokenMetricsCollector.getDomainMetrics();
      expect(metrics).toBeInstanceOf(Map);
      expect((metrics as Map<string, TokenUsage>).size).toBe(2);
    });
  });

  // ==========================================================================
  // getTokenEfficiency()
  // ==========================================================================

  describe('getTokenEfficiency()', () => {
    it('should calculate cache hit rate as percentage', () => {
      // 3 tasks with pattern reuse
      for (let i = 0; i < 3; i++) {
        TokenMetricsCollector.recordTokenUsage(`task-${i}`, 'agent-1', 'domain', 'op', {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        }, { patternReused: true });
      }
      // 2 tasks without pattern reuse
      for (let i = 3; i < 5; i++) {
        TokenMetricsCollector.recordTokenUsage(`task-${i}`, 'agent-1', 'domain', 'op', {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        }, { patternReused: false });
      }

      const efficiency = TokenMetricsCollector.getTokenEfficiency();

      // 3 reused out of 5 = 0.6
      expect(efficiency.patternReuseRate).toBe(0.6);
    });

    it('should calculate average tokens per task', () => {
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'domain', 'op', {
        inputTokens: 100,
        outputTokens: 100,
        totalTokens: 200,
      });
      TokenMetricsCollector.recordTokenUsage('task-2', 'agent-1', 'domain', 'op', {
        inputTokens: 200,
        outputTokens: 200,
        totalTokens: 400,
      });

      const efficiency = TokenMetricsCollector.getTokenEfficiency();

      // (200 + 400) / 2 = 300
      expect(efficiency.averageTokensPerTask).toBe(300);
    });

    it('should calculate total tokens saved from pattern reuse', () => {
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'domain', 'op', {
        inputTokens: 100,
        outputTokens: 100,
        totalTokens: 200,
      }, { patternReused: true, tokensSaved: 500 });

      TokenMetricsCollector.recordPatternReuse('task-2', 300);

      const efficiency = TokenMetricsCollector.getTokenEfficiency();

      expect(efficiency.totalTokensSaved).toBe(800);
    });

    it('should return zero efficiency when no records exist', () => {
      const efficiency = TokenMetricsCollector.getTokenEfficiency();

      expect(efficiency.patternReuseRate).toBe(0);
      expect(efficiency.averageTokensPerTask).toBe(0);
      expect(efficiency.totalTokensSaved).toBe(0);
      expect(efficiency.totalTokensUsed).toBe(0);
    });

    it('should generate recommendations based on analysis', () => {
      // Record many tasks without pattern reuse
      for (let i = 0; i < 15; i++) {
        TokenMetricsCollector.recordTokenUsage(`task-${i}`, 'agent-1', 'domain', 'op', {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        });
      }

      const efficiency = TokenMetricsCollector.getTokenEfficiency();

      expect(efficiency.recommendations.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Timeframe Filtering
  // ==========================================================================

  describe('timeframe filtering', () => {
    it('should filter by 1h timeframe', () => {
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'domain', 'op', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });

      const metrics = TokenMetricsCollector.getTaskMetrics('1h');
      expect(metrics.length).toBe(1);
    });

    it('should filter by 24h timeframe', () => {
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'domain', 'op', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });

      const metrics = TokenMetricsCollector.getTaskMetrics('24h');
      expect(metrics.length).toBe(1);
    });

    it('should filter by 7d timeframe', () => {
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'domain', 'op', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });

      const metrics = TokenMetricsCollector.getTaskMetrics('7d');
      expect(metrics.length).toBe(1);
    });

    it('should filter by 30d timeframe', () => {
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'domain', 'op', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });

      const metrics = TokenMetricsCollector.getTaskMetrics('30d');
      expect(metrics.length).toBe(1);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle zero tokens gracefully', () => {
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'domain', 'op', {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      });

      const summary = TokenMetricsCollector.getSessionSummary();
      const efficiency = TokenMetricsCollector.getTokenEfficiency();

      expect(summary.totalUsage.totalTokens).toBe(0);
      expect(efficiency.averageTokensPerTask).toBe(0);
    });

    it('should handle very large token counts', () => {
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'domain', 'op', {
        inputTokens: 1000000,
        outputTokens: 500000,
        totalTokens: 1500000,
      });

      const summary = TokenMetricsCollector.getSessionSummary();

      expect(summary.totalUsage.totalTokens).toBe(1500000);
    });

    it('should handle records with default agent and domain', () => {
      TokenMetricsCollector.recordTokenUsage('task-1', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });

      const summary = TokenMetricsCollector.getSessionSummary();
      expect(summary.byAgent.get('default')).toBeDefined();
      expect(summary.byDomain.get('unknown')).toBeDefined();
    });
  });

  // ==========================================================================
  // Cost Configuration
  // ==========================================================================

  describe('cost configuration', () => {
    it('should use custom cost configuration', () => {
      TokenMetricsCollector.setCostConfig({
        costPerInputToken: 0.01 / 1000,  // 10x more expensive
        costPerOutputToken: 0.05 / 1000,
      });

      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'domain', 'op', {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      });

      const summary = TokenMetricsCollector.getSessionSummary();
      // Cost should be higher than default
      expect(summary.totalUsage.estimatedCostUsd).toBeGreaterThan(0.01);
    });
  });

  // ==========================================================================
  // Helper Functions
  // ==========================================================================

  describe('helper functions', () => {
    describe('formatCostUsd', () => {
      it('should format cost as USD string', () => {
        expect(formatCostUsd(0.01)).toBe('$0.01');
        expect(formatCostUsd(1.5)).toBe('$1.50');
        expect(formatCostUsd(0.001)).toBe('$0.00');
        expect(formatCostUsd(100)).toBe('$100.00');
      });
    });

    describe('estimateTokens', () => {
      it('should estimate tokens from text length', () => {
        // ~4 characters per token
        expect(estimateTokens('Hello')).toBe(2); // 5 chars -> 2 tokens
        expect(estimateTokens('This is a test')).toBe(4); // 14 chars -> 4 tokens
        expect(estimateTokens('')).toBe(0);
      });

      it('should handle long text', () => {
        const longText = 'a'.repeat(1000);
        expect(estimateTokens(longText)).toBe(250); // 1000 / 4 = 250
      });
    });
  });

  // ==========================================================================
  // Persistence
  // ==========================================================================

  describe('persistence', () => {
    it('should configure persistence settings', () => {
      TokenMetricsCollector.configurePersistence({
        filePath: '/tmp/test-token-metrics.json',
        autoSaveIntervalMs: 0, // Disable auto-save for tests
      });

      expect(TokenMetricsCollector.getPersistenceFilePath()).toBe('/tmp/test-token-metrics.json');
    });

    it('should track unsaved changes', () => {
      TokenMetricsCollector.configurePersistence({
        autoSaveIntervalMs: 0,
      });

      expect(TokenMetricsCollector.hasUnsavedChanges()).toBe(false);

      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'domain', 'op', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });

      expect(TokenMetricsCollector.hasUnsavedChanges()).toBe(true);
    });
  });
});

// ==========================================================================
// Separate Instance Tests
// ==========================================================================

describe('TokenMetricsCollectorImpl', () => {
  it('should allow creating separate instances for testing', () => {
    const instance1 = new TokenMetricsCollectorImpl();
    const instance2 = new TokenMetricsCollectorImpl();

    instance1.recordTokenUsage('task-1', {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    });

    // Instance 2 should be independent
    const summary1 = instance1.getSessionSummary();
    const summary2 = instance2.getSessionSummary();

    expect(summary1.totalUsage.totalTokens).toBe(150);
    expect(summary2.totalUsage.totalTokens).toBe(0);
  });

  it('should have independent session IDs', () => {
    const instance1 = new TokenMetricsCollectorImpl();
    const instance2 = new TokenMetricsCollectorImpl();

    const summary1 = instance1.getSessionSummary();
    const summary2 = instance2.getSessionSummary();

    expect(summary1.sessionId).not.toBe(summary2.sessionId);
  });
});
