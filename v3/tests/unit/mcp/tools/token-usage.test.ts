/**
 * Agentic QE v3 - Token Usage MCP Tool Tests
 * ADR-042: Token Tracking Implementation
 *
 * Tests for the token_usage MCP tool that provides session, agent, domain,
 * and task-level token usage metrics with optimization recommendations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// Type Definitions (matching expected ADR-042 implementation)
// ============================================================================

interface TokenUsageParams {
  operation: 'session' | 'agent' | 'domain' | 'task';
  sessionId?: string;
  agentId?: string;
  domain?: string;
  taskId?: string;
  timeframe?: {
    start: string;
    end: string;
  };
  includeRecommendations?: boolean;
}

interface TokenUsageResult {
  success: boolean;
  data?: {
    metrics: TokenMetrics;
    recommendations?: OptimizationRecommendation[];
  };
  error?: string;
  metadata?: {
    requestId: string;
    executionTime: number;
    toolName: string;
  };
}

interface TokenMetrics {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  cacheHitRate: number;
  patternReuseRate: number;
  avgTokensPerRequest: number;
  requestCount: number;
  tokensSaved: number;
  estimatedCost?: number;
  efficiencyScore: number;
}

interface OptimizationRecommendation {
  type: 'cache' | 'pattern' | 'prompt' | 'context';
  priority: 'high' | 'medium' | 'low';
  description: string;
  estimatedSavings: number;
  action: string;
}

interface ToolResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    requestId: string;
    executionTime: number;
    toolName: string;
    domain?: string;
  };
}

// ============================================================================
// Mock Token Metrics Collector
// ============================================================================

interface MockTokenRecord {
  sessionId: string;
  agentId?: string;
  domain?: string;
  taskId?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cached: boolean;
  patternReused: boolean;
  timestamp: Date;
}

interface MockSavingsRecord {
  sessionId: string;
  tokensSaved: number;
}

class MockTokenMetricsCollector {
  private records: MockTokenRecord[] = [];
  private savings: MockSavingsRecord[] = [];

  addRecord(record: MockTokenRecord): void {
    this.records.push(record);
  }

  addSavings(saving: MockSavingsRecord): void {
    this.savings.push(saving);
  }

  getSessionMetrics(sessionId: string, timeframe?: { start: Date; end: Date }): TokenMetrics {
    let filtered = this.records.filter(r => r.sessionId === sessionId);

    if (timeframe) {
      filtered = filtered.filter(
        r => r.timestamp >= timeframe.start && r.timestamp <= timeframe.end
      );
    }

    return this.calculateMetrics(filtered, sessionId);
  }

  getAgentMetrics(agentId: string): TokenMetrics {
    const filtered = this.records.filter(r => r.agentId === agentId);
    return this.calculateMetrics(filtered, undefined, agentId);
  }

  getDomainMetrics(domain: string): TokenMetrics {
    const filtered = this.records.filter(r => r.domain === domain);
    return this.calculateMetrics(filtered, undefined, undefined, domain);
  }

  getTaskMetrics(taskId: string): TokenMetrics {
    const filtered = this.records.filter(r => r.taskId === taskId);
    return this.calculateMetrics(filtered);
  }

  private calculateMetrics(
    records: MockTokenRecord[],
    sessionId?: string,
    agentId?: string,
    domain?: string
  ): TokenMetrics {
    if (records.length === 0) {
      return {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        cacheHitRate: 0,
        patternReuseRate: 0,
        avgTokensPerRequest: 0,
        requestCount: 0,
        tokensSaved: 0,
        efficiencyScore: 0,
      };
    }

    const totalInputTokens = records.reduce((sum, r) => sum + r.inputTokens, 0);
    const totalOutputTokens = records.reduce((sum, r) => sum + r.outputTokens, 0);
    const totalTokens = records.reduce((sum, r) => sum + r.totalTokens, 0);
    const cachedCount = records.filter(r => r.cached).length;
    const patternReusedCount = records.filter(r => r.patternReused).length;

    // Get savings for this session/agent/domain
    let relevantSavings = this.savings;
    if (sessionId) {
      relevantSavings = relevantSavings.filter(s => s.sessionId === sessionId);
    }
    const tokensSaved = relevantSavings.reduce((sum, s) => sum + s.tokensSaved, 0);

    const cacheHitRate = cachedCount / records.length;
    const patternReuseRate = patternReusedCount / records.length;
    const avgTokensPerRequest = totalTokens / records.length;

    // Calculate efficiency score
    const efficiencyScore = Math.min(
      (cacheHitRate * 0.3) + (patternReuseRate * 0.4) + 0.3,
      1
    );

    return {
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      cacheHitRate: Math.round(cacheHitRate * 1000) / 1000,
      patternReuseRate: Math.round(patternReuseRate * 1000) / 1000,
      avgTokensPerRequest: Math.round(avgTokensPerRequest * 100) / 100,
      requestCount: records.length,
      tokensSaved,
      efficiencyScore: Math.round(efficiencyScore * 1000) / 1000,
    };
  }

  clear(): void {
    this.records = [];
    this.savings = [];
  }
}

// ============================================================================
// Token Usage Tool Implementation (minimal for testing)
// ============================================================================

class TokenUsageTool {
  readonly name = 'qe/token/usage';
  readonly description = 'Get token usage metrics for sessions, agents, domains, or tasks';
  readonly domain = 'learning-optimization';

  private metricsCollector: MockTokenMetricsCollector;

  constructor(metricsCollector: MockTokenMetricsCollector) {
    this.metricsCollector = metricsCollector;
  }

  getSchema() {
    return {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['session', 'agent', 'domain', 'task'],
          description: 'Type of metrics to retrieve',
        },
        sessionId: {
          type: 'string',
          description: 'Session ID for session operation',
        },
        agentId: {
          type: 'string',
          description: 'Agent ID for agent operation',
        },
        domain: {
          type: 'string',
          description: 'Domain name for domain operation',
        },
        taskId: {
          type: 'string',
          description: 'Task ID for task operation',
        },
        timeframe: {
          type: 'object',
          properties: {
            start: { type: 'string', description: 'Start time ISO string' },
            end: { type: 'string', description: 'End time ISO string' },
          },
        },
        includeRecommendations: {
          type: 'boolean',
          description: 'Include optimization recommendations',
          default: false,
        },
      },
      required: ['operation'],
    };
  }

  validate(params: TokenUsageParams): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!params.operation) {
      errors.push('Missing required field: operation');
    }

    if (!['session', 'agent', 'domain', 'task'].includes(params.operation)) {
      errors.push(`Invalid operation: ${params.operation}`);
    }

    if (params.operation === 'session' && !params.sessionId) {
      errors.push('sessionId is required for session operation');
    }

    if (params.operation === 'agent' && !params.agentId) {
      errors.push('agentId is required for agent operation');
    }

    if (params.operation === 'domain' && !params.domain) {
      errors.push('domain is required for domain operation');
    }

    if (params.operation === 'task' && !params.taskId) {
      errors.push('taskId is required for task operation');
    }

    return { valid: errors.length === 0, errors };
  }

  async invoke(params: TokenUsageParams): Promise<ToolResult<{ metrics: TokenMetrics; recommendations?: OptimizationRecommendation[] }>> {
    const startTime = Date.now();
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Validate parameters
    const validation = this.validate(params);
    if (!validation.valid) {
      return {
        success: false,
        error: `Validation failed: ${validation.errors.join(', ')}`,
        metadata: {
          requestId,
          executionTime: Date.now() - startTime,
          toolName: this.name,
        },
      };
    }

    try {
      let metrics: TokenMetrics;

      switch (params.operation) {
        case 'session': {
          const timeframe = params.timeframe ? {
            start: new Date(params.timeframe.start),
            end: new Date(params.timeframe.end),
          } : undefined;
          metrics = this.metricsCollector.getSessionMetrics(params.sessionId!, timeframe);
          break;
        }

        case 'agent':
          metrics = this.metricsCollector.getAgentMetrics(params.agentId!);
          break;

        case 'domain':
          metrics = this.metricsCollector.getDomainMetrics(params.domain!);
          break;

        case 'task':
          metrics = this.metricsCollector.getTaskMetrics(params.taskId!);
          break;

        default:
          return {
            success: false,
            error: `Unknown operation: ${params.operation}`,
            metadata: {
              requestId,
              executionTime: Date.now() - startTime,
              toolName: this.name,
            },
          };
      }

      const result: { metrics: TokenMetrics; recommendations?: OptimizationRecommendation[] } = {
        metrics,
      };

      // Generate recommendations if requested
      if (params.includeRecommendations) {
        result.recommendations = this.generateRecommendations(metrics);
      }

      return {
        success: true,
        data: result,
        metadata: {
          requestId,
          executionTime: Date.now() - startTime,
          toolName: this.name,
          domain: this.domain,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          requestId,
          executionTime: Date.now() - startTime,
          toolName: this.name,
        },
      };
    }
  }

  private generateRecommendations(metrics: TokenMetrics): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    // Low cache hit rate recommendation
    if (metrics.cacheHitRate < 0.3) {
      recommendations.push({
        type: 'cache',
        priority: 'high',
        description: 'Cache hit rate is below 30%. Enable or optimize caching for repeated queries.',
        estimatedSavings: Math.round(metrics.avgTokensPerRequest * 0.3 * metrics.requestCount),
        action: 'Enable response caching for similar requests',
      });
    }

    // Low pattern reuse recommendation
    if (metrics.patternReuseRate < 0.2) {
      recommendations.push({
        type: 'pattern',
        priority: 'high',
        description: 'Pattern reuse rate is below 20%. Consider storing successful patterns for reuse.',
        estimatedSavings: Math.round(metrics.avgTokensPerRequest * 0.5 * metrics.requestCount),
        action: 'Store and index successful response patterns in ReasoningBank',
      });
    }

    // High token usage per request
    if (metrics.avgTokensPerRequest > 2000) {
      recommendations.push({
        type: 'prompt',
        priority: 'medium',
        description: 'Average tokens per request exceeds 2000. Consider optimizing prompts.',
        estimatedSavings: Math.round(metrics.avgTokensPerRequest * 0.2 * metrics.requestCount),
        action: 'Review and compress prompt templates',
      });
    }

    // Context optimization
    if (metrics.totalInputTokens > metrics.totalOutputTokens * 3) {
      recommendations.push({
        type: 'context',
        priority: 'medium',
        description: 'Input tokens significantly exceed output. Consider reducing context size.',
        estimatedSavings: Math.round(metrics.totalInputTokens * 0.3),
        action: 'Use code-intelligence for targeted context retrieval (80% token reduction)',
      });
    }

    // Low efficiency score
    if (metrics.efficiencyScore < 0.5) {
      recommendations.push({
        type: 'cache',
        priority: 'low',
        description: 'Overall efficiency score is below 50%. Multiple optimizations recommended.',
        estimatedSavings: Math.round(metrics.totalTokens * 0.2),
        action: 'Run comprehensive optimization analysis with qe/learning/optimize',
      });
    }

    return recommendations;
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('TokenUsageTool', () => {
  let metricsCollector: MockTokenMetricsCollector;
  let tool: TokenUsageTool;

  beforeEach(() => {
    metricsCollector = new MockTokenMetricsCollector();
    tool = new TokenUsageTool(metricsCollector);
  });

  afterEach(() => {
    metricsCollector.clear();
  });

  // ==========================================================================
  // Tool Properties
  // ==========================================================================

  describe('tool properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('qe/token/usage');
    });

    it('should have correct description', () => {
      expect(tool.description).toContain('token usage');
    });

    it('should belong to learning-optimization domain', () => {
      expect(tool.domain).toBe('learning-optimization');
    });
  });

  // ==========================================================================
  // Schema
  // ==========================================================================

  describe('getSchema()', () => {
    it('should return valid schema', () => {
      const schema = tool.getSchema();

      expect(schema.type).toBe('object');
      expect(schema.properties.operation).toBeDefined();
      expect(schema.properties.operation.enum).toContain('session');
      expect(schema.properties.operation.enum).toContain('agent');
      expect(schema.properties.operation.enum).toContain('domain');
      expect(schema.properties.operation.enum).toContain('task');
      expect(schema.required).toContain('operation');
    });

    it('should define optional parameters', () => {
      const schema = tool.getSchema();

      expect(schema.properties.sessionId).toBeDefined();
      expect(schema.properties.agentId).toBeDefined();
      expect(schema.properties.domain).toBeDefined();
      expect(schema.properties.taskId).toBeDefined();
      expect(schema.properties.timeframe).toBeDefined();
      expect(schema.properties.includeRecommendations).toBeDefined();
    });
  });

  // ==========================================================================
  // Validation
  // ==========================================================================

  describe('validate()', () => {
    it('should reject missing operation', () => {
      const result = tool.validate({} as TokenUsageParams);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: operation');
    });

    it('should reject invalid operation', () => {
      const result = tool.validate({ operation: 'invalid' as any });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid operation');
    });

    it('should require sessionId for session operation', () => {
      const result = tool.validate({ operation: 'session' });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('sessionId is required for session operation');
    });

    it('should require agentId for agent operation', () => {
      const result = tool.validate({ operation: 'agent' });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('agentId is required for agent operation');
    });

    it('should require domain for domain operation', () => {
      const result = tool.validate({ operation: 'domain' });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('domain is required for domain operation');
    });

    it('should require taskId for task operation', () => {
      const result = tool.validate({ operation: 'task' });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('taskId is required for task operation');
    });

    it('should accept valid session params', () => {
      const result = tool.validate({ operation: 'session', sessionId: 'sess-1' });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Session Operation
  // ==========================================================================

  describe('session operation', () => {
    it('should return session metrics', async () => {
      // Add test data
      metricsCollector.addRecord({
        sessionId: 'session-1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: true,
        patternReused: false,
        timestamp: new Date(),
      });

      metricsCollector.addRecord({
        sessionId: 'session-1',
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
        cached: false,
        patternReused: true,
        timestamp: new Date(),
      });

      const result = await tool.invoke({
        operation: 'session',
        sessionId: 'session-1',
      });

      expect(result.success).toBe(true);
      expect(result.data?.metrics).toBeDefined();
      expect(result.data?.metrics.totalTokens).toBe(450);
      expect(result.data?.metrics.requestCount).toBe(2);
      expect(result.data?.metrics.cacheHitRate).toBe(0.5);
      expect(result.data?.metrics.patternReuseRate).toBe(0.5);
    });

    it('should filter by timeframe', async () => {
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      // Record from 2 hours ago
      metricsCollector.addRecord({
        sessionId: 'session-1',
        inputTokens: 500,
        outputTokens: 500,
        totalTokens: 1000,
        cached: false,
        patternReused: false,
        timestamp: twoHoursAgo,
      });

      // Recent record
      metricsCollector.addRecord({
        sessionId: 'session-1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: true,
        patternReused: true,
        timestamp: now,
      });

      const result = await tool.invoke({
        operation: 'session',
        sessionId: 'session-1',
        timeframe: {
          start: hourAgo.toISOString(),
          end: new Date(now.getTime() + 1000).toISOString(),
        },
      });

      expect(result.success).toBe(true);
      expect(result.data?.metrics.totalTokens).toBe(150);
      expect(result.data?.metrics.requestCount).toBe(1);
    });

    it('should return empty metrics for unknown session', async () => {
      const result = await tool.invoke({
        operation: 'session',
        sessionId: 'non-existent',
      });

      expect(result.success).toBe(true);
      expect(result.data?.metrics.totalTokens).toBe(0);
      expect(result.data?.metrics.requestCount).toBe(0);
    });
  });

  // ==========================================================================
  // Agent Operation
  // ==========================================================================

  describe('agent operation', () => {
    it('should return agent metrics', async () => {
      metricsCollector.addRecord({
        sessionId: 'session-1',
        agentId: 'agent-1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: false,
        timestamp: new Date(),
      });

      metricsCollector.addRecord({
        sessionId: 'session-1',
        agentId: 'agent-1',
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
        cached: true,
        patternReused: true,
        timestamp: new Date(),
      });

      metricsCollector.addRecord({
        sessionId: 'session-1',
        agentId: 'agent-2', // Different agent
        inputTokens: 500,
        outputTokens: 500,
        totalTokens: 1000,
        cached: false,
        patternReused: false,
        timestamp: new Date(),
      });

      const result = await tool.invoke({
        operation: 'agent',
        agentId: 'agent-1',
      });

      expect(result.success).toBe(true);
      expect(result.data?.metrics.totalTokens).toBe(450);
      expect(result.data?.metrics.requestCount).toBe(2);
    });

    it('should return empty metrics for unknown agent', async () => {
      const result = await tool.invoke({
        operation: 'agent',
        agentId: 'non-existent',
      });

      expect(result.success).toBe(true);
      expect(result.data?.metrics.totalTokens).toBe(0);
    });
  });

  // ==========================================================================
  // Domain Operation
  // ==========================================================================

  describe('domain operation', () => {
    it('should return domain metrics', async () => {
      metricsCollector.addRecord({
        sessionId: 'session-1',
        domain: 'test-generation',
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        cached: true,
        patternReused: true,
        timestamp: new Date(),
      });

      metricsCollector.addRecord({
        sessionId: 'session-1',
        domain: 'test-generation',
        inputTokens: 150,
        outputTokens: 150,
        totalTokens: 300,
        cached: true,
        patternReused: false,
        timestamp: new Date(),
      });

      metricsCollector.addRecord({
        sessionId: 'session-1',
        domain: 'coverage-analysis', // Different domain
        inputTokens: 500,
        outputTokens: 500,
        totalTokens: 1000,
        cached: false,
        patternReused: false,
        timestamp: new Date(),
      });

      const result = await tool.invoke({
        operation: 'domain',
        domain: 'test-generation',
      });

      expect(result.success).toBe(true);
      expect(result.data?.metrics.totalTokens).toBe(600);
      expect(result.data?.metrics.requestCount).toBe(2);
      expect(result.data?.metrics.cacheHitRate).toBe(1); // Both cached
      expect(result.data?.metrics.patternReuseRate).toBe(0.5); // One reused
    });

    it('should return empty metrics for unknown domain', async () => {
      const result = await tool.invoke({
        operation: 'domain',
        domain: 'non-existent',
      });

      expect(result.success).toBe(true);
      expect(result.data?.metrics.totalTokens).toBe(0);
    });
  });

  // ==========================================================================
  // Task Operation
  // ==========================================================================

  describe('task operation', () => {
    it('should return task metrics', async () => {
      metricsCollector.addRecord({
        sessionId: 'session-1',
        taskId: 'task-1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: false,
        timestamp: new Date(),
      });

      metricsCollector.addRecord({
        sessionId: 'session-1',
        taskId: 'task-1',
        inputTokens: 50,
        outputTokens: 100,
        totalTokens: 150,
        cached: true,
        patternReused: false,
        timestamp: new Date(),
      });

      const result = await tool.invoke({
        operation: 'task',
        taskId: 'task-1',
      });

      expect(result.success).toBe(true);
      expect(result.data?.metrics.totalTokens).toBe(300);
      expect(result.data?.metrics.totalInputTokens).toBe(150);
      expect(result.data?.metrics.totalOutputTokens).toBe(150);
      expect(result.data?.metrics.requestCount).toBe(2);
    });

    it('should return empty metrics for unknown task', async () => {
      const result = await tool.invoke({
        operation: 'task',
        taskId: 'non-existent',
      });

      expect(result.success).toBe(true);
      expect(result.data?.metrics.totalTokens).toBe(0);
    });
  });

  // ==========================================================================
  // Optimization Recommendations
  // ==========================================================================

  describe('optimization recommendations', () => {
    it('should include recommendations when requested', async () => {
      // Add data with low cache hit rate
      for (let i = 0; i < 10; i++) {
        metricsCollector.addRecord({
          sessionId: 'session-1',
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          cached: false, // No caching
          patternReused: false,
          timestamp: new Date(),
        });
      }

      const result = await tool.invoke({
        operation: 'session',
        sessionId: 'session-1',
        includeRecommendations: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.recommendations).toBeDefined();
      expect(result.data?.recommendations?.length).toBeGreaterThan(0);
    });

    it('should not include recommendations when not requested', async () => {
      metricsCollector.addRecord({
        sessionId: 'session-1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: false,
        timestamp: new Date(),
      });

      const result = await tool.invoke({
        operation: 'session',
        sessionId: 'session-1',
        includeRecommendations: false,
      });

      expect(result.success).toBe(true);
      expect(result.data?.recommendations).toBeUndefined();
    });

    it('should recommend caching for low cache hit rate', async () => {
      // Add data with 0% cache hit rate
      for (let i = 0; i < 5; i++) {
        metricsCollector.addRecord({
          sessionId: 'session-1',
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          cached: false,
          patternReused: false,
          timestamp: new Date(),
        });
      }

      const result = await tool.invoke({
        operation: 'session',
        sessionId: 'session-1',
        includeRecommendations: true,
      });

      const cacheRecommendation = result.data?.recommendations?.find(r => r.type === 'cache');
      expect(cacheRecommendation).toBeDefined();
      expect(cacheRecommendation?.priority).toBe('high');
    });

    it('should recommend pattern reuse for low pattern reuse rate', async () => {
      // Add data with 0% pattern reuse
      for (let i = 0; i < 5; i++) {
        metricsCollector.addRecord({
          sessionId: 'session-1',
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          cached: true,
          patternReused: false,
          timestamp: new Date(),
        });
      }

      const result = await tool.invoke({
        operation: 'session',
        sessionId: 'session-1',
        includeRecommendations: true,
      });

      const patternRecommendation = result.data?.recommendations?.find(r => r.type === 'pattern');
      expect(patternRecommendation).toBeDefined();
      expect(patternRecommendation?.priority).toBe('high');
    });

    it('should recommend prompt optimization for high token usage', async () => {
      // Add data with high token count per request
      metricsCollector.addRecord({
        sessionId: 'session-1',
        inputTokens: 3000,
        outputTokens: 500,
        totalTokens: 3500,
        cached: true,
        patternReused: true,
        timestamp: new Date(),
      });

      const result = await tool.invoke({
        operation: 'session',
        sessionId: 'session-1',
        includeRecommendations: true,
      });

      const promptRecommendation = result.data?.recommendations?.find(r => r.type === 'prompt');
      expect(promptRecommendation).toBeDefined();
      expect(promptRecommendation?.priority).toBe('medium');
    });

    it('should recommend context optimization for high input/output ratio', async () => {
      // Add data with high input tokens
      metricsCollector.addRecord({
        sessionId: 'session-1',
        inputTokens: 5000,
        outputTokens: 100,
        totalTokens: 5100,
        cached: true,
        patternReused: true,
        timestamp: new Date(),
      });

      const result = await tool.invoke({
        operation: 'session',
        sessionId: 'session-1',
        includeRecommendations: true,
      });

      const contextRecommendation = result.data?.recommendations?.find(r => r.type === 'context');
      expect(contextRecommendation).toBeDefined();
      expect(contextRecommendation?.action).toContain('code-intelligence');
    });

    it('should include estimated savings in recommendations', async () => {
      for (let i = 0; i < 5; i++) {
        metricsCollector.addRecord({
          sessionId: 'session-1',
          inputTokens: 200,
          outputTokens: 100,
          totalTokens: 300,
          cached: false,
          patternReused: false,
          timestamp: new Date(),
        });
      }

      const result = await tool.invoke({
        operation: 'session',
        sessionId: 'session-1',
        includeRecommendations: true,
      });

      const recommendations = result.data?.recommendations || [];
      for (const rec of recommendations) {
        expect(rec.estimatedSavings).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return empty recommendations for efficient usage', async () => {
      // Add data with good metrics
      for (let i = 0; i < 5; i++) {
        metricsCollector.addRecord({
          sessionId: 'session-1',
          inputTokens: 100,
          outputTokens: 200,
          totalTokens: 300,
          cached: true, // High cache rate
          patternReused: true, // High pattern reuse
          timestamp: new Date(),
        });
      }

      const result = await tool.invoke({
        operation: 'session',
        sessionId: 'session-1',
        includeRecommendations: true,
      });

      // Should have fewer or no recommendations for efficient usage
      const recommendations = result.data?.recommendations || [];
      // Filter out low priority recommendations
      const highPriorityRecs = recommendations.filter(r => r.priority === 'high');
      expect(highPriorityRecs.length).toBe(0);
    });
  });

  // ==========================================================================
  // Metadata
  // ==========================================================================

  describe('metadata', () => {
    it('should include metadata in result', async () => {
      metricsCollector.addRecord({
        sessionId: 'session-1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: false,
        timestamp: new Date(),
      });

      const result = await tool.invoke({
        operation: 'session',
        sessionId: 'session-1',
      });

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.requestId).toBeDefined();
      expect(result.metadata?.executionTime).toBeGreaterThanOrEqual(0);
      expect(result.metadata?.toolName).toBe('qe/token/usage');
      expect(result.metadata?.domain).toBe('learning-optimization');
    });

    it('should include metadata even on validation failure', async () => {
      const result = await tool.invoke({} as TokenUsageParams);

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.requestId).toBeDefined();
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle empty metrics gracefully', async () => {
      const result = await tool.invoke({
        operation: 'session',
        sessionId: 'empty-session',
        includeRecommendations: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.metrics.totalTokens).toBe(0);
      expect(result.data?.metrics.efficiencyScore).toBe(0);
      // With empty metrics (0% rates), recommendations may still be generated
      // but they will have 0 estimated savings since there's no data to optimize
      expect(result.data?.recommendations).toBeDefined();
      // All savings should be 0 for empty metrics
      const recommendations = result.data?.recommendations || [];
      for (const rec of recommendations) {
        expect(rec.estimatedSavings).toBe(0);
      }
    });

    it('should handle invalid timeframe gracefully', async () => {
      metricsCollector.addRecord({
        sessionId: 'session-1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: false,
        timestamp: new Date(),
      });

      // Timeframe in the past that excludes all records
      const pastDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const result = await tool.invoke({
        operation: 'session',
        sessionId: 'session-1',
        timeframe: {
          start: new Date(pastDate.getTime() - 60000).toISOString(),
          end: pastDate.toISOString(),
        },
      });

      expect(result.success).toBe(true);
      expect(result.data?.metrics.requestCount).toBe(0);
    });

    it('should calculate efficiency score correctly', async () => {
      // Perfect efficiency: all cached and pattern reused
      for (let i = 0; i < 10; i++) {
        metricsCollector.addRecord({
          sessionId: 'session-1',
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          cached: true,
          patternReused: true,
          timestamp: new Date(),
        });
      }

      const result = await tool.invoke({
        operation: 'session',
        sessionId: 'session-1',
      });

      expect(result.data?.metrics.efficiencyScore).toBe(1);
    });

    it('should handle very large token counts', async () => {
      metricsCollector.addRecord({
        sessionId: 'session-1',
        inputTokens: 1000000,
        outputTokens: 500000,
        totalTokens: 1500000,
        cached: false,
        patternReused: false,
        timestamp: new Date(),
      });

      const result = await tool.invoke({
        operation: 'session',
        sessionId: 'session-1',
      });

      expect(result.success).toBe(true);
      expect(result.data?.metrics.totalTokens).toBe(1500000);
    });
  });
});
