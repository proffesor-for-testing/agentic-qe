/**
 * Test: DatabasePhase (Phase 04)
 * Tests database initialization, directory creation, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabasePhase } from '../../../../src/init/phases/04-database.js';
import type { InitContext } from '../../../../src/init/phases/phase-interface.js';

// Mock unified-memory module
vi.mock('../../../../src/kernel/unified-memory.js', () => ({
  initializeUnifiedMemory: vi.fn().mockResolvedValue({
    getStats: () => ({
      tables: [
        { name: 'kv_store' },
        { name: 'vectors' },
        { name: 'q_values' },
        { name: 'goap_plans' },
        { name: 'dreams' },
        { name: 'qe_patterns' },
      ],
    }),
    kvSet: vi.fn().mockResolvedValue(undefined),
    getDatabase: () => ({
      prepare: () => ({
        get: () => ({ version: 5 }),
      }),
    }),
  }),
  resetUnifiedMemory: vi.fn(),
}));

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
  };
});

import { existsSync, mkdirSync } from 'fs';
import { initializeUnifiedMemory, resetUnifiedMemory } from '../../../../src/kernel/unified-memory.js';

function createMockContext(overrides: Partial<InitContext> = {}): InitContext {
  return {
    projectRoot: '/tmp/test-project',
    options: {},
    config: {},
    enhancements: { claudeFlow: false, ruvector: false },
    results: new Map(),
    services: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    ...overrides,
  };
}

describe('DatabasePhase', () => {
  let phase: DatabasePhase;

  beforeEach(() => {
    phase = new DatabasePhase();
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(mkdirSync).mockReturnValue(undefined as any);
    vi.mocked(initializeUnifiedMemory).mockResolvedValue({
      getStats: () => ({
        tables: [
          { name: 'kv_store' },
          { name: 'vectors' },
          { name: 'q_values' },
        ],
      }),
      kvSet: vi.fn().mockResolvedValue(undefined),
      getDatabase: () => ({
        prepare: () => ({
          get: () => ({ version: 5 }),
        }),
      }),
    } as any);
    vi.mocked(resetUnifiedMemory).mockReturnValue(undefined as any);
  });

  describe('phase metadata', () => {
    it('should have name "database"', () => {
      expect(phase.name).toBe('database');
    });

    it('should have order 40', () => {
      expect(phase.order).toBe(40);
    });

    it('should be critical', () => {
      expect(phase.critical).toBe(true);
    });

    it('should require configuration phase', () => {
      expect(phase.requiresPhases).toContain('configuration');
    });
  });

  describe('execute', () => {
    it('should create data directories', async () => {
      const context = createMockContext();
      await phase.execute(context);

      expect(mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.agentic-qe'),
        expect.objectContaining({ recursive: true })
      );
    });

    it('should initialize unified memory', async () => {
      const context = createMockContext();
      await phase.execute(context);

      expect(initializeUnifiedMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          dbPath: expect.stringContaining('memory.db'),
          walMode: true,
          busyTimeout: 5000,
        })
      );
    });

    it('should return success result with table info', async () => {
      const context = createMockContext();
      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.tablesCreated).toContain('kv_store');
      expect(result.data!.schemaVersion).toBe(5);
    });

    it('should reset unified memory singleton after init', async () => {
      const context = createMockContext();
      await phase.execute(context);

      expect(resetUnifiedMemory).toHaveBeenCalled();
    });

    it('should report created=true when db does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const context = createMockContext();
      const result = await phase.execute(context);

      expect(result.data!.created).toBe(true);
    });

    it('should report created=false when db already exists', async () => {
      vi.mocked(existsSync).mockImplementation((p: any) => {
        if (typeof p === 'string' && p.endsWith('memory.db')) return true;
        return false;
      });
      const context = createMockContext();
      const result = await phase.execute(context);

      expect(result.data!.created).toBe(false);
    });

    it('should handle initialization failure gracefully', async () => {
      vi.mocked(initializeUnifiedMemory).mockRejectedValue(new Error('disk full'));
      const context = createMockContext();
      const result = await phase.execute(context);

      expect(result.success).toBe(false);
      expect(result.message).toContain('failed');
    });

    it('should log database path and schema info', async () => {
      const logFn = vi.fn();
      const context = createMockContext({
        services: { log: logFn, warn: vi.fn(), error: vi.fn() },
      });

      await phase.execute(context);

      expect(logFn).toHaveBeenCalledWith(expect.stringContaining('Database'));
      expect(logFn).toHaveBeenCalledWith(expect.stringContaining('Schema version'));
    });
  });
});
