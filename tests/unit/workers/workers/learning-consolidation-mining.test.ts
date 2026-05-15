/**
 * Regression: issue #486 Gap A
 *
 * Before this fix, the `LearningConsolidationWorker.doExecute` path called
 * `lifecycleManager.runContinuousLearningLoop` which uses
 * `getRecentExperiences` + `findPatternCandidates` — a different code path
 * than `mineExperiences`. The result: `learning:pattern:*` kv stayed at 0
 * in default deployments because nothing auto-triggered the mining chain
 * that writes the kv (LearningCoordinatorService.mineExperiences →
 * extractPatternsFromExperiences → learnPattern → storePattern).
 *
 * The fix adds a new private `mineExperiencesPerDomain` step inside
 * `runContinuousLearningLoop`. Per-domain cursor at
 * `learning:consolidation-cursor:{domain}` advances only when mining
 * returned a non-zero experienceCount, so failures and empty windows
 * don't silently consume fresh experiences arriving milliseconds later.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LearningConsolidationWorker } from '../../../../src/workers/workers/learning-consolidation';
import { TimeRange } from '../../../../src/shared/value-objects/index';
import type { WorkerContext } from '../../../../src/workers/interfaces';
import { ALL_DOMAINS, type DomainName } from '../../../../src/shared/types/index';

type MockMineResult =
  | { success: true; value: { experienceCount: number; successRate: number; avgReward: number; patterns: unknown[]; anomalies: unknown[]; recommendations: string[] } }
  | { success: false; error: Error };

function makeContext(mineByDomain: Record<string, MockMineResult>): {
  context: WorkerContext;
  kv: Map<string, unknown>;
  mineSpy: ReturnType<typeof vi.fn>;
} {
  const kv = new Map<string, unknown>();
  const mineSpy = vi.fn(async (domain: DomainName, _timeRange: TimeRange) => {
    return (
      mineByDomain[domain] ?? {
        success: true,
        value: {
          experienceCount: 0,
          successRate: 0,
          avgReward: 0,
          patterns: [],
          anomalies: [],
          recommendations: [],
        },
      }
    );
  });

  const learningService = { mineExperiences: mineSpy };

  const learningAPI = {
    getLearningService: () => learningService,
  };

  const context: WorkerContext = {
    memory: {
      get: vi.fn(async <T>(key: string) => (kv.has(key) ? (kv.get(key) as T) : undefined)),
      set: vi.fn(async (key: string, value: unknown) => {
        kv.set(key, value);
      }),
      search: vi.fn(async () => []),
    } as unknown as WorkerContext['memory'],
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    eventBus: { publish: vi.fn() },
    domains: {
      getDomainAPI: vi.fn(<T>(domain: string) =>
        domain === 'learning-optimization' ? (learningAPI as unknown as T) : undefined,
      ),
      getDomainHealth: vi.fn(() => ({ status: 'ok', errors: [] })),
    },
    signal: new AbortController().signal,
  };

  return { context, kv, mineSpy };
}

function invokeMiningSweep(worker: LearningConsolidationWorker, context: WorkerContext) {
  // mineExperiencesPerDomain is private — exercise it directly to keep this
  // test surgical (full doExecute requires SQLite + DreamEngine setup that
  // the existing test file already calls out as integration-only territory).
  return (worker as unknown as {
    mineExperiencesPerDomain: (
      c: WorkerContext,
      findings: unknown[],
    ) => Promise<{ patternsMined: number; domainsMined: number }>;
  }).mineExperiencesPerDomain(context, []);
}

describe('LearningConsolidationWorker.mineExperiencesPerDomain (#486 Gap A)', () => {
  let worker: LearningConsolidationWorker;

  beforeEach(() => {
    worker = new LearningConsolidationWorker();
  });

  it('calls mineExperiences once per domain', async () => {
    const { context, mineSpy } = makeContext({});

    const result = await invokeMiningSweep(worker, context);

    expect(mineSpy).toHaveBeenCalledTimes(ALL_DOMAINS.length);
    const calledDomains = mineSpy.mock.calls.map((c) => c[0]);
    for (const domain of ALL_DOMAINS) {
      expect(calledDomains).toContain(domain);
    }
    // Empty experiences across all domains → nothing mined, nothing advanced.
    expect(result.patternsMined).toBe(0);
    expect(result.domainsMined).toBe(0);
  });

  it('advances the cursor for domains that returned experienceCount > 0', async () => {
    const { context, kv } = makeContext({
      'test-generation': {
        success: true,
        value: {
          experienceCount: 25,
          successRate: 0.8,
          avgReward: 0.7,
          patterns: [{ id: 'p1' }, { id: 'p2' }],
          anomalies: [],
          recommendations: [],
        },
      },
      'coverage-analysis': {
        success: true,
        value: {
          experienceCount: 0,
          successRate: 0,
          avgReward: 0,
          patterns: [],
          anomalies: [],
          recommendations: [],
        },
      },
    });

    const result = await invokeMiningSweep(worker, context);

    expect(result.patternsMined).toBe(2);
    expect(result.domainsMined).toBe(1);

    // Cursor advanced only for the domain with experiences.
    expect(kv.has('learning:consolidation-cursor:test-generation')).toBe(true);
    expect(kv.has('learning:consolidation-cursor:coverage-analysis')).toBe(false);

    // The advanced cursor is a parseable ISO timestamp.
    const cursorIso = kv.get('learning:consolidation-cursor:test-generation') as string;
    expect(typeof cursorIso).toBe('string');
    expect(new Date(cursorIso).toString()).not.toBe('Invalid Date');
  });

  it('does NOT advance the cursor when mineExperiences returns failure', async () => {
    const { context, kv } = makeContext({
      'test-generation': { success: false, error: new Error('boom') },
    });

    await invokeMiningSweep(worker, context);

    expect(kv.has('learning:consolidation-cursor:test-generation')).toBe(false);
  });

  it('isolates per-domain throws — one bad domain does not block others', async () => {
    const { context, kv } = makeContext({});

    // Override mineExperiences to throw for one specific domain.
    const learningAPI = (context.domains.getDomainAPI as ReturnType<typeof vi.fn>).mock.results[0]
      ?.value;
    // Re-issue the API resolver so it returns a service that throws for `defect-intelligence`.
    const throwingService = {
      mineExperiences: vi.fn(async (domain: DomainName) => {
        if (domain === 'defect-intelligence') {
          throw new Error('SQLite locked');
        }
        if (domain === 'requirements-validation') {
          return {
            success: true,
            value: {
              experienceCount: 10,
              successRate: 0.5,
              avgReward: 0.5,
              patterns: [{ id: 'p-req' }],
              anomalies: [],
              recommendations: [],
            },
          };
        }
        return {
          success: true,
          value: {
            experienceCount: 0,
            successRate: 0,
            avgReward: 0,
            patterns: [],
            anomalies: [],
            recommendations: [],
          },
        };
      }),
    };
    (context.domains.getDomainAPI as ReturnType<typeof vi.fn>).mockReturnValue({
      getLearningService: () => throwingService,
    });
    void learningAPI;

    const result = await invokeMiningSweep(worker, context);

    // The throw for defect-intelligence did NOT abort the sweep — requirements-validation still mined.
    expect(result.patternsMined).toBe(1);
    expect(result.domainsMined).toBe(1);
    expect(kv.has('learning:consolidation-cursor:requirements-validation')).toBe(true);
    expect(kv.has('learning:consolidation-cursor:defect-intelligence')).toBe(false);
  });

  it('uses the stored cursor as the next mining window start', async () => {
    const { context, mineSpy } = makeContext({
      'test-generation': {
        success: true,
        value: {
          experienceCount: 5,
          successRate: 1,
          avgReward: 1,
          patterns: [{ id: 'p1' }],
          anomalies: [],
          recommendations: [],
        },
      },
    });

    // Seed a cursor 2 hours ago.
    const seededIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await context.memory.set('learning:consolidation-cursor:test-generation', seededIso);

    await invokeMiningSweep(worker, context);

    const callForTestGen = mineSpy.mock.calls.find((c) => c[0] === 'test-generation');
    expect(callForTestGen).toBeDefined();
    const timeRange = callForTestGen![1] as TimeRange;
    // Window start matches the seeded cursor (within a tick).
    expect(timeRange.start.toISOString()).toBe(seededIso);
    // Window end is near now.
    expect(Date.now() - timeRange.end.getTime()).toBeLessThan(1000);
  });

  it('clamps a corrupted/future cursor to the default 1-day lookback', async () => {
    const { context, mineSpy } = makeContext({
      'test-generation': {
        success: true,
        value: {
          experienceCount: 1,
          successRate: 1,
          avgReward: 1,
          patterns: [],
          anomalies: [],
          recommendations: [],
        },
      },
    });

    // Future cursor → guard kicks in.
    const futureIso = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await context.memory.set('learning:consolidation-cursor:test-generation', futureIso);

    await invokeMiningSweep(worker, context);

    const callForTestGen = mineSpy.mock.calls.find((c) => c[0] === 'test-generation');
    const timeRange = callForTestGen![1] as TimeRange;
    // Should fall back to the 1-day lookback window.
    const lookbackMs = 24 * 60 * 60 * 1000;
    const actualDelta = timeRange.end.getTime() - timeRange.start.getTime();
    expect(Math.abs(actualDelta - lookbackMs)).toBeLessThan(2000);
  });

  it('is a graceful no-op when the learning-optimization API is unavailable', async () => {
    const worker2 = new LearningConsolidationWorker();
    const { context } = makeContext({});
    (context.domains.getDomainAPI as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    const result = await invokeMiningSweep(worker2, context);

    expect(result.patternsMined).toBe(0);
    expect(result.domainsMined).toBe(0);
  });
});
