/**
 * Issue #478 — bound ReasoningBank.initialize() with AbortSignal so a
 * caller-side timeout actually stops the work instead of leaking writes
 * through the patterns.rvf adapter for the rest of the process lifetime.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  seedCrossDomainPatterns,
  type SeedingDeps,
} from '../../../src/learning/pattern-promotion';
import { QEReasoningBank } from '../../../src/learning/qe-reasoning-bank';
import { createMockMemory } from '../../mocks';
import type {
  IPatternStore,
  PatternStoreStats,
} from '../../../src/learning/pattern-store';
import type { Result } from '../../../src/shared/types/index';
import { ok } from '../../../src/shared/types/index';
import type {
  QEPattern,
  QEDomain,
} from '../../../src/learning/qe-patterns';

function makeFakePattern(domain: QEDomain, n: number): QEPattern {
  return {
    id: `${domain}-${n}`,
    patternType: 'test-template',
    qeDomain: domain,
    name: `pattern-${domain}-${n}`,
    description: `desc ${n}`,
    template: { type: 'code', content: '...', variables: [] },
    context: {
      tags: [],
      relatedDomains: [],
    } as unknown as QEPattern['context'],
    confidence: 0.7,
  } as QEPattern;
}

function fakeStats(): PatternStoreStats {
  // Populate one source domain so the seed loop has work to do, leave the
  // related target domains empty so transfers fire on every iteration.
  return {
    totalPatterns: 50,
    byDomain: {
      'test-generation': 50,
    } as Record<QEDomain, number>,
    byType: {} as Record<string, number>,
    byTier: { 'short-term': 50, 'long-term': 0 },
    byLanguage: {} as Record<string, number>,
    avgQuality: 0.7,
    avgUsage: 0,
  } as unknown as PatternStoreStats;
}

describe('Issue #478 — init abort propagation', () => {
  describe('seedCrossDomainPatterns', () => {
    it('stops storing patterns once the signal is aborted', async () => {
      const sourcePatterns: QEPattern[] = Array.from({ length: 50 }, (_, i) =>
        makeFakePattern('test-generation' as QEDomain, i)
      );

      let storeCount = 0;
      const controller = new AbortController();

      const deps: SeedingDeps = {
        patternStore: {
          getStats: async () => fakeStats(),
        } as unknown as IPatternStore,
        searchPatterns: vi.fn(async (_q, _opts) =>
          ok(sourcePatterns.map((p) => ({ pattern: p, score: 0.5 })))
        ),
        storePattern: vi.fn(async () => {
          storeCount += 1;
          // Abort partway through — the loop must stop on the next iteration.
          if (storeCount === 3) controller.abort();
          return ok(makeFakePattern('coverage-analysis' as QEDomain, 999));
        }),
        signal: controller.signal,
      };

      await expect(seedCrossDomainPatterns(deps)).rejects.toThrow();

      // The native Promise.race-based loop in v3.9.26 would have called
      // storePattern hundreds of times after the timeout fired. With the
      // signal threaded in, we should be very close to the abort point.
      expect(storeCount).toBeLessThan(10);
    });

    it('throws synchronously when the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const deps: SeedingDeps = {
        patternStore: {
          getStats: vi.fn(async () => fakeStats()),
        } as unknown as IPatternStore,
        searchPatterns: vi.fn(),
        storePattern: vi.fn(),
        signal: controller.signal,
      };

      await expect(seedCrossDomainPatterns(deps)).rejects.toThrow();
      expect(deps.searchPatterns).not.toHaveBeenCalled();
      expect(deps.storePattern).not.toHaveBeenCalled();
    });
  });

  describe('QEReasoningBank.initialize', () => {
    it('rejects immediately when the signal is pre-aborted', async () => {
      const memory = createMockMemory();
      const bank = new QEReasoningBank(memory);

      const controller = new AbortController();
      controller.abort();

      await expect(
        bank.initialize({ signal: controller.signal })
      ).rejects.toThrow();
    });

    // Backward-compatibility of `initialize()` (no args) is verified by the
    // TypeScript build: every existing call site in src/ continues to compile
    // unchanged because the new `options` parameter is optional. Running a
    // real bootstrap here would exhaust the codespace worker heap.
  });
});
