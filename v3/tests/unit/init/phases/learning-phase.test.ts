/**
 * Test: LearningPhase (Phase 05)
 * Tests learning system initialization, HNSW setup, and pattern loading.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LearningPhase } from '../../../../src/init/phases/05-learning.js';
import type { InitContext } from '../../../../src/init/phases/phase-interface.js';
import type { AQEInitConfig } from '../../../../src/init/types.js';

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

import { existsSync, mkdirSync, writeFileSync } from 'fs';

function createMockContext(
  learningConfig: Partial<AQEInitConfig['learning']> = {},
  optionsOverrides: Partial<InitContext['options']> = {},
): InitContext {
  return {
    projectRoot: '/tmp/test-learning',
    options: {
      skipPatterns: false,
      ...optionsOverrides,
    },
    config: {
      learning: {
        enabled: true,
        embeddingModel: 'transformer',
        hnswConfig: { M: 16, efConstruction: 200 },
        qualityThreshold: 0.7,
        promotionThreshold: 0.85,
        pretrainedPatterns: true,
        ...learningConfig,
      },
    } as AQEInitConfig,
    enhancements: { claudeFlow: false, ruvector: false },
    results: new Map(),
    services: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

describe('LearningPhase', () => {
  let phase: LearningPhase;

  beforeEach(() => {
    vi.clearAllMocks();
    phase = new LearningPhase();
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(mkdirSync).mockReturnValue(undefined as any);
    vi.mocked(writeFileSync).mockReturnValue(undefined);
  });

  describe('phase metadata', () => {
    it('should have name "learning"', () => {
      expect(phase.name).toBe('learning');
    });

    it('should have order 50', () => {
      expect(phase.order).toBe(50);
    });

    it('should not be critical', () => {
      expect(phase.critical).toBe(false);
    });

    it('should require database and configuration phases', () => {
      expect(phase.requiresPhases).toContain('database');
      expect(phase.requiresPhases).toContain('configuration');
    });
  });

  describe('shouldRun', () => {
    it('should return true when learning is enabled', async () => {
      const context = createMockContext({ enabled: true });
      expect(await phase.shouldRun(context)).toBe(true);
    });

    it('should return false when learning is disabled', async () => {
      const context = createMockContext({ enabled: false });
      expect(await phase.shouldRun(context)).toBe(false);
    });

    it('should default to true when config is missing', async () => {
      const context = createMockContext();
      context.config = {} as any;
      expect(await phase.shouldRun(context)).toBe(true);
    });
  });

  describe('execute', () => {
    it('should create data and HNSW directories', async () => {
      const context = createMockContext();
      await phase.execute(context);

      expect(mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('data'),
        expect.objectContaining({ recursive: true })
      );
      expect(mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('hnsw'),
        expect.objectContaining({ recursive: true })
      );
    });

    it('should write learning config JSON file', async () => {
      const context = createMockContext();
      await phase.execute(context);

      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('learning-config.json'),
        expect.any(String),
        'utf-8'
      );

      // Verify JSON content
      const writtenContent = vi.mocked(writeFileSync).mock.calls.find(
        (call: any[]) => (call[0] as string).includes('learning-config.json')
      );
      expect(writtenContent).toBeDefined();
      const parsed = JSON.parse(writtenContent![1] as string);
      expect(parsed).toHaveProperty('embeddingModel');
      expect(parsed).toHaveProperty('hnswConfig');
    });

    it('should return success with learning result', async () => {
      const context = createMockContext();
      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.enabled).toBe(true);
      expect(result.data!.dataDir).toContain('data');
      expect(result.data!.hnswDir).toContain('hnsw');
    });

    it('should return disabled result when learning is disabled in config', async () => {
      const context = createMockContext({ enabled: false });
      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(result.data!.enabled).toBe(false);
      expect(result.data!.patternsLoaded).toBe(0);
    });

    it('should attempt to load pretrained patterns when configured', async () => {
      const context = createMockContext({ pretrainedPatterns: true });
      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      // Patterns dir should be created
      expect(mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('patterns'),
        expect.objectContaining({ recursive: true })
      );
    });

    it('should skip pattern loading when skipPatterns option is set', async () => {
      const context = createMockContext(
        { pretrainedPatterns: true },
        { skipPatterns: true }
      );
      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(result.data!.patternsLoaded).toBe(0);

      // When patterns are skipped, no pattern index.json should be written
      const patternIndexWrites = vi.mocked(writeFileSync).mock.calls.filter(
        (call: any[]) => (call[0] as string).includes('patterns/index.json')
      );
      expect(patternIndexWrites).toHaveLength(0);
    });

    it('should log data directory and pattern count', async () => {
      const logFn = vi.fn();
      const context = createMockContext();
      context.services.log = logFn;

      await phase.execute(context);

      expect(logFn).toHaveBeenCalledWith(expect.stringContaining('Data dir'));
      expect(logFn).toHaveBeenCalledWith(expect.stringContaining('HNSW dir'));
      expect(logFn).toHaveBeenCalledWith(expect.stringContaining('Patterns loaded'));
    });
  });
});
