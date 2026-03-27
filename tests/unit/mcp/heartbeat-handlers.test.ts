/**
 * Agentic QE v3 - Heartbeat MCP Handler Tests
 * Imp-10: Token-Free Heartbeat Scheduler MCP Integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted() so mock fns are available when vi.mock factory runs (hoisted above imports)
const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: mocks.existsSync,
    readFileSync: mocks.readFileSync,
  };
});

// Mock the worker before importing handlers
vi.mock('../../../src/workers/workers/heartbeat-scheduler.js', () => {
  return {
    HeartbeatSchedulerWorker: class MockHeartbeatWorker {
      config = {
        id: 'heartbeat-scheduler',
        name: 'Heartbeat Scheduler',
        intervalMs: 30 * 60 * 1000,
        enabled: true,
      };
      status = 'idle';
      lastResult = {
        workerId: 'heartbeat-scheduler',
        timestamp: new Date('2026-03-27T14:32:15Z'),
        durationMs: 245,
        success: true,
        metrics: {
          itemsAnalyzed: 50,
          issuesFound: 3,
          healthScore: 85,
          trend: 'stable' as const,
          domainMetrics: {
            promoted: 2,
            deprecated: 1,
            decayed: 15,
            pendingExperiences: 8,
            avgConfidence: 0.72,
          },
        },
        findings: [],
        recommendations: [],
      };
      lastRunAt = new Date('2026-03-27T14:32:15Z');
      nextRunAt = new Date('2026-03-27T15:02:15Z');

      initialize = vi.fn().mockResolvedValue(undefined);
      execute = vi.fn().mockResolvedValue({
        workerId: 'heartbeat-scheduler',
        timestamp: new Date(),
        durationMs: 312,
        success: true,
        metrics: {
          itemsAnalyzed: 42,
          issuesFound: 1,
          healthScore: 88,
          trend: 'improving',
          domainMetrics: {
            promoted: 3,
            deprecated: 0,
            decayed: 10,
            pendingExperiences: 5,
            avgConfidence: 0.75,
          },
        },
        findings: [{ type: 'heartbeat-promotion', severity: 'info', domain: 'learning-optimization', title: 'Promoted', description: '3 promoted' }],
        recommendations: [],
      });
      getHealth = vi.fn().mockReturnValue({
        status: 'idle',
        healthScore: 85,
        totalExecutions: 42,
        successfulExecutions: 41,
        failedExecutions: 1,
        avgDurationMs: 280,
        recentResults: [],
      });
      pause = vi.fn();
      resume = vi.fn();
      stop = vi.fn().mockResolvedValue(undefined);
    },
  };
});

// Mock unified-memory for findProjectRoot
vi.mock('../../../src/kernel/unified-memory.js', () => ({
  findProjectRoot: () => '/tmp/test-project',
  getUnifiedMemory: vi.fn(),
}));

import {
  handleHeartbeatStatus,
  handleHeartbeatTrigger,
  handleHeartbeatLog,
} from '../../../src/mcp/handlers/heartbeat-handlers.js';

describe('Heartbeat MCP Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleHeartbeatStatus', () => {
    it('should return health JSON with correct structure', async () => {
      const result = await handleHeartbeatStatus({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.status).toBe('idle');
      expect(result.data!.healthScore).toBe(85);
      expect(result.data!.totalExecutions).toBe(42);
      expect(result.data!.successfulExecutions).toBe(41);
      expect(result.data!.failedExecutions).toBe(1);
      expect(result.data!.avgDurationMs).toBe(280);
    });

    it('should include last run timestamps', async () => {
      const result = await handleHeartbeatStatus({});

      expect(result.success).toBe(true);
      expect(result.data!.lastRunAt).toBe('2026-03-27T14:32:15.000Z');
      expect(result.data!.nextRunAt).toBe('2026-03-27T15:02:15.000Z');
    });

    it('should include last result details', async () => {
      const result = await handleHeartbeatStatus({});

      expect(result.success).toBe(true);
      expect(result.data!.lastResult).toBeDefined();
      expect(result.data!.lastResult!.healthScore).toBe(85);
      expect(result.data!.lastResult!.trend).toBe('stable');
      expect(result.data!.lastResult!.domainMetrics.promoted).toBe(2);
    });
  });

  describe('handleHeartbeatTrigger', () => {
    it('should execute heartbeat and return result', async () => {
      const result = await handleHeartbeatTrigger({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.success).toBe(true);
      expect(result.data!.healthScore).toBe(88);
      expect(result.data!.trend).toBe('improving');
      expect(result.data!.promoted).toBe(3);
      expect(result.data!.deprecated).toBe(0);
      expect(result.data!.decayed).toBe(10);
      expect(result.data!.pendingExperiences).toBe(5);
      expect(result.data!.avgConfidence).toBe(0.75);
      expect(result.data!.findingsCount).toBe(1);
      expect(result.data!.recommendationsCount).toBe(0);
    });

    it('should return numeric duration', async () => {
      const result = await handleHeartbeatTrigger({});

      expect(result.success).toBe(true);
      expect(typeof result.data!.durationMs).toBe('number');
      expect(result.data!.durationMs).toBe(312);
    });
  });

  describe('handleHeartbeatLog', () => {
    it('should return log content when file exists', async () => {
      const today = new Date().toISOString().split('T')[0];
      const logContent = `# AQE Daily Log \u2014 ${today}\n| Time | Event | Summary |\n`;

      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue(logContent);

      const result = await handleHeartbeatLog({});

      expect(result.success).toBe(true);
      expect(result.data!.date).toBe(today);
      expect(result.data!.exists).toBe(true);
      expect(result.data!.content).toContain('AQE Daily Log');
      expect(result.data!.lineCount).toBeGreaterThan(0);
    });

    it('should accept a specific date parameter', async () => {
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue('# AQE Daily Log \u2014 2026-03-25\n');

      const result = await handleHeartbeatLog({ date: '2026-03-25' });

      expect(result.success).toBe(true);
      expect(result.data!.date).toBe('2026-03-25');
      expect(result.data!.exists).toBe(true);
    });

    it('should report missing log files gracefully', async () => {
      mocks.existsSync.mockReturnValue(false);

      const result = await handleHeartbeatLog({ date: '2020-01-01' });

      expect(result.success).toBe(true);
      expect(result.data!.exists).toBe(false);
      expect(result.data!.content).toBe('');
      expect(result.data!.lineCount).toBe(0);
    });

    it('should reject invalid date formats', async () => {
      const result = await handleHeartbeatLog({ date: 'not-a-date' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid date format');
    });
  });
});
