/**
 * Integration Tests: ADR-042 Token Tracking End-to-End
 *
 * Verifies that token tracking flows from:
 * 1. LLM Providers -> TokenMetricsCollector
 * 2. TokenMetricsCollector -> MCP Tool
 * 3. All interfaces are properly extended
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TokenMetricsCollector,
  TokenMetricsCollectorImpl,
  TokenUsage,
  TaskTokenMetric,
  AgentTokenMetrics,
  SessionTokenSummary,
} from '../../src/learning/token-tracker.js';
import { TokenUsageTool } from '../../src/mcp/tools/analysis/token-usage.js';
import type { TaskMetric } from '../../src/mcp/metrics/metrics-collector.js';
import type { QEPattern } from '../../src/learning/qe-patterns.js';

describe('ADR-042: Token Tracking Integration', () => {
  beforeEach(() => {
    // Reset the singleton before each test
    TokenMetricsCollector.reset();
  });

  describe('TokenMetricsCollector Integration', () => {
    it('should record token usage and aggregate by agent', () => {
      // Simulate LLM provider calls
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'claude-provider',
        'llm',
        'generate',
        {
          inputTokens: 500,
          outputTokens: 200,
          totalTokens: 700,
          estimatedCostUsd: 0.021,
        }
      );

      TokenMetricsCollector.recordTokenUsage(
        'task-2',
        'claude-provider',
        'llm',
        'generate',
        {
          inputTokens: 300,
          outputTokens: 150,
          totalTokens: 450,
          estimatedCostUsd: 0.0135,
        }
      );

      // Get agent metrics
      const metrics = TokenMetricsCollector.getAgentMetrics('claude-provider') as AgentTokenMetrics;

      expect(metrics.agentId).toBe('claude-provider');
      expect(metrics.totalInputTokens).toBe(800);
      expect(metrics.totalOutputTokens).toBe(350);
      expect(metrics.totalTokens).toBe(1150);
      expect(metrics.tasksExecuted).toBe(2);
    });

    it('should record token usage and aggregate by domain', () => {
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'test-generation',
        'generate-tests',
        {
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
        }
      );

      TokenMetricsCollector.recordTokenUsage(
        'task-2',
        'agent-2',
        'coverage-analysis',
        'analyze-gaps',
        {
          inputTokens: 600,
          outputTokens: 300,
          totalTokens: 900,
        }
      );

      const domainMetrics = TokenMetricsCollector.getDomainMetrics() as Map<string, TokenUsage>;

      expect(domainMetrics.get('test-generation')?.totalTokens).toBe(1500);
      expect(domainMetrics.get('coverage-analysis')?.totalTokens).toBe(900);
    });

    it('should track pattern reuse and calculate savings', () => {
      // Record normal usage
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'test-generation',
        'generate',
        {
          inputTokens: 500,
          outputTokens: 200,
          totalTokens: 700,
        }
      );

      // Record pattern reuse (tokens saved)
      TokenMetricsCollector.recordPatternReuse('task-2', 700);

      const efficiency = TokenMetricsCollector.getTokenEfficiency();

      expect(efficiency.totalTokensUsed).toBe(700);
      expect(efficiency.totalTokensSaved).toBe(700);
      expect(efficiency.savingsPercentage).toBe(50);
    });

    it('should track cache hits and early exits', () => {
      TokenMetricsCollector.recordCacheHit(300);
      TokenMetricsCollector.recordEarlyExit(500);

      const summary = TokenMetricsCollector.getSessionSummary();

      expect(summary.optimizationStats.cacheHits).toBe(1);
      expect(summary.optimizationStats.earlyExits).toBe(1);
      expect(summary.optimizationStats.tokensSaved).toBe(800);
    });

    it('should filter metrics by timeframe', () => {
      // Record usage now
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'llm',
        'generate',
        {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        }
      );

      // Get metrics for last hour (should include recent task)
      const recentMetrics = TokenMetricsCollector.getTaskMetrics('1h');
      expect(recentMetrics.length).toBe(1);

      // All timeframes should work
      const dailyMetrics = TokenMetricsCollector.getTaskMetrics('24h');
      expect(dailyMetrics.length).toBe(1);
    });
  });

  describe('MCP Token Usage Tool Integration', () => {
    let tool: TokenUsageTool;

    beforeEach(() => {
      tool = new TokenUsageTool();
    });

    it('should return session usage via MCP tool', async () => {
      // Setup test data
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'qe-test-generator',
        'test-generation',
        'generate',
        {
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
          estimatedCostUsd: 0.045,
        }
      );

      const result = await tool.execute(
        { operation: 'session' },
        { requestId: 'test-1', startTime: Date.now() }
      );

      expect(result.success).toBe(true);
      expect(result.data?.summary.totalTokens).toBe(1500);
      expect(result.data?.breakdown?.byAgent?.['qe-test-generator']?.tokens).toBe(1500);
    });

    it('should return agent-specific usage via MCP tool', async () => {
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-alpha',
        'test-generation',
        'generate',
        {
          inputTokens: 800,
          outputTokens: 400,
          totalTokens: 1200,
        }
      );

      TokenMetricsCollector.recordTokenUsage(
        'task-2',
        'agent-beta',
        'coverage-analysis',
        'analyze',
        {
          inputTokens: 500,
          outputTokens: 250,
          totalTokens: 750,
        }
      );

      const result = await tool.execute(
        { operation: 'agent', agentId: 'agent-alpha' },
        { requestId: 'test-2', startTime: Date.now() }
      );

      expect(result.success).toBe(true);
      expect(result.data?.summary.totalTokens).toBe(1200);
      expect(result.data?.details?.agentMetrics?.agentId).toBe('agent-alpha');
    });

    it('should return domain-specific usage via MCP tool', async () => {
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'security-compliance',
        'scan',
        {
          inputTokens: 2000,
          outputTokens: 1000,
          totalTokens: 3000,
        }
      );

      const result = await tool.execute(
        { operation: 'domain', domain: 'security-compliance' },
        { requestId: 'test-3', startTime: Date.now() }
      );

      expect(result.success).toBe(true);
      expect(result.data?.summary.totalTokens).toBe(3000);
      expect(result.data?.details?.domainMetrics?.domain).toBe('security-compliance');
    });

    it('should return efficiency report with recommendations', async () => {
      // Add enough data to trigger recommendations
      for (let i = 0; i < 15; i++) {
        TokenMetricsCollector.recordTokenUsage(
          `task-${i}`,
          'agent-1',
          'test-generation',
          'generate',
          {
            inputTokens: 500,
            outputTokens: 250,
            totalTokens: 750,
          }
        );
      }

      const result = await tool.execute(
        { operation: 'efficiency' },
        { requestId: 'test-4', startTime: Date.now() }
      );

      expect(result.success).toBe(true);
      expect(result.data?.optimization.recommendations).toBeDefined();
      expect(result.data?.optimization.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Interface Extensions Verification', () => {
    it('TaskMetric should support token tracking fields', () => {
      // Verify the TaskMetric interface has the new fields
      const taskMetric: TaskMetric = {
        taskId: 'task-1',
        agentId: 'agent-1',
        startTime: [0, 0],
        success: true,
        retries: 0,
        // ADR-042 fields
        tokenUsage: {
          inputTokens: 500,
          outputTokens: 200,
          totalTokens: 700,
        },
        patternReused: true,
        tokensSaved: 500,
        domain: 'test-generation',
      };

      expect(taskMetric.tokenUsage).toBeDefined();
      expect(taskMetric.tokenUsage?.totalTokens).toBe(700);
      expect(taskMetric.patternReused).toBe(true);
      expect(taskMetric.tokensSaved).toBe(500);
      expect(taskMetric.domain).toBe('test-generation');
    });

    it('QEPattern should support token tracking fields', () => {
      // Verify the QEPattern interface has the new fields
      const pattern: Partial<QEPattern> = {
        id: 'pattern-1',
        name: 'Test Pattern',
        // ADR-042 fields
        tokensUsed: 1500,
        inputTokens: 1000,
        outputTokens: 500,
        latencyMs: 250,
        reusable: true,
        reuseCount: 5,
        averageTokenSavings: 1200,
        totalTokensSaved: 6000,
      };

      expect(pattern.tokensUsed).toBe(1500);
      expect(pattern.inputTokens).toBe(1000);
      expect(pattern.outputTokens).toBe(500);
      expect(pattern.latencyMs).toBe(250);
      expect(pattern.reusable).toBe(true);
      expect(pattern.reuseCount).toBe(5);
      expect(pattern.averageTokenSavings).toBe(1200);
      expect(pattern.totalTokensSaved).toBe(6000);
    });
  });

  describe('End-to-End Flow Simulation', () => {
    it('should simulate complete LLM -> TokenTracker -> MCP Tool flow', async () => {
      // Step 1: Simulate LLM provider recording usage (as the providers now do)
      const requestId = `claude-1-${Date.now()}`;
      TokenMetricsCollector.recordTokenUsage(
        requestId,
        'claude-provider',
        'llm',
        'generate',
        {
          inputTokens: 1500,
          outputTokens: 750,
          totalTokens: 2250,
          estimatedCostUsd: 0.0675,
        }
      );

      // Step 2: Simulate pattern reuse saving tokens
      TokenMetricsCollector.recordPatternReuse('cached-task-1', 800);
      TokenMetricsCollector.recordEarlyExit(600);
      TokenMetricsCollector.recordCacheHit(400);

      // Step 3: Query via MCP tool
      const tool = new TokenUsageTool();
      const result = await tool.execute(
        { operation: 'session' },
        { requestId: 'e2e-test', startTime: Date.now() }
      );

      // Verify complete flow
      expect(result.success).toBe(true);

      // Tokens used
      expect(result.data?.summary.totalTokens).toBe(2250);

      // Tokens saved (800 + 600 + 400 = 1800)
      expect(result.data?.summary.tokensSaved).toBe(1800);

      // Optimization stats
      expect(result.data?.optimization.patternsReused).toBe(1);
      expect(result.data?.optimization.earlyExits).toBe(1);
      expect(result.data?.optimization.cacheHits).toBe(1);

      // Savings percentage should be calculated correctly
      // 1800 saved / (2250 used + 1800 saved) = 44.44%
      expect(result.data?.summary.savingsPercentage).toBeCloseTo(44.44, 1);
    });

    it('should track multiple providers separately', async () => {
      // Simulate Claude provider
      TokenMetricsCollector.recordTokenUsage(
        'claude-req-1',
        'claude-provider',
        'llm',
        'generate',
        {
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
        }
      );

      // Simulate OpenAI provider
      TokenMetricsCollector.recordTokenUsage(
        'openai-req-1',
        'openai-provider',
        'llm',
        'generate',
        {
          inputTokens: 800,
          outputTokens: 400,
          totalTokens: 1200,
        }
      );

      // Simulate Ollama provider (local, free)
      TokenMetricsCollector.recordTokenUsage(
        'ollama-req-1',
        'ollama-provider',
        'llm',
        'generate',
        {
          inputTokens: 500,
          outputTokens: 250,
          totalTokens: 750,
          estimatedCostUsd: 0, // Local is free
        }
      );

      const tool = new TokenUsageTool();
      const result = await tool.execute(
        { operation: 'agent' },
        { requestId: 'multi-provider-test', startTime: Date.now() }
      );

      expect(result.success).toBe(true);

      // Check each provider is tracked
      const breakdown = result.data?.breakdown?.byAgent;
      expect(breakdown?.['claude-provider']?.tokens).toBe(1500);
      expect(breakdown?.['openai-provider']?.tokens).toBe(1200);
      expect(breakdown?.['ollama-provider']?.tokens).toBe(750);

      // Total should be sum of all
      expect(result.data?.summary.totalTokens).toBe(3450);
    });
  });
});
