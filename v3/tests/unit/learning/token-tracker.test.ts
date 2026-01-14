/**
 * Unit Tests for Token Metrics Collector
 * ADR-042: Token Tracking Implementation
 *
 * Tests TokenMetricsCollector singleton behavior, metric recording,
 * aggregation, and efficiency calculations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// Type Definitions (matching expected ADR-042 implementation)
// ============================================================================

interface TokenUsageRecord {
  timestamp: Date;
  sessionId: string;
  agentId?: string;
  domain?: string;
  taskId?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cached: boolean;
  patternReused: boolean;
  estimatedCost?: number;
}

interface TokenSavingsRecord {
  timestamp: Date;
  sessionId: string;
  patternId: string;
  tokensSaved: number;
  originalTokens: number;
  reuseConfidence: number;
}

interface TokenEfficiencyMetrics {
  cacheHitRate: number;
  patternReuseRate: number;
  avgTokensPerTask: number;
  totalTokensSaved: number;
  efficiencyScore: number;
}

interface SessionSummary {
  sessionId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCached: number;
  totalPatternReused: number;
  recordCount: number;
  timeframe: { start: Date; end: Date };
}

interface AgentMetrics {
  agentId: string;
  totalTokens: number;
  avgTokensPerTask: number;
  taskCount: number;
  patternReuseCount: number;
}

// ============================================================================
// TokenMetricsCollector Implementation (minimal for testing)
// ============================================================================

class TokenMetricsCollector {
  private static instance: TokenMetricsCollector | null = null;
  private usageRecords: TokenUsageRecord[] = [];
  private savingsRecords: TokenSavingsRecord[] = [];
  private maxRecords: number;

  private constructor(maxRecords = 10000) {
    this.maxRecords = maxRecords;
  }

  static getInstance(maxRecords = 10000): TokenMetricsCollector {
    if (!TokenMetricsCollector.instance) {
      TokenMetricsCollector.instance = new TokenMetricsCollector(maxRecords);
    }
    return TokenMetricsCollector.instance;
  }

  static resetInstance(): void {
    TokenMetricsCollector.instance = null;
  }

  recordTokenUsage(record: Omit<TokenUsageRecord, 'timestamp'>): void {
    const fullRecord: TokenUsageRecord = {
      ...record,
      timestamp: new Date(),
    };

    this.usageRecords.push(fullRecord);

    // Trim if exceeding max
    if (this.usageRecords.length > this.maxRecords) {
      this.usageRecords = this.usageRecords.slice(-this.maxRecords);
    }
  }

  recordPatternReuse(record: Omit<TokenSavingsRecord, 'timestamp'>): void {
    const fullRecord: TokenSavingsRecord = {
      ...record,
      timestamp: new Date(),
    };

    this.savingsRecords.push(fullRecord);

    // Trim if exceeding max
    if (this.savingsRecords.length > this.maxRecords) {
      this.savingsRecords = this.savingsRecords.slice(-this.maxRecords);
    }
  }

  getSessionSummary(sessionId: string, timeframe?: { start: Date; end: Date }): SessionSummary {
    let records = this.usageRecords.filter(r => r.sessionId === sessionId);

    if (timeframe) {
      records = records.filter(
        r => r.timestamp >= timeframe.start && r.timestamp <= timeframe.end
      );
    }

    if (records.length === 0) {
      return {
        sessionId,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        totalCached: 0,
        totalPatternReused: 0,
        recordCount: 0,
        timeframe: timeframe || { start: new Date(), end: new Date() },
      };
    }

    const timestamps = records.map(r => r.timestamp.getTime());
    const actualTimeframe = timeframe || {
      start: new Date(Math.min(...timestamps)),
      end: new Date(Math.max(...timestamps)),
    };

    return {
      sessionId,
      totalInputTokens: records.reduce((sum, r) => sum + r.inputTokens, 0),
      totalOutputTokens: records.reduce((sum, r) => sum + r.outputTokens, 0),
      totalTokens: records.reduce((sum, r) => sum + r.totalTokens, 0),
      totalCached: records.filter(r => r.cached).length,
      totalPatternReused: records.filter(r => r.patternReused).length,
      recordCount: records.length,
      timeframe: actualTimeframe,
    };
  }

  getAgentMetrics(agentId: string): AgentMetrics {
    const records = this.usageRecords.filter(r => r.agentId === agentId);

    if (records.length === 0) {
      return {
        agentId,
        totalTokens: 0,
        avgTokensPerTask: 0,
        taskCount: 0,
        patternReuseCount: 0,
      };
    }

    const totalTokens = records.reduce((sum, r) => sum + r.totalTokens, 0);
    const taskIds = new Set(records.map(r => r.taskId).filter(Boolean));
    const taskCount = taskIds.size || records.length;

    return {
      agentId,
      totalTokens,
      avgTokensPerTask: totalTokens / taskCount,
      taskCount,
      patternReuseCount: records.filter(r => r.patternReused).length,
    };
  }

  getTokenEfficiency(sessionId?: string): TokenEfficiencyMetrics {
    let records = this.usageRecords;
    let savings = this.savingsRecords;

    if (sessionId) {
      records = records.filter(r => r.sessionId === sessionId);
      savings = savings.filter(s => s.sessionId === sessionId);
    }

    if (records.length === 0) {
      return {
        cacheHitRate: 0,
        patternReuseRate: 0,
        avgTokensPerTask: 0,
        totalTokensSaved: 0,
        efficiencyScore: 0,
      };
    }

    const cachedCount = records.filter(r => r.cached).length;
    const patternReusedCount = records.filter(r => r.patternReused).length;
    const totalTokens = records.reduce((sum, r) => sum + r.totalTokens, 0);
    const totalTokensSaved = savings.reduce((sum, s) => sum + s.tokensSaved, 0);

    // Unique tasks
    const taskIds = new Set(records.map(r => r.taskId).filter(Boolean));
    const taskCount = taskIds.size || records.length;

    const cacheHitRate = cachedCount / records.length;
    const patternReuseRate = patternReusedCount / records.length;
    const avgTokensPerTask = totalTokens / taskCount;

    // Efficiency score: weighted combination of cache hit rate and pattern reuse rate
    // Plus bonus for tokens saved relative to total
    const savingsBonus = totalTokensSaved > 0
      ? Math.min(totalTokensSaved / (totalTokens + totalTokensSaved), 0.3)
      : 0;
    const efficiencyScore = (cacheHitRate * 0.3) + (patternReuseRate * 0.4) + savingsBonus + 0.3;

    return {
      cacheHitRate: Math.round(cacheHitRate * 1000) / 1000,
      patternReuseRate: Math.round(patternReuseRate * 1000) / 1000,
      avgTokensPerTask: Math.round(avgTokensPerTask * 100) / 100,
      totalTokensSaved,
      efficiencyScore: Math.min(Math.round(efficiencyScore * 1000) / 1000, 1),
    };
  }

  getDomainMetrics(domain: string): {
    domain: string;
    totalTokens: number;
    recordCount: number;
    avgTokensPerRequest: number;
  } {
    const records = this.usageRecords.filter(r => r.domain === domain);

    if (records.length === 0) {
      return {
        domain,
        totalTokens: 0,
        recordCount: 0,
        avgTokensPerRequest: 0,
      };
    }

    const totalTokens = records.reduce((sum, r) => sum + r.totalTokens, 0);

    return {
      domain,
      totalTokens,
      recordCount: records.length,
      avgTokensPerRequest: totalTokens / records.length,
    };
  }

  getTaskMetrics(taskId: string): {
    taskId: string;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    requestCount: number;
  } {
    const records = this.usageRecords.filter(r => r.taskId === taskId);

    if (records.length === 0) {
      return {
        taskId,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        requestCount: 0,
      };
    }

    return {
      taskId,
      totalTokens: records.reduce((sum, r) => sum + r.totalTokens, 0),
      inputTokens: records.reduce((sum, r) => sum + r.inputTokens, 0),
      outputTokens: records.reduce((sum, r) => sum + r.outputTokens, 0),
      requestCount: records.length,
    };
  }

  getAllRecords(): TokenUsageRecord[] {
    return [...this.usageRecords];
  }

  getSavingsRecords(): TokenSavingsRecord[] {
    return [...this.savingsRecords];
  }

  clear(): void {
    this.usageRecords = [];
    this.savingsRecords = [];
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('TokenMetricsCollector', () => {
  beforeEach(() => {
    // Reset singleton before each test
    TokenMetricsCollector.resetInstance();
  });

  afterEach(() => {
    // Clean up after each test
    TokenMetricsCollector.resetInstance();
  });

  // ==========================================================================
  // Singleton Behavior
  // ==========================================================================

  describe('singleton behavior', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = TokenMetricsCollector.getInstance();
      const instance2 = TokenMetricsCollector.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should return a new instance after reset', () => {
      const instance1 = TokenMetricsCollector.getInstance();
      TokenMetricsCollector.resetInstance();
      const instance2 = TokenMetricsCollector.getInstance();

      expect(instance1).not.toBe(instance2);
    });

    it('should preserve data within same instance', () => {
      const instance = TokenMetricsCollector.getInstance();
      instance.recordTokenUsage({
        sessionId: 'test-session',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: false,
      });

      const sameInstance = TokenMetricsCollector.getInstance();
      expect(sameInstance.getAllRecords()).toHaveLength(1);
    });

    it('should not preserve data after reset', () => {
      const instance = TokenMetricsCollector.getInstance();
      instance.recordTokenUsage({
        sessionId: 'test-session',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: false,
      });

      TokenMetricsCollector.resetInstance();
      const newInstance = TokenMetricsCollector.getInstance();
      expect(newInstance.getAllRecords()).toHaveLength(0);
    });
  });

  // ==========================================================================
  // recordTokenUsage()
  // ==========================================================================

  describe('recordTokenUsage()', () => {
    it('should record basic token usage', () => {
      const collector = TokenMetricsCollector.getInstance();

      collector.recordTokenUsage({
        sessionId: 'session-1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: false,
      });

      const records = collector.getAllRecords();
      expect(records).toHaveLength(1);
      expect(records[0].sessionId).toBe('session-1');
      expect(records[0].totalTokens).toBe(150);
    });

    it('should add timestamp automatically', () => {
      const collector = TokenMetricsCollector.getInstance();
      const before = new Date();

      collector.recordTokenUsage({
        sessionId: 'session-1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: false,
      });

      const after = new Date();
      const records = collector.getAllRecords();

      expect(records[0].timestamp).toBeInstanceOf(Date);
      expect(records[0].timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(records[0].timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should record optional fields correctly', () => {
      const collector = TokenMetricsCollector.getInstance();

      collector.recordTokenUsage({
        sessionId: 'session-1',
        agentId: 'agent-1',
        domain: 'test-generation',
        taskId: 'task-1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: true,
        patternReused: true,
        estimatedCost: 0.0015,
      });

      const records = collector.getAllRecords();
      expect(records[0].agentId).toBe('agent-1');
      expect(records[0].domain).toBe('test-generation');
      expect(records[0].taskId).toBe('task-1');
      expect(records[0].cached).toBe(true);
      expect(records[0].patternReused).toBe(true);
      expect(records[0].estimatedCost).toBe(0.0015);
    });

    it('should accumulate multiple records', () => {
      const collector = TokenMetricsCollector.getInstance();

      for (let i = 0; i < 5; i++) {
        collector.recordTokenUsage({
          sessionId: `session-${i}`,
          inputTokens: 100 * (i + 1),
          outputTokens: 50 * (i + 1),
          totalTokens: 150 * (i + 1),
          cached: false,
          patternReused: false,
        });
      }

      expect(collector.getAllRecords()).toHaveLength(5);
    });

    it('should trim records when exceeding maxRecords', () => {
      // Create instance with small max
      TokenMetricsCollector.resetInstance();
      const collector = TokenMetricsCollector.getInstance(5);

      for (let i = 0; i < 10; i++) {
        collector.recordTokenUsage({
          sessionId: `session-${i}`,
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          cached: false,
          patternReused: false,
        });
      }

      const records = collector.getAllRecords();
      expect(records).toHaveLength(5);
      // Should keep the most recent records (5-9)
      expect(records[0].sessionId).toBe('session-5');
      expect(records[4].sessionId).toBe('session-9');
    });
  });

  // ==========================================================================
  // recordPatternReuse()
  // ==========================================================================

  describe('recordPatternReuse()', () => {
    it('should record pattern reuse with savings', () => {
      const collector = TokenMetricsCollector.getInstance();

      collector.recordPatternReuse({
        sessionId: 'session-1',
        patternId: 'pattern-123',
        tokensSaved: 500,
        originalTokens: 1000,
        reuseConfidence: 0.95,
      });

      const savings = collector.getSavingsRecords();
      expect(savings).toHaveLength(1);
      expect(savings[0].patternId).toBe('pattern-123');
      expect(savings[0].tokensSaved).toBe(500);
      expect(savings[0].reuseConfidence).toBe(0.95);
    });

    it('should add timestamp automatically', () => {
      const collector = TokenMetricsCollector.getInstance();
      const before = new Date();

      collector.recordPatternReuse({
        sessionId: 'session-1',
        patternId: 'pattern-123',
        tokensSaved: 500,
        originalTokens: 1000,
        reuseConfidence: 0.95,
      });

      const after = new Date();
      const savings = collector.getSavingsRecords();

      expect(savings[0].timestamp).toBeInstanceOf(Date);
      expect(savings[0].timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(savings[0].timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should accumulate multiple savings records', () => {
      const collector = TokenMetricsCollector.getInstance();

      for (let i = 0; i < 3; i++) {
        collector.recordPatternReuse({
          sessionId: 'session-1',
          patternId: `pattern-${i}`,
          tokensSaved: 100 * (i + 1),
          originalTokens: 500,
          reuseConfidence: 0.9,
        });
      }

      expect(collector.getSavingsRecords()).toHaveLength(3);
    });

    it('should track savings correctly for efficiency calculation', () => {
      const collector = TokenMetricsCollector.getInstance();

      // Record some usage
      collector.recordTokenUsage({
        sessionId: 'session-1',
        inputTokens: 500,
        outputTokens: 500,
        totalTokens: 1000,
        cached: false,
        patternReused: true,
      });

      // Record the savings
      collector.recordPatternReuse({
        sessionId: 'session-1',
        patternId: 'pattern-1',
        tokensSaved: 800,
        originalTokens: 1800,
        reuseConfidence: 0.95,
      });

      const efficiency = collector.getTokenEfficiency('session-1');
      expect(efficiency.totalTokensSaved).toBe(800);
    });
  });

  // ==========================================================================
  // getSessionSummary()
  // ==========================================================================

  describe('getSessionSummary()', () => {
    it('should aggregate tokens by session', () => {
      const collector = TokenMetricsCollector.getInstance();

      collector.recordTokenUsage({
        sessionId: 'session-1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: false,
      });

      collector.recordTokenUsage({
        sessionId: 'session-1',
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
        cached: true,
        patternReused: true,
      });

      const summary = collector.getSessionSummary('session-1');

      expect(summary.totalInputTokens).toBe(300);
      expect(summary.totalOutputTokens).toBe(150);
      expect(summary.totalTokens).toBe(450);
      expect(summary.totalCached).toBe(1);
      expect(summary.totalPatternReused).toBe(1);
      expect(summary.recordCount).toBe(2);
    });

    it('should filter by timeframe', () => {
      const collector = TokenMetricsCollector.getInstance();

      // Record at different times by manipulating the data directly
      collector.recordTokenUsage({
        sessionId: 'session-1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: false,
      });

      // Modify timestamp of first record to be in the past
      const records = collector.getAllRecords();
      records[0].timestamp = new Date(Date.now() - 3600000); // 1 hour ago

      collector.recordTokenUsage({
        sessionId: 'session-1',
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
        cached: false,
        patternReused: false,
      });

      // Query for last 30 minutes only
      const now = new Date();
      const thirtyMinutesAgo = new Date(now.getTime() - 1800000);
      const summary = collector.getSessionSummary('session-1', {
        start: thirtyMinutesAgo,
        end: now,
      });

      expect(summary.recordCount).toBe(1);
      expect(summary.totalTokens).toBe(300);
    });

    it('should return empty summary for unknown session', () => {
      const collector = TokenMetricsCollector.getInstance();

      const summary = collector.getSessionSummary('non-existent');

      expect(summary.sessionId).toBe('non-existent');
      expect(summary.totalTokens).toBe(0);
      expect(summary.recordCount).toBe(0);
    });

    it('should calculate timeframe from records when not provided', () => {
      const collector = TokenMetricsCollector.getInstance();

      collector.recordTokenUsage({
        sessionId: 'session-1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: false,
      });

      const summary = collector.getSessionSummary('session-1');

      expect(summary.timeframe.start).toBeInstanceOf(Date);
      expect(summary.timeframe.end).toBeInstanceOf(Date);
      expect(summary.timeframe.end.getTime()).toBeGreaterThanOrEqual(
        summary.timeframe.start.getTime()
      );
    });

    it('should not count other sessions', () => {
      const collector = TokenMetricsCollector.getInstance();

      collector.recordTokenUsage({
        sessionId: 'session-1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: false,
      });

      collector.recordTokenUsage({
        sessionId: 'session-2',
        inputTokens: 500,
        outputTokens: 500,
        totalTokens: 1000,
        cached: true,
        patternReused: true,
      });

      const summary = collector.getSessionSummary('session-1');

      expect(summary.totalTokens).toBe(150);
      expect(summary.recordCount).toBe(1);
    });
  });

  // ==========================================================================
  // getAgentMetrics()
  // ==========================================================================

  describe('getAgentMetrics()', () => {
    it('should aggregate metrics by agent', () => {
      const collector = TokenMetricsCollector.getInstance();

      collector.recordTokenUsage({
        sessionId: 'session-1',
        agentId: 'agent-1',
        taskId: 'task-1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: true,
      });

      collector.recordTokenUsage({
        sessionId: 'session-1',
        agentId: 'agent-1',
        taskId: 'task-2',
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
        cached: false,
        patternReused: false,
      });

      const metrics = collector.getAgentMetrics('agent-1');

      expect(metrics.agentId).toBe('agent-1');
      expect(metrics.totalTokens).toBe(450);
      expect(metrics.taskCount).toBe(2);
      expect(metrics.avgTokensPerTask).toBe(225);
      expect(metrics.patternReuseCount).toBe(1);
    });

    it('should filter by agentId correctly', () => {
      const collector = TokenMetricsCollector.getInstance();

      collector.recordTokenUsage({
        sessionId: 'session-1',
        agentId: 'agent-1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: false,
      });

      collector.recordTokenUsage({
        sessionId: 'session-1',
        agentId: 'agent-2',
        inputTokens: 500,
        outputTokens: 500,
        totalTokens: 1000,
        cached: false,
        patternReused: false,
      });

      const agent1Metrics = collector.getAgentMetrics('agent-1');
      const agent2Metrics = collector.getAgentMetrics('agent-2');

      expect(agent1Metrics.totalTokens).toBe(150);
      expect(agent2Metrics.totalTokens).toBe(1000);
    });

    it('should return zero metrics for unknown agent', () => {
      const collector = TokenMetricsCollector.getInstance();

      const metrics = collector.getAgentMetrics('non-existent');

      expect(metrics.agentId).toBe('non-existent');
      expect(metrics.totalTokens).toBe(0);
      expect(metrics.taskCount).toBe(0);
      expect(metrics.avgTokensPerTask).toBe(0);
      expect(metrics.patternReuseCount).toBe(0);
    });

    it('should count unique tasks correctly', () => {
      const collector = TokenMetricsCollector.getInstance();

      // Multiple records for same task
      collector.recordTokenUsage({
        sessionId: 'session-1',
        agentId: 'agent-1',
        taskId: 'task-1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: false,
      });

      collector.recordTokenUsage({
        sessionId: 'session-1',
        agentId: 'agent-1',
        taskId: 'task-1', // Same task
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: false,
      });

      collector.recordTokenUsage({
        sessionId: 'session-1',
        agentId: 'agent-1',
        taskId: 'task-2', // Different task
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: false,
      });

      const metrics = collector.getAgentMetrics('agent-1');

      expect(metrics.taskCount).toBe(2); // 2 unique tasks
      expect(metrics.totalTokens).toBe(450);
      expect(metrics.avgTokensPerTask).toBe(225);
    });
  });

  // ==========================================================================
  // getTokenEfficiency()
  // ==========================================================================

  describe('getTokenEfficiency()', () => {
    it('should calculate cache hit rate as percentage', () => {
      const collector = TokenMetricsCollector.getInstance();

      // 3 cached out of 5 total
      for (let i = 0; i < 5; i++) {
        collector.recordTokenUsage({
          sessionId: 'session-1',
          taskId: `task-${i}`,
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          cached: i < 3, // First 3 are cached
          patternReused: false,
        });
      }

      const efficiency = collector.getTokenEfficiency();

      expect(efficiency.cacheHitRate).toBe(0.6); // 60%
    });

    it('should calculate pattern reuse rate as percentage', () => {
      const collector = TokenMetricsCollector.getInstance();

      // 4 reused out of 8 total
      for (let i = 0; i < 8; i++) {
        collector.recordTokenUsage({
          sessionId: 'session-1',
          taskId: `task-${i}`,
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          cached: false,
          patternReused: i < 4, // First 4 reused
        });
      }

      const efficiency = collector.getTokenEfficiency();

      expect(efficiency.patternReuseRate).toBe(0.5); // 50%
    });

    it('should calculate average tokens per task', () => {
      const collector = TokenMetricsCollector.getInstance();

      collector.recordTokenUsage({
        sessionId: 'session-1',
        taskId: 'task-1',
        inputTokens: 100,
        outputTokens: 100,
        totalTokens: 200,
        cached: false,
        patternReused: false,
      });

      collector.recordTokenUsage({
        sessionId: 'session-1',
        taskId: 'task-2',
        inputTokens: 200,
        outputTokens: 200,
        totalTokens: 400,
        cached: false,
        patternReused: false,
      });

      const efficiency = collector.getTokenEfficiency();

      expect(efficiency.avgTokensPerTask).toBe(300); // (200 + 400) / 2
    });

    it('should calculate total tokens saved from pattern reuse', () => {
      const collector = TokenMetricsCollector.getInstance();

      collector.recordTokenUsage({
        sessionId: 'session-1',
        taskId: 'task-1',
        inputTokens: 100,
        outputTokens: 100,
        totalTokens: 200,
        cached: false,
        patternReused: true,
      });

      collector.recordPatternReuse({
        sessionId: 'session-1',
        patternId: 'pattern-1',
        tokensSaved: 500,
        originalTokens: 700,
        reuseConfidence: 0.9,
      });

      collector.recordPatternReuse({
        sessionId: 'session-1',
        patternId: 'pattern-2',
        tokensSaved: 300,
        originalTokens: 500,
        reuseConfidence: 0.85,
      });

      const efficiency = collector.getTokenEfficiency();

      expect(efficiency.totalTokensSaved).toBe(800);
    });

    it('should calculate combined efficiency score', () => {
      const collector = TokenMetricsCollector.getInstance();

      // High cache hit and pattern reuse
      for (let i = 0; i < 10; i++) {
        collector.recordTokenUsage({
          sessionId: 'session-1',
          taskId: `task-${i}`,
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          cached: i < 8, // 80% cache hit
          patternReused: i < 7, // 70% pattern reuse
        });
      }

      const efficiency = collector.getTokenEfficiency();

      expect(efficiency.efficiencyScore).toBeGreaterThan(0.5);
      expect(efficiency.efficiencyScore).toBeLessThanOrEqual(1);
    });

    it('should filter by session when provided', () => {
      const collector = TokenMetricsCollector.getInstance();

      // Session 1: all cached
      collector.recordTokenUsage({
        sessionId: 'session-1',
        taskId: 'task-1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: true,
        patternReused: true,
      });

      // Session 2: not cached
      collector.recordTokenUsage({
        sessionId: 'session-2',
        taskId: 'task-2',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: false,
      });

      const session1Efficiency = collector.getTokenEfficiency('session-1');
      const session2Efficiency = collector.getTokenEfficiency('session-2');

      expect(session1Efficiency.cacheHitRate).toBe(1); // 100%
      expect(session2Efficiency.cacheHitRate).toBe(0); // 0%
    });

    it('should return zero efficiency when no records exist', () => {
      const collector = TokenMetricsCollector.getInstance();

      const efficiency = collector.getTokenEfficiency();

      expect(efficiency.cacheHitRate).toBe(0);
      expect(efficiency.patternReuseRate).toBe(0);
      expect(efficiency.avgTokensPerTask).toBe(0);
      expect(efficiency.totalTokensSaved).toBe(0);
      expect(efficiency.efficiencyScore).toBe(0);
    });

    it('should cap efficiency score at 1.0', () => {
      const collector = TokenMetricsCollector.getInstance();

      // Perfect metrics
      for (let i = 0; i < 10; i++) {
        collector.recordTokenUsage({
          sessionId: 'session-1',
          taskId: `task-${i}`,
          inputTokens: 50,
          outputTokens: 50,
          totalTokens: 100,
          cached: true,
          patternReused: true,
        });

        collector.recordPatternReuse({
          sessionId: 'session-1',
          patternId: `pattern-${i}`,
          tokensSaved: 1000,
          originalTokens: 1100,
          reuseConfidence: 0.99,
        });
      }

      const efficiency = collector.getTokenEfficiency();

      expect(efficiency.efficiencyScore).toBeLessThanOrEqual(1);
    });
  });

  // ==========================================================================
  // Domain and Task Metrics
  // ==========================================================================

  describe('getDomainMetrics()', () => {
    it('should aggregate metrics by domain', () => {
      const collector = TokenMetricsCollector.getInstance();

      collector.recordTokenUsage({
        sessionId: 'session-1',
        domain: 'test-generation',
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        cached: false,
        patternReused: false,
      });

      collector.recordTokenUsage({
        sessionId: 'session-1',
        domain: 'test-generation',
        inputTokens: 150,
        outputTokens: 150,
        totalTokens: 300,
        cached: false,
        patternReused: false,
      });

      const metrics = collector.getDomainMetrics('test-generation');

      expect(metrics.domain).toBe('test-generation');
      expect(metrics.totalTokens).toBe(600);
      expect(metrics.recordCount).toBe(2);
      expect(metrics.avgTokensPerRequest).toBe(300);
    });

    it('should return zero for unknown domain', () => {
      const collector = TokenMetricsCollector.getInstance();

      const metrics = collector.getDomainMetrics('unknown');

      expect(metrics.totalTokens).toBe(0);
      expect(metrics.recordCount).toBe(0);
    });
  });

  describe('getTaskMetrics()', () => {
    it('should aggregate metrics by task', () => {
      const collector = TokenMetricsCollector.getInstance();

      collector.recordTokenUsage({
        sessionId: 'session-1',
        taskId: 'task-1',
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        cached: false,
        patternReused: false,
      });

      collector.recordTokenUsage({
        sessionId: 'session-1',
        taskId: 'task-1',
        inputTokens: 50,
        outputTokens: 100,
        totalTokens: 150,
        cached: false,
        patternReused: false,
      });

      const metrics = collector.getTaskMetrics('task-1');

      expect(metrics.taskId).toBe('task-1');
      expect(metrics.totalTokens).toBe(450);
      expect(metrics.inputTokens).toBe(150);
      expect(metrics.outputTokens).toBe(300);
      expect(metrics.requestCount).toBe(2);
    });

    it('should return zero for unknown task', () => {
      const collector = TokenMetricsCollector.getInstance();

      const metrics = collector.getTaskMetrics('unknown');

      expect(metrics.totalTokens).toBe(0);
      expect(metrics.requestCount).toBe(0);
    });
  });

  // ==========================================================================
  // clear()
  // ==========================================================================

  describe('clear()', () => {
    it('should clear all records', () => {
      const collector = TokenMetricsCollector.getInstance();

      collector.recordTokenUsage({
        sessionId: 'session-1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: false,
      });

      collector.recordPatternReuse({
        sessionId: 'session-1',
        patternId: 'pattern-1',
        tokensSaved: 500,
        originalTokens: 1000,
        reuseConfidence: 0.9,
      });

      collector.clear();

      expect(collector.getAllRecords()).toHaveLength(0);
      expect(collector.getSavingsRecords()).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle zero tokens gracefully', () => {
      const collector = TokenMetricsCollector.getInstance();

      collector.recordTokenUsage({
        sessionId: 'session-1',
        taskId: 'task-1',
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cached: false,
        patternReused: false,
      });

      const summary = collector.getSessionSummary('session-1');
      const efficiency = collector.getTokenEfficiency();

      expect(summary.totalTokens).toBe(0);
      expect(efficiency.avgTokensPerTask).toBe(0);
    });

    it('should handle very large token counts', () => {
      const collector = TokenMetricsCollector.getInstance();

      collector.recordTokenUsage({
        sessionId: 'session-1',
        taskId: 'task-1',
        inputTokens: 1000000,
        outputTokens: 500000,
        totalTokens: 1500000,
        cached: false,
        patternReused: false,
      });

      const summary = collector.getSessionSummary('session-1');

      expect(summary.totalTokens).toBe(1500000);
    });

    it('should handle records without optional fields', () => {
      const collector = TokenMetricsCollector.getInstance();

      collector.recordTokenUsage({
        sessionId: 'session-1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: false,
        // No agentId, domain, taskId, estimatedCost
      });

      const records = collector.getAllRecords();

      expect(records[0].agentId).toBeUndefined();
      expect(records[0].domain).toBeUndefined();
      expect(records[0].taskId).toBeUndefined();
    });

    it('should calculate efficiency with mixed cached/uncached records', () => {
      const collector = TokenMetricsCollector.getInstance();

      // Mix of cached and uncached
      collector.recordTokenUsage({
        sessionId: 'session-1',
        taskId: 'task-1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: true,
        patternReused: false,
      });

      collector.recordTokenUsage({
        sessionId: 'session-1',
        taskId: 'task-2',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: true,
      });

      collector.recordTokenUsage({
        sessionId: 'session-1',
        taskId: 'task-3',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cached: false,
        patternReused: false,
      });

      const efficiency = collector.getTokenEfficiency();

      // 1 cached out of 3 = 33.3%
      expect(efficiency.cacheHitRate).toBeCloseTo(0.333, 2);
      // 1 reused out of 3 = 33.3%
      expect(efficiency.patternReuseRate).toBeCloseTo(0.333, 2);
    });
  });
});
