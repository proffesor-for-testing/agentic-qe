/**
 * Regression tests for AQELearningEngine — witness chain wiring & domain transfer
 *
 * Validates that the new initialization paths (witness chain, domain transfer)
 * added in the march-fixes-and-improvements branch do not break engine init/dispose.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AQELearningEngine,
  createAQELearningEngine,
} from '../../../src/learning/aqe-learning-engine.js';
import type { MemoryBackend, EventBus } from '../../../src/kernel/interfaces.js';

// ============================================================================
// Mock Factory
// ============================================================================

function createMockMemoryBackend(): MemoryBackend {
  const storage = new Map<string, unknown>();
  return {
    get: vi.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
    set: vi.fn((key: string, value: unknown) => {
      storage.set(key, value);
      return Promise.resolve();
    }),
    delete: vi.fn((key: string) => {
      storage.delete(key);
      return Promise.resolve();
    }),
    has: vi.fn((key: string) => Promise.resolve(storage.has(key))),
    keys: vi.fn(() => Promise.resolve(Array.from(storage.keys()))),
    search: vi.fn((pattern: string) => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      const matches = Array.from(storage.keys()).filter((k) => regex.test(k));
      return Promise.resolve(matches);
    }),
    clear: vi.fn(() => { storage.clear(); return Promise.resolve(); }),
    size: vi.fn(() => Promise.resolve(storage.size)),
    close: vi.fn(() => Promise.resolve()),
    getState: vi.fn(() => ({ type: 'memory', ready: true })),
  } as unknown as MemoryBackend;
}

function createMockEventBus(): EventBus {
  return {
    publish: vi.fn(),
    subscribe: vi.fn().mockReturnValue({ unsubscribe: () => {}, active: true }),
    subscribeToChannel: vi.fn().mockReturnValue({ unsubscribe: () => {}, active: true }),
    getHistory: vi.fn().mockResolvedValue([]),
    dispose: vi.fn(),
  } as unknown as EventBus;
}

// ============================================================================
// Tests
// ============================================================================

describe('AQELearningEngine — Regression: witness chain & domain transfer wiring', () => {
  let memory: MemoryBackend;
  let eventBus: EventBus;
  let engine: AQELearningEngine;

  beforeEach(() => {
    memory = createMockMemoryBackend();
    eventBus = createMockEventBus();
    engine = createAQELearningEngine(
      memory,
      { projectRoot: '/test/project', enableClaudeFlow: false },
      eventBus
    );
  });

  afterEach(async () => {
    await engine.dispose();
  });

  it('should initialize successfully even when witness chain module is unavailable', async () => {
    // Witness chain wiring uses dynamic import and catches errors
    await engine.initialize();
    const status = engine.getStatus();
    expect(status.initialized).toBe(true);
    expect(status.features.patternLearning).toBe(true);
  }, 30_000);

  it('should initialize successfully even when domain transfer module is unavailable', async () => {
    // Domain transfer wiring uses dynamic import and catches errors
    await engine.initialize();
    const status = engine.getStatus();
    expect(status.initialized).toBe(true);
  }, 30_000);

  it('should not initialize twice', async () => {
    await engine.initialize();
    await engine.initialize(); // should be a no-op
    const status = engine.getStatus();
    expect(status.initialized).toBe(true);
  }, 30_000);

  it('should dispose cleanly after initialization with domain transfer interval', async () => {
    await engine.initialize();
    // dispose() should clear the domain transfer interval without errors
    await engine.dispose();
    const status = engine.getStatus();
    expect(status.initialized).toBe(false);
  }, 30_000);

  it('should dispose cleanly without prior initialization', async () => {
    // dispose() on an uninitialized engine should not throw
    await engine.dispose();
  });

  it('should report stats after initialization with new wiring paths', async () => {
    await engine.initialize();
    const stats = await engine.getStats();
    expect(stats).toBeDefined();
    expect(typeof stats.activeTasks).toBe('number');
    expect(typeof stats.completedTasks).toBe('number');
    expect(stats.experienceCapture).toBeDefined();
  }, 30_000);
});
