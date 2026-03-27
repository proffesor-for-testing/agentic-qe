/**
 * Agentic QE v3 - Heartbeat CLI Handler Tests
 * Imp-10: Token-Free Heartbeat Scheduler CLI Integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted() so mock fns are available when vi.mock factory runs (hoisted above imports)
const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: mocks.existsSync,
    readFileSync: mocks.readFileSync,
    writeFileSync: mocks.writeFileSync,
    mkdirSync: mocks.mkdirSync,
  };
});

// Mock the worker before importing the handler
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

import { HeartbeatHandler } from '../../../src/cli/handlers/heartbeat-handler.js';

describe('HeartbeatHandler', () => {
  let handler: HeartbeatHandler;
  let cleanupAndExit: ReturnType<typeof vi.fn>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    cleanupAndExit = vi.fn().mockResolvedValue(undefined);
    handler = new HeartbeatHandler(cleanupAndExit);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  function buildContext() {
    return {
      kernel: null,
      queen: null,
      router: null,
      workflowOrchestrator: null,
      scheduledWorkflows: new Map(),
      persistentScheduler: null,
      initialized: false,
    };
  }

  function allOutput(): string {
    return consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
  }

  describe('metadata', () => {
    it('should have correct name and description', () => {
      expect(handler.name).toBe('heartbeat');
      expect(handler.description).toBe('Manage the token-free heartbeat scheduler');
    });

    it('should return help text with subcommands', () => {
      const help = handler.getHelp();
      expect(help).toContain('status');
      expect(help).toContain('run-now');
      expect(help).toContain('history');
      expect(help).toContain('log');
      expect(help).toContain('pause');
      expect(help).toContain('resume');
    });
  });

  describe('status', () => {
    it('should display formatted health data', async () => {
      const { Command } = await import('commander');
      const program = new Command();
      handler.register(program, buildContext());

      await program.parseAsync(['node', 'aqe', 'heartbeat', 'status']);

      expect(cleanupAndExit).toHaveBeenCalledWith(0);

      const output = allOutput();
      expect(output).toContain('Heartbeat Scheduler Status');
      expect(output).toContain('85');
      expect(output).toContain('42');
    });
  });

  describe('run-now', () => {
    it('should execute heartbeat and return results', async () => {
      // storeHistoryEntry uses fs
      mocks.existsSync.mockReturnValue(false);

      const { Command } = await import('commander');
      const program = new Command();
      handler.register(program, buildContext());

      await program.parseAsync(['node', 'aqe', 'heartbeat', 'run-now']);

      expect(cleanupAndExit).toHaveBeenCalledWith(0);

      const output = allOutput();
      expect(output).toContain('Triggering heartbeat cycle');
      expect(output).toContain('Heartbeat cycle complete');
    });
  });

  describe('log', () => {
    it('should read daily log file for today', async () => {
      const today = new Date().toISOString().split('T')[0];

      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue(
        `# AQE Daily Log \u2014 ${today}\n| Time | Event | Summary |\n|------|-------|--------|\n| 14:32:15 | pattern-promoted | Heartbeat: 2 promoted |\n`
      );

      const { Command } = await import('commander');
      const program = new Command();
      handler.register(program, buildContext());

      await program.parseAsync(['node', 'aqe', 'heartbeat', 'log']);

      expect(cleanupAndExit).toHaveBeenCalledWith(0);
      expect(allOutput()).toContain('Daily Log');
    });

    it('should read log for a specific date', async () => {
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue(
        `# AQE Daily Log \u2014 2026-03-25\n| Time | Event | Summary |\n`
      );

      const { Command } = await import('commander');
      const program = new Command();
      handler.register(program, buildContext());

      await program.parseAsync(['node', 'aqe', 'heartbeat', 'log', '--date', '2026-03-25']);

      expect(cleanupAndExit).toHaveBeenCalledWith(0);
      expect(allOutput()).toContain('2026-03-25');
    });

    it('should handle missing log file gracefully', async () => {
      mocks.existsSync.mockReturnValue(false);

      const { Command } = await import('commander');
      const program = new Command();
      handler.register(program, buildContext());

      await program.parseAsync(['node', 'aqe', 'heartbeat', 'log', '--date', '2020-01-01']);

      expect(cleanupAndExit).toHaveBeenCalledWith(0);
      expect(allOutput()).toContain('No daily log found');
    });
  });

  describe('pause/resume', () => {
    it('should pause the worker', async () => {
      const { Command } = await import('commander');
      const program = new Command();
      handler.register(program, buildContext());

      await program.parseAsync(['node', 'aqe', 'heartbeat', 'pause']);

      expect(cleanupAndExit).toHaveBeenCalledWith(0);
      expect(allOutput()).toContain('paused');
    });

    it('should resume the worker', async () => {
      const { Command } = await import('commander');
      const program = new Command();
      handler.register(program, buildContext());

      await program.parseAsync(['node', 'aqe', 'heartbeat', 'resume']);

      expect(cleanupAndExit).toHaveBeenCalledWith(0);
      expect(allOutput()).toContain('resumed');
    });
  });
});
