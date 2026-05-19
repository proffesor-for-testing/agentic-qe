/**
 * Shared mock factories for aqe-learning-engine.test.ts and its splits
 * (issue #448 step 2). The underscore prefix keeps this file out of
 * vitest's test-file include glob; it's a helper module, not a suite.
 */

import { vi } from 'vitest';
import type { MemoryBackend, EventBus } from '../../../src/kernel/interfaces.js';

export function createMockMemoryBackend(): MemoryBackend {
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
    clear: vi.fn(() => {
      storage.clear();
      return Promise.resolve();
    }),
    size: vi.fn(() => Promise.resolve(storage.size)),
    close: vi.fn(() => Promise.resolve()),
    getState: vi.fn(() => ({ type: 'memory', ready: true })),
  } as unknown as MemoryBackend;
}

export function createMockEventBus(): EventBus {
  return {
    publish: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
    unsubscribe: vi.fn(),
    emit: vi.fn(),
  } as unknown as EventBus;
}
