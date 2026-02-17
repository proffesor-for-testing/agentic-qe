/**
 * Test: ModularInitOrchestrator
 * Tests the main init orchestration engine that runs phases in sequence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ModularInitOrchestrator,
  createModularInitOrchestrator,
  formatInitResultModular,
} from '../../../src/init/orchestrator.js';
import type { InitPhase, InitContext, PhaseResult } from '../../../src/init/phases/phase-interface.js';

// Mock the phases index to avoid pulling in real phase implementations
vi.mock('../../../src/init/phases/index.js', () => ({
  getDefaultPhases: () => [],
}));

// Mock types to avoid file system lookups
vi.mock('../../../src/init/types.js', () => ({
  createDefaultConfig: (name: string, root: string) => ({
    project: { name, root, type: 'single' },
    version: '3.0.0',
    learning: { enabled: false },
    routing: {},
    workers: {},
    hooks: {},
    skills: {},
    autoTuning: {},
    domains: { enabled: [] },
  }),
}));

function createMockPhase(overrides: Partial<InitPhase> = {}): InitPhase {
  return {
    name: 'mock-phase',
    description: 'Mock phase',
    order: 10,
    critical: false,
    shouldRun: vi.fn().mockResolvedValue(true),
    execute: vi.fn().mockResolvedValue({
      success: true,
      data: {},
      durationMs: 10,
      message: 'done',
    } satisfies PhaseResult),
    ...overrides,
  };
}

describe('ModularInitOrchestrator', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Suppress console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should use custom phases when provided', () => {
      const customPhase = createMockPhase({ name: 'custom' });
      const orchestrator = new ModularInitOrchestrator({
        projectRoot: '/tmp/test',
        customPhases: [customPhase],
      });

      expect(orchestrator.getPhases()).toHaveLength(1);
      expect(orchestrator.getPhases()[0].name).toBe('custom');
    });

    it('should use default phases when no custom phases are provided', () => {
      const orchestrator = new ModularInitOrchestrator({
        projectRoot: '/tmp/test',
      });

      // getDefaultPhases returns [] from mock
      expect(orchestrator.getPhases()).toHaveLength(0);
    });

    it('should create context with provided options', () => {
      const orchestrator = new ModularInitOrchestrator({
        projectRoot: '/tmp/test',
        autoMode: true,
        upgrade: true,
        minimal: true,
        customPhases: [],
      });

      const ctx = orchestrator.getContext();
      expect(ctx.projectRoot).toBe('/tmp/test');
      expect(ctx.options.autoMode).toBe(true);
      expect(ctx.options.upgrade).toBe(true);
      expect(ctx.options.minimal).toBe(true);
    });

    it('should initialize context with empty results map', () => {
      const orchestrator = new ModularInitOrchestrator({
        projectRoot: '/tmp/test',
        customPhases: [],
      });

      const ctx = orchestrator.getContext();
      expect(ctx.results).toBeInstanceOf(Map);
      expect(ctx.results.size).toBe(0);
    });
  });

  describe('initialize', () => {
    it('should return success when all phases pass', async () => {
      const phase = createMockPhase({ name: 'analysis', order: 10 });
      const orchestrator = new ModularInitOrchestrator({
        projectRoot: '/tmp/test',
        customPhases: [phase],
      });

      const result = await orchestrator.initialize();

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].status).toBe('success');
    });

    it('should run phases sorted by order', async () => {
      const executionOrder: string[] = [];
      const phaseA = createMockPhase({
        name: 'phase-b-runs-second',
        order: 20,
        execute: vi.fn().mockImplementation(async () => {
          executionOrder.push('B');
          return { success: true, durationMs: 1 };
        }),
      });
      const phaseB = createMockPhase({
        name: 'phase-a-runs-first',
        order: 10,
        execute: vi.fn().mockImplementation(async () => {
          executionOrder.push('A');
          return { success: true, durationMs: 1 };
        }),
      });

      const orchestrator = new ModularInitOrchestrator({
        projectRoot: '/tmp/test',
        customPhases: [phaseA, phaseB],
      });

      await orchestrator.initialize();
      expect(executionOrder).toEqual(['A', 'B']);
    });

    it('should skip phases where shouldRun returns false', async () => {
      const phase = createMockPhase({
        name: 'skipped',
        shouldRun: vi.fn().mockResolvedValue(false),
      });

      const orchestrator = new ModularInitOrchestrator({
        projectRoot: '/tmp/test',
        customPhases: [phase],
      });

      const result = await orchestrator.initialize();

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(0);
      expect(phase.execute).not.toHaveBeenCalled();
    });

    it('should stop and return failure on critical phase failure', async () => {
      const criticalPhase = createMockPhase({
        name: 'critical',
        order: 10,
        critical: true,
        execute: vi.fn().mockResolvedValue({
          success: false,
          durationMs: 5,
          message: 'Database init failed',
        }),
      });
      const laterPhase = createMockPhase({ name: 'later', order: 20 });

      const orchestrator = new ModularInitOrchestrator({
        projectRoot: '/tmp/test',
        customPhases: [criticalPhase, laterPhase],
      });

      const result = await orchestrator.initialize();

      expect(result.success).toBe(false);
      expect(laterPhase.execute).not.toHaveBeenCalled();
    });

    it('should call rollback when critical phase fails and rollback exists', async () => {
      const rollbackFn = vi.fn().mockResolvedValue(undefined);
      const criticalPhase = createMockPhase({
        name: 'critical',
        critical: true,
        execute: vi.fn().mockResolvedValue({ success: false, durationMs: 1 }),
        rollback: rollbackFn,
      });

      const orchestrator = new ModularInitOrchestrator({
        projectRoot: '/tmp/test',
        customPhases: [criticalPhase],
      });

      await orchestrator.initialize();
      expect(rollbackFn).toHaveBeenCalled();
    });

    it('should handle rollback failure gracefully', async () => {
      const criticalPhase = createMockPhase({
        name: 'critical',
        critical: true,
        execute: vi.fn().mockResolvedValue({ success: false, durationMs: 1 }),
        rollback: vi.fn().mockRejectedValue(new Error('rollback failed')),
      });

      const orchestrator = new ModularInitOrchestrator({
        projectRoot: '/tmp/test',
        customPhases: [criticalPhase],
      });

      // Should not throw
      const result = await orchestrator.initialize();
      expect(result.success).toBe(false);
    });

    it('should continue on non-critical phase failure', async () => {
      const failingPhase = createMockPhase({
        name: 'non-critical',
        order: 10,
        critical: false,
        execute: vi.fn().mockResolvedValue({
          success: false,
          durationMs: 5,
          message: 'optional step failed',
        }),
      });
      const nextPhase = createMockPhase({ name: 'next', order: 20 });

      const orchestrator = new ModularInitOrchestrator({
        projectRoot: '/tmp/test',
        customPhases: [failingPhase, nextPhase],
      });

      const result = await orchestrator.initialize();

      expect(result.success).toBe(true);
      expect(nextPhase.execute).toHaveBeenCalled();
    });

    it('should stop processing when skipRemaining is set', async () => {
      const earlyPhase = createMockPhase({
        name: 'early',
        order: 10,
        execute: vi.fn().mockResolvedValue({
          success: true,
          durationMs: 1,
          skipRemaining: true,
        }),
      });
      const laterPhase = createMockPhase({ name: 'later', order: 20 });

      const orchestrator = new ModularInitOrchestrator({
        projectRoot: '/tmp/test',
        customPhases: [earlyPhase, laterPhase],
      });

      const result = await orchestrator.initialize();

      expect(result.success).toBe(true);
      expect(laterPhase.execute).not.toHaveBeenCalled();
    });

    it('should handle unexpected errors during phase execution', async () => {
      const throwingPhase = createMockPhase({
        name: 'thrower',
        shouldRun: vi.fn().mockRejectedValue(new Error('unexpected boom')),
      });

      const orchestrator = new ModularInitOrchestrator({
        projectRoot: '/tmp/test',
        customPhases: [throwingPhase],
      });

      const result = await orchestrator.initialize();

      expect(result.success).toBe(false);
      expect(result.steps.some(s => s.status === 'error')).toBe(true);
    });

    it('should store phase results in context', async () => {
      const phase = createMockPhase({
        name: 'analysis',
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: { entries: 42 },
          durationMs: 10,
        }),
      });

      const orchestrator = new ModularInitOrchestrator({
        projectRoot: '/tmp/test',
        customPhases: [phase],
      });

      await orchestrator.initialize();

      const ctx = orchestrator.getContext();
      expect(ctx.results.has('analysis')).toBe(true);
      expect(ctx.results.get('analysis')?.data).toEqual({ entries: 42 });
    });

    it('should calculate totalDurationMs', async () => {
      const orchestrator = new ModularInitOrchestrator({
        projectRoot: '/tmp/test',
        customPhases: [],
      });

      const result = await orchestrator.initialize();

      expect(typeof result.totalDurationMs).toBe('number');
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getPhase', () => {
    it('should return phase by name', () => {
      const phase = createMockPhase({ name: 'target' });
      const orchestrator = new ModularInitOrchestrator({
        projectRoot: '/tmp/test',
        customPhases: [phase],
      });

      expect(orchestrator.getPhase('target')).toBe(phase);
    });

    it('should return undefined for unknown phase', () => {
      const orchestrator = new ModularInitOrchestrator({
        projectRoot: '/tmp/test',
        customPhases: [],
      });

      expect(orchestrator.getPhase('nonexistent')).toBeUndefined();
    });
  });

  describe('createModularInitOrchestrator factory', () => {
    it('should create an orchestrator instance', () => {
      const orchestrator = createModularInitOrchestrator({
        projectRoot: '/tmp/test',
        customPhases: [],
      });

      expect(orchestrator).toBeInstanceOf(ModularInitOrchestrator);
    });
  });

  describe('formatInitResultModular', () => {
    it('should format a success result as a string', () => {
      const result = {
        success: true,
        config: {
          project: { name: 'test-project', root: '/tmp', type: 'single' as const },
          version: '3.0.0',
          learning: { enabled: false },
          routing: {},
          workers: {},
          hooks: {},
          skills: {},
          autoTuning: {},
          domains: { enabled: [] },
        },
        steps: [
          { step: 'Initialize database', status: 'success' as const, message: '', durationMs: 50 },
        ],
        summary: {
          projectAnalyzed: true,
          configGenerated: true,
          codeIntelligenceIndexed: 100,
          patternsLoaded: 5,
          skillsInstalled: 10,
          agentsInstalled: 8,
          hooksConfigured: true,
          mcpConfigured: true,
          claudeMdGenerated: true,
          workersStarted: 3,
        },
        totalDurationMs: 500,
        timestamp: new Date(),
      };

      const output = formatInitResultModular(result as any);

      expect(output).toContain('AQE v3 Initialization');
      expect(output).toContain('test-project');
      expect(output).toContain('initialized successfully');
    });

    it('should format a failure result correctly', () => {
      const result = {
        success: false,
        config: {
          project: { name: 'failed-project', root: '/tmp', type: 'single' as const },
          version: '3.0.0',
        },
        steps: [
          { step: 'Database failed', status: 'error' as const, message: 'disk full', durationMs: 10 },
        ],
        summary: {
          projectAnalyzed: false,
          configGenerated: false,
          codeIntelligenceIndexed: 0,
          patternsLoaded: 0,
          skillsInstalled: 0,
          agentsInstalled: 0,
          hooksConfigured: false,
          mcpConfigured: false,
          claudeMdGenerated: false,
          workersStarted: 0,
        },
        totalDurationMs: 10,
        timestamp: new Date(),
      };

      const output = formatInitResultModular(result as any);

      expect(output).toContain('Initialization failed');
    });
  });
});
