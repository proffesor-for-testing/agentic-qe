/**
 * Unit Tests — AQELearningEngine factory + default-config
 *
 * Extracted from aqe-learning-engine.test.ts (issue #448, step 2). These
 * are light tests — Factory Functions only call the constructor (no
 * `engine.initialize()`, so no transformer / HNSW / WASM load), and
 * DEFAULT_ENGINE_CONFIG is a plain constant assertion. Splitting them
 * out keeps them out of the heavy fork's heap budget.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AQELearningEngine,
  createAQELearningEngine,
  createDefaultLearningEngine,
  DEFAULT_ENGINE_CONFIG,
} from '../../../src/learning/aqe-learning-engine.js';
import type { MemoryBackend } from '../../../src/kernel/interfaces.js';
import { createMockMemoryBackend, createMockEventBus } from './_aqe-engine-test-helpers';

describe('Factory Functions', () => {
  let memory: MemoryBackend;

  beforeEach(() => {
    memory = createMockMemoryBackend();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create engine with createAQELearningEngine', () => {
    const engine = createAQELearningEngine(memory, {
      projectRoot: '/test',
    });

    expect(engine).toBeInstanceOf(AQELearningEngine);
  });

  it('should create engine with createDefaultLearningEngine', () => {
    const engine = createDefaultLearningEngine(memory, '/test');

    expect(engine).toBeInstanceOf(AQELearningEngine);
  });

  it('should accept optional event bus', () => {
    const eventBus = createMockEventBus();
    const engine = createAQELearningEngine(
      memory,
      { projectRoot: '/test' },
      eventBus
    );

    expect(engine).toBeInstanceOf(AQELearningEngine);
  });
});

describe('DEFAULT_ENGINE_CONFIG', () => {
  it('should have expected defaults', () => {
    expect(DEFAULT_ENGINE_CONFIG.enableClaudeFlow).toBe(true);
    expect(DEFAULT_ENGINE_CONFIG.enableExperienceCapture).toBe(true);
    expect(DEFAULT_ENGINE_CONFIG.enablePatternPromotion).toBe(true);
    expect(DEFAULT_ENGINE_CONFIG.promotionThreshold).toBe(3);
  });
});
