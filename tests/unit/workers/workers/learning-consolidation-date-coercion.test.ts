/**
 * Regression: issue #493 — Date coercion in LearningConsolidationWorker.
 *
 * Background: v3.9.32 fixed the #491 4-bug chain, which made the self-learning
 * loop reach `LearningConsolidationWorker.consolidatePatterns()` for the first
 * time. Previously dead code immediately threw:
 *
 *   [learning-consolidation] Worker learning-consolidation attempt 1 failed:
 *   u.lastSeen.getTime is not a function
 *
 * Root cause:
 *   - `getDomainPatterns()` builds `LearningPattern` rows by mapping
 *     `lastSeen: p.lastUsedAt`, where `p.lastUsedAt` is a kv-deserialized
 *     **ISO string** (not a `Date`) after the JSON round-trip through
 *     `learning:pattern:*` kv.
 *   - `consolidatePatterns()` and `pruneIneffectivePatterns()` both then call
 *     `p.lastSeen.getTime()`, which throws on a string.
 *
 * The fix rehydrates at the kv-read boundary (`new Date(p.lastUsedAt)`),
 * mirroring the same hardening already in `pattern-store.ts:1301-1304` and
 * `pattern-lifecycle.ts:592-594`. Other sites already convert at this seam;
 * the consolidation worker's two `.getTime()` filters were missed because
 * they were unreachable until #491's fix re-enabled the path.
 *
 * Contract pinned by this test (the post-mining half of the loop):
 *   1. `getDomainPatterns()` produces `lastSeen` as a real `Date` instance
 *      even when the upstream `lastUsedAt` arrives as an ISO string.
 *   2. `consolidatePatterns()` completes without throwing on string-shaped
 *      input — i.e. the seam is hardened, not just the type.
 *   3. `pruneIneffectivePatterns()` completes without throwing on the same
 *      input (the second `.getTime()` call site).
 *   4. The full worker tick reports loop-health success:true and logs
 *      `Learning consolidation complete` (the user-visible signal Jordi
 *      asserts in his before/after table).
 *
 * If this regresses, the loop appears live (bridge + worker tick) but is
 * silently broken end-to-end — exactly the v3.9.32 failure mode.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LearningConsolidationWorker } from '../../../../src/workers/workers/learning-consolidation';
import * as loopHealthModule from '../../../../src/learning/loop-health';
import type { WorkerContext, WorkerMemory } from '../../../../src/workers/interfaces';
import type { LearnedPattern, PatternStats } from '../../../../src/domains/learning-optimization/interfaces';
import type { Result } from '../../../../src/shared/types';

function makeMemory(): WorkerMemory {
  const store = new Map<string, unknown>();
  return {
    async get<T>(key: string): Promise<T | undefined> {
      return store.get(key) as T | undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      store.set(key, value);
    },
    async search(pattern: string): Promise<string[]> {
      const prefix = pattern.replace(/\*+$/, '');
      return Array.from(store.keys()).filter((k) => k.startsWith(prefix));
    },
  };
}

/**
 * Build a `LearnedPattern` whose `lastUsedAt` is the exact shape produced by
 * a JSON round-trip through `learning:pattern:*` kv: an ISO **string**, not
 * a Date. The interface declares Date — runtime reality is what bites us.
 */
function makeKvShapedPattern(overrides: Partial<LearnedPattern> = {}): LearnedPattern {
  const base = {
    id: 'p-test-1',
    type: 'workflow-pattern' as const,
    domain: 'test-generation' as const,
    name: 'auth-then-fetch',
    description: 'mined from 12 high-reward experiences',
    confidence: 0.85,
    usageCount: 12,
    successRate: 0.9,
    context: {
      tags: ['auth', 'fetch'],
    },
    template: {
      type: 'workflow' as const,
      content: '{}',
      variables: [],
    },
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    // CRITICAL: this is a STRING (kv JSON round-trip), not a Date.
    // TypeScript loses this at the kv boundary; the runtime is what matters.
    lastUsedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() as unknown as Date,
  };
  return { ...base, ...overrides };
}

