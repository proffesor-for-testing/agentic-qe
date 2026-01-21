/**
 * Agentic QE v3 - Token Usage Tool Tests
 * Tests for the token_usage MCP tool (ADR-042)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TokenUsageTool,
  tokenUsageTool,
  TokenUsageParams,
  TokenUsageResult,
} from '../../../../../src/mcp/tools/analysis/token-usage';
import {
  TokenMetricsCollector,
  TokenMetricsCollectorImpl,
} from '../../../../../src/learning/token-tracker';

describe('TokenUsageTool', () => {
  let tool: TokenUsageTool;

  beforeEach(() => {
    tool = new TokenUsageTool();
    TokenMetricsCollector.reset();
  });

  afterEach(() => {
    TokenMetricsCollector.reset();
  });

  describe('config', () => {
    it('should have correct tool name', () => {
      expect(tool.name).toBe('qe/analysis/token_usage');
    });

    it('should have description', () => {
      expect(tool.description).toContain('token consumption');
    });

    it('should have learning-optimization domain', () => {
      expect(tool.domain).toBe('learning-optimization');
    });

    it('should have JSON schema', () => {
      const schema = tool.getSchema();
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
      expect(schema.properties.operation).toBeDefined();
      expect(schema.required).toContain('operation');
    });
  });

  describe('execute - session operation', () => {
    it('should return session summary with no data', async () => {
      const params: TokenUsageParams = { operation: 'session' };
      const context = { requestId: 'test-1', startTime: Date.now() };

      const result = await tool.execute(params, context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.operation).toBe('session');
      expect(result.data!.summary.totalTokens).toBe(0);
      expect(result.data!.optimization).toBeDefined();
    });

    it('should return session summary with recorded data', async () => {
      // Record some token usage
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'test-generation',
        'generate',
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
      );

      const params: TokenUsageParams = { operation: 'session' };
      const context = { requestId: 'test-2', startTime: Date.now() };

      const result = await tool.execute(params, context);

      expect(result.success).toBe(true);
      expect(result.data!.summary.totalTokens).toBe(150);
      expect(result.data!.breakdown?.byAgent).toBeDefined();
      expect(result.data!.breakdown?.byDomain).toBeDefined();
    });

    it('should filter by timeframe', async () => {
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'test-generation',
        'generate',
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
      );

      const params: TokenUsageParams = { operation: 'session', timeframe: '1h' };
      const context = { requestId: 'test-3', startTime: Date.now() };

      const result = await tool.execute(params, context);

      expect(result.success).toBe(true);
      expect(result.data!.timeframe).toBe('1h');
    });
  });

  describe('execute - agent operation', () => {
    beforeEach(() => {
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'test-generation',
        'generate',
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
      );
      TokenMetricsCollector.recordTokenUsage(
        'task-2',
        'agent-2',
        'coverage-analysis',
        'analyze',
        { inputTokens: 200, outputTokens: 100, totalTokens: 300 }
      );
    });

    it('should return all agent metrics', async () => {
      const params: TokenUsageParams = { operation: 'agent' };
      const context = { requestId: 'test-4', startTime: Date.now() };

      const result = await tool.execute(params, context);

      expect(result.success).toBe(true);
      expect(result.data!.breakdown?.byAgent).toBeDefined();
      expect(Object.keys(result.data!.breakdown!.byAgent!).length).toBe(2);
    });

    it('should return specific agent metrics', async () => {
      const params: TokenUsageParams = { operation: 'agent', agentId: 'agent-1' };
      const context = { requestId: 'test-5', startTime: Date.now() };

      const result = await tool.execute(params, context);

      expect(result.success).toBe(true);
      expect(result.data!.summary.totalTokens).toBe(150);
      expect(result.data!.details?.agentMetrics).toBeDefined();
      expect(result.data!.details!.agentMetrics!.agentId).toBe('agent-1');
    });
  });

  describe('execute - domain operation', () => {
    beforeEach(() => {
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'test-generation',
        'generate',
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
      );
      TokenMetricsCollector.recordTokenUsage(
        'task-2',
        'agent-2',
        'coverage-analysis',
        'analyze',
        { inputTokens: 200, outputTokens: 100, totalTokens: 300 }
      );
    });

    it('should return all domain metrics', async () => {
      const params: TokenUsageParams = { operation: 'domain' };
      const context = { requestId: 'test-6', startTime: Date.now() };

      const result = await tool.execute(params, context);

      expect(result.success).toBe(true);
      expect(result.data!.breakdown?.byDomain).toBeDefined();
      expect(Object.keys(result.data!.breakdown!.byDomain!).length).toBe(2);
    });

    it('should return specific domain metrics', async () => {
      const params: TokenUsageParams = { operation: 'domain', domain: 'test-generation' };
      const context = { requestId: 'test-7', startTime: Date.now() };

      const result = await tool.execute(params, context);

      expect(result.success).toBe(true);
      expect(result.data!.summary.totalTokens).toBe(150);
      expect(result.data!.details?.domainMetrics).toBeDefined();
      expect(result.data!.details!.domainMetrics!.domain).toBe('test-generation');
    });
  });

  describe('execute - task operation', () => {
    it('should return task-level metrics', async () => {
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'test-generation',
        'generate',
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
      );

      const params: TokenUsageParams = { operation: 'task' };
      const context = { requestId: 'test-8', startTime: Date.now() };

      const result = await tool.execute(params, context);

      expect(result.success).toBe(true);
      expect(result.data!.details?.taskMetrics).toBeDefined();
      expect(result.data!.details!.taskMetrics!.length).toBe(1);
      expect(result.data!.details!.taskMetrics![0].taskId).toBe('task-1');
    });
  });

  describe('execute - efficiency operation', () => {
    it('should return efficiency report', async () => {
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'test-generation',
        'generate',
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        { patternReused: true, tokensSaved: 100 }
      );

      const params: TokenUsageParams = { operation: 'efficiency' };
      const context = { requestId: 'test-9', startTime: Date.now() };

      const result = await tool.execute(params, context);

      expect(result.success).toBe(true);
      expect(result.data!.optimization.recommendations).toBeDefined();
      expect(result.data!.optimization.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('execute - error handling', () => {
    it('should fail on unknown operation', async () => {
      const params = { operation: 'unknown' } as unknown as TokenUsageParams;
      const context = { requestId: 'test-10', startTime: Date.now() };

      const result = await tool.execute(params, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown operation');
    });
  });

  describe('optimization tracking', () => {
    it('should track pattern reuse', async () => {
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'test-generation',
        'generate',
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        { patternReused: true, tokensSaved: 200 }
      );

      const params: TokenUsageParams = { operation: 'session' };
      const context = { requestId: 'test-11', startTime: Date.now() };

      const result = await tool.execute(params, context);

      expect(result.success).toBe(true);
      expect(result.data!.optimization.patternsReused).toBe(1);
      expect(result.data!.summary.tokensSaved).toBeGreaterThan(0);
    });

    it('should track cache hits', async () => {
      TokenMetricsCollector.recordCacheHit(500);

      const params: TokenUsageParams = { operation: 'session' };
      const context = { requestId: 'test-12', startTime: Date.now() };

      const result = await tool.execute(params, context);

      expect(result.success).toBe(true);
      expect(result.data!.optimization.cacheHits).toBe(1);
    });

    it('should track early exits', async () => {
      TokenMetricsCollector.recordEarlyExit(800);

      const params: TokenUsageParams = { operation: 'session' };
      const context = { requestId: 'test-13', startTime: Date.now() };

      const result = await tool.execute(params, context);

      expect(result.success).toBe(true);
      expect(result.data!.optimization.earlyExits).toBe(1);
    });
  });
});

describe('tokenUsageTool (standalone)', () => {
  beforeEach(() => {
    TokenMetricsCollector.reset();
  });

  it('should execute via standalone function', async () => {
    const result = await tokenUsageTool.execute({ operation: 'session' });

    expect(result).toBeDefined();
    expect(result.operation).toBe('session');
    expect(result.summary).toBeDefined();
  });

  it('should have correct schema', () => {
    expect(tokenUsageTool.name).toBe('token_usage');
    expect(tokenUsageTool.inputSchema.properties.operation).toBeDefined();
  });
});

describe('TokenMetricsCollector', () => {
  beforeEach(() => {
    TokenMetricsCollector.reset();
  });

  afterEach(() => {
    TokenMetricsCollector.reset();
  });

  describe('recordTokenUsage', () => {
    it('should record basic token usage', () => {
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'test-generation',
        'generate',
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
      );

      const summary = TokenMetricsCollector.getSessionSummary();
      expect(summary.totalUsage.totalTokens).toBe(150);
    });

    it('should calculate cost automatically', () => {
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'test-generation',
        'generate',
        { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 }
      );

      const summary = TokenMetricsCollector.getSessionSummary();
      expect(summary.totalUsage.estimatedCostUsd).toBeDefined();
      expect(summary.totalUsage.estimatedCostUsd).toBeGreaterThan(0);
    });

    it('should aggregate by agent', () => {
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'test-generation',
        'generate',
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
      );
      TokenMetricsCollector.recordTokenUsage(
        'task-2',
        'agent-1',
        'test-generation',
        'generate',
        { inputTokens: 200, outputTokens: 100, totalTokens: 300 }
      );

      const summary = TokenMetricsCollector.getSessionSummary();
      const agentMetrics = summary.byAgent.get('agent-1');

      expect(agentMetrics).toBeDefined();
      expect(agentMetrics!.totalTokens).toBe(450);
      expect(agentMetrics!.tasksExecuted).toBe(2);
    });

    it('should aggregate by domain', () => {
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'test-generation',
        'generate',
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
      );

      const summary = TokenMetricsCollector.getSessionSummary();
      const domainMetrics = summary.byDomain.get('test-generation');

      expect(domainMetrics).toBeDefined();
      expect(domainMetrics!.totalTokens).toBe(150);
    });
  });

  describe('getEfficiencyReport', () => {
    it('should generate recommendations for low reuse', () => {
      // Record multiple tasks without pattern reuse
      for (let i = 0; i < 10; i++) {
        TokenMetricsCollector.recordTokenUsage(
          `task-${i}`,
          'agent-1',
          'test-generation',
          'generate',
          { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
        );
      }

      const report = TokenMetricsCollector.getEfficiencyReport();

      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.patternReuseRate).toBe(0);
    });

    it('should calculate average tokens per task', () => {
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'test-generation',
        'generate',
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
      );
      TokenMetricsCollector.recordTokenUsage(
        'task-2',
        'agent-1',
        'test-generation',
        'generate',
        { inputTokens: 200, outputTokens: 100, totalTokens: 300 }
      );

      const report = TokenMetricsCollector.getEfficiencyReport();

      expect(report.averageTokensPerTask).toBe(225); // (150 + 300) / 2
    });
  });

  describe('timeframe filtering', () => {
    it('should filter metrics by 1h timeframe', () => {
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'test-generation',
        'generate',
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
      );

      const metrics = TokenMetricsCollector.getTaskMetrics('1h');
      expect(metrics.length).toBe(1);
    });

    it('should filter metrics by 24h timeframe', () => {
      TokenMetricsCollector.recordTokenUsage(
        'task-1',
        'agent-1',
        'test-generation',
        'generate',
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
      );

      const metrics = TokenMetricsCollector.getTaskMetrics('24h');
      expect(metrics.length).toBe(1);
    });
  });
});