function makeContextWithStats(
  stats: PatternStats,
  options: { onlyForDomain?: string } = {},
): {
  context: WorkerContext;
  logs: Array<{ level: string; message: string; meta?: unknown }>;
} {
  const logs: Array<{ level: string; message: string; meta?: unknown }> = [];
  const logger = {
    debug: (m: string, meta?: unknown) => logs.push({ level: 'debug', message: m, meta }),
    info: (m: string, meta?: unknown) => logs.push({ level: 'info', message: m, meta }),
    warn: (m: string, meta?: unknown) => logs.push({ level: 'warn', message: m, meta }),
    error: (m: string, meta?: unknown) => logs.push({ level: 'error', message: m, meta }),
  };

  // `collectPatterns` iterates every domain; without `onlyForDomain`, every
  // domain returns the same `stats` and counts multiply by domain count.
  // For per-pattern assertions, pin to a single domain.
  const learningAPI = {
    getPatternStats: vi.fn(
      async (domain?: string): Promise<Result<PatternStats>> => {
        if (options.onlyForDomain && domain !== options.onlyForDomain) {
          return {
            success: true,
            value: emptyStats(),
          };
        }
        return { success: true, value: stats };
      },
    ),
  };

  return {
    context: {
      eventBus: {
        publish: vi.fn(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      } as unknown as WorkerContext['eventBus'],
      memory: makeMemory(),
      logger,
      domains: {
        getDomainAPI: vi.fn(<T>(domain: string) =>
          domain === 'learning-optimization' ? (learningAPI as unknown as T) : undefined,
        ),
        getDomainHealth: () => ({ status: 'healthy', errors: [] }),
      },
      signal: new AbortController().signal,
    },
    logs,
  };
}

const emptyStats = (): PatternStats => ({
  totalPatterns: 0,
  byType: {} as PatternStats['byType'],
  byDomain: {} as PatternStats['byDomain'],
  avgConfidence: 0,
  avgSuccessRate: 0,
  topPatterns: [],
});

describe('Issue #493 — Date coercion in LearningConsolidationWorker', () => {
  let worker: LearningConsolidationWorker;

  beforeEach(() => {
    worker = new LearningConsolidationWorker();
  });

  describe('getDomainPatterns (the kv-read seam)', () => {
    it('rehydrates ISO-string lastUsedAt into a real Date on lastSeen', async () => {
      const isoString = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const stats: PatternStats = {
        ...emptyStats(),
        totalPatterns: 1,
        topPatterns: [
          makeKvShapedPattern({
            lastUsedAt: isoString as unknown as Date,
          }),
        ],
      };

      const { context } = makeContextWithStats(stats);

      const patterns = await (
        worker as unknown as {
          getDomainPatterns: (
            ctx: WorkerContext,
            domain: string,
          ) => Promise<Array<{ lastSeen: unknown }>>;
        }
      ).getDomainPatterns(context, 'test-generation');

      expect(patterns).toHaveLength(1);
      // The seam MUST hand a real Date to downstream consumers.
      expect(patterns[0]!.lastSeen).toBeInstanceOf(Date);
      // And the value must round-trip back to the original moment.
      expect((patterns[0]!.lastSeen as Date).toISOString()).toBe(isoString);
    });
  });

  describe('consolidatePatterns (throw site #1)', () => {
    it('does NOT throw `getTime is not a function` when lastSeen came from kv as a string', async () => {
      // Drive the production path: collectPatterns calls getDomainPatterns
      // for every domain. Stubbing collectPatterns directly would mask the
      // bug — we exercise it through the real seam.
      const isoString = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const stats: PatternStats = {
        ...emptyStats(),
        totalPatterns: 1,
        topPatterns: [
          makeKvShapedPattern({
            id: 'p-recent',
            confidence: 0.9,
            successRate: 0.85,
            lastUsedAt: isoString as unknown as Date,
          }),
        ],
      };
      const { context } = makeContextWithStats(stats);

      // Collect through the real seam.
      const patterns = await (
        worker as unknown as {
          collectPatterns: (ctx: WorkerContext) => Promise<unknown[]>;
        }
      ).collectPatterns(context);

      // Then run the consumer that throws pre-fix.
      await expect(
        (
          worker as unknown as {
            consolidatePatterns: (ctx: WorkerContext, p: unknown[]) => Promise<unknown>;
          }
        ).consolidatePatterns(context, patterns),
      ).resolves.toBeDefined();
    });

    it('correctly classifies a recent high-performer as a new insight (filter math works on the rehydrated Date)', async () => {
      // Pin not just "doesn't throw" but also "produces the right answer".
      // If someone replaces `.getTime()` with a try/catch swallow instead of
      // a real Date conversion, this test catches it: the filter would
      // silently exclude the pattern instead of counting it.
      const recentIso = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago
      const stats: PatternStats = {
        ...emptyStats(),
        totalPatterns: 1,
        topPatterns: [
          makeKvShapedPattern({
            id: 'p-recent-high',
            domain: 'test-generation',
            confidence: 0.9,
            successRate: 0.9, // > 0.8 effectiveness threshold
            lastUsedAt: recentIso as unknown as Date,
          }),
        ],
      };
      const { context } = makeContextWithStats(stats, { onlyForDomain: 'test-generation' });

      const patterns = await (
        worker as unknown as {
          collectPatterns: (ctx: WorkerContext) => Promise<unknown[]>;
        }
      ).collectPatterns(context);

      const result = (await (
        worker as unknown as {
          consolidatePatterns: (
            ctx: WorkerContext,
            p: unknown[],
          ) => Promise<{ newInsights: number; patternsAnalyzed: number }>;
        }
      ).consolidatePatterns(context, patterns)) as {
        newInsights: number;
        patternsAnalyzed: number;
      };

      expect(result.patternsAnalyzed).toBe(1);
      // recent + effective → counted as a new insight (the filter at
      // learning-consolidation.ts:896-899 must read `daysSinceLastSeen < 7`
      // correctly, which only works if lastSeen is a real Date).
      expect(result.newInsights).toBe(1);
    });
  });

  describe('pruneIneffectivePatterns (throw site #2)', () => {
    it('does NOT throw on string-shaped lastSeen and correctly identifies stale patterns', async () => {
      // A 60-day-old pattern must be classified as stale (>30 days). If the
      // Date math fails silently, the stale filter returns zero and the
      // user-facing finding goes missing.
      const stalenessIso = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const stats: PatternStats = {
        ...emptyStats(),
        totalPatterns: 1,
        topPatterns: [
          makeKvShapedPattern({
            id: 'p-stale',
            domain: 'test-generation',
            lastUsedAt: stalenessIso as unknown as Date,
          }),
        ],
      };
      const { context } = makeContextWithStats(stats, { onlyForDomain: 'test-generation' });

      const patterns = await (
        worker as unknown as {
          collectPatterns: (ctx: WorkerContext) => Promise<unknown[]>;
        }
      ).collectPatterns(context);

      const findings: unknown[] = [];
      const recommendations: unknown[] = [];

      expect(() =>
        (
          worker as unknown as {
            pruneIneffectivePatterns: (
              p: unknown[],
              f: unknown[],
              r: unknown[],
            ) => void;
          }
        ).pruneIneffectivePatterns(patterns, findings, recommendations),
      ).not.toThrow();

      // The stale-finding must actually be produced — that's the proof the
      // Date math worked, not just that the throw was suppressed.
      const staleFinding = (findings as Array<{ type: string }>).find(
        (f) => f.type === 'stale-patterns',
      );
      expect(staleFinding).toBeDefined();
    });
  });

  describe('full worker tick (the user-visible signal)', () => {
    it('completes a full doExecute with patterns present and reports loop-health success', async () => {
      // The end-to-end assertion Jordi's release-gate suggestion called out:
      // a seam test that seeds a learning:pattern:* entry and asserts the
      // worker reaches `Learning consolidation complete`, not just that it
      // "ran" (because the previous gate only proved the tick happened, not
      // that it completed).
      const isoString = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const stats: PatternStats = {
        ...emptyStats(),
        totalPatterns: 1,
        topPatterns: [
          makeKvShapedPattern({
            lastUsedAt: isoString as unknown as Date,
          }),
        ],
      };
      const { context, logs } = makeContextWithStats(stats);

      // Stub the dream cycle and lifecycle manager — both touch sqlite and
      // are tested elsewhere. Keep this test focused on the kv-Date seam.
      vi.spyOn(
        worker as unknown as {
          runDreamCycle: () => Promise<{ insights: number; patternsCreated: number }>;
        },
        'runDreamCycle',
      ).mockResolvedValue({ insights: 0, patternsCreated: 0 });
      vi.spyOn(
        worker as unknown as {
          getLifecycleManager: () => Promise<null>;
        },
        'getLifecycleManager',
      ).mockResolvedValue(null);

      const recordSpy = vi.spyOn(loopHealthModule, 'recordLoopHealth');

      // Must not throw — pre-fix this throws `getTime is not a function`.
      await expect(
        (
          worker as unknown as {
            doExecute: (ctx: WorkerContext) => Promise<unknown>;
          }
        ).doExecute(context),
      ).resolves.toBeDefined();

      // The user-visible signals Jordi's before/after table asserts:
      //   1. daemon.log line "Learning consolidation complete"
      const completionLog = logs.find((l) => l.message === 'Learning consolidation complete');
      expect(completionLog).toBeDefined();
      expect(completionLog!.level).toBe('info');

      //   2. loop-health reports success:true (worker shows as live, not never-ran)
      expect(recordSpy).toHaveBeenCalled();
      const lastCall = recordSpy.mock.calls[recordSpy.mock.calls.length - 1]!;
      const [, component, status] = lastCall;
      expect(component).toBe('learningWorker');
      expect(status).toMatchObject({ success: true });
    });
  });
});
