/**
 * Issue #491 follow-up — generalize Bug 1 protection to every worker.
 *
 * The original Bug 1 fix wired the daemon's WorkerManager to the kernel
 * in `handleFleetInit`, and one targeted integration test pins that the
 * `learning-optimization` API is reachable post-init. But the same
 * StubWorkerDomainAccess failure mode applies to every other worker that
 * declares `targetDomains` — `test-health`, `flaky-detector`,
 * `coverage-tracker`, etc. — and the worker-level unit tests all
 * explicitly punt on this with comments like *"complex dependencies …
 * require integration tests for full coverage. Unit tests focus on
 * instantiation."* That punt is what let Bug 1 ship.
 *
 * This test iterates every registered production worker, builds the
 * exact WorkerContext the daemon scheduler hands to `doExecute`, and
 * asserts that each of the worker's declared targetDomains resolves to
 * a real domain API. If the kernel→worker wiring ever breaks again —
 * for ANY of the 11 workers, not just learning-consolidation — this
 * test fails before the daemon ticks for users.
 *
 * Notes on scope:
 *   - We do NOT call `runWorker()` to run each worker's full body.
 *     Most workers raise legitimate "no data yet" errors on fresh
 *     installs (test-health, flaky-detector etc.) and asserting
 *     completion would couple this test to each worker's empty-state
 *     behaviour. The contract we want is structural — *"the seam to
 *     the kernel is alive"* — not behavioural.
 *   - This is the structural complement to the existing
 *     fleet-init-wires-daemon test (which proves the seam exists);
 *     this proves EVERY worker can traverse it.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { handleFleetInit, disposeFleet } from '../../../src/mcp/handlers/core-handlers';
import { getDaemon, resetDaemon } from '../../../src/workers/daemon';
import type { DomainName } from '../../../src/shared/types';

describe('Issue #491 — every production worker can reach its targetDomains', () => {
  beforeAll(async () => {
    await disposeFleet();
    resetDaemon();

    // lazyLoading:false so EVERY domain plugin is loaded — required for
    // workers whose target domains are not on the lazy-init hot path.
    const result = await handleFleetInit({
      memoryBackend: 'memory',
      maxAgents: 4,
      lazyLoading: false,
    });
    expect(result.success).toBe(true);
  });

  afterAll(async () => {
    await disposeFleet();
    resetDaemon();
  });

  // Enumerate the registered workers AT TEST TIME so we don't have to
  // keep this list in sync with src/workers/daemon.ts. If a new worker
  // is added, this test automatically extends to cover it.
  it('every registered worker declares at least one targetDomain', () => {
    const workers = getDaemon().getWorkerManager().list();
    expect(workers.length).toBeGreaterThan(0);

    for (const w of workers) {
      expect(
        w.config.targetDomains.length,
        `worker ${w.config.id} has no targetDomains — that's almost certainly a misconfig`
      ).toBeGreaterThan(0);
    }
  });

  it('each worker resolves a non-undefined API for every targetDomain', () => {
    const workerManager = getDaemon().getWorkerManager();
    const workers = workerManager.list();

    // Reach behind the public interface for the context the scheduler
    // would hand to doExecute. The shape is identical to what
    // BaseWorker.execute receives every tick.
    const createContext = (workerManager as unknown as {
      createContext: (id: string, signal: AbortSignal) => {
        domains: { getDomainAPI: <T>(d: DomainName) => T | undefined };
      };
    }).createContext.bind(workerManager);

    const failures: Array<{ worker: string; domain: DomainName }> = [];

    for (const worker of workers) {
      const ctx = createContext(worker.config.id, new AbortController().signal);

      for (const domain of worker.config.targetDomains) {
        const api = ctx.domains.getDomainAPI(domain);
        if (api === undefined) {
          failures.push({ worker: worker.config.id, domain });
        }
      }
    }

    // Format the failure list explicitly — when this test fails we want
    // the maintainer to see exactly which seam broke, not just a count.
    expect(
      failures,
      `Workers that cannot reach their target domains (StubWorkerDomainAccess regression):\n` +
        failures.map((f) => `  - ${f.worker} → ${f.domain}`).join('\n')
    ).toEqual([]);
  });

  it('the worker manager memory is the kernel memory (Bug 4b regression guard)', () => {
    const workerManager = getDaemon().getWorkerManager();
    const ctx = (workerManager as unknown as {
      createContext: (id: string, signal: AbortSignal) => { memory: unknown };
    }).createContext('memory-check', new AbortController().signal);

    // Touching state.kernel through the handler's getFleetState would
    // be cleaner, but the existing fleet-init-wires-daemon test already
    // asserts identity directly; here we just check the memory isn't
    // the in-process InMemoryWorkerMemory stub (which would mean Bug 4b
    // has regressed and the dashboard would be reading from a
    // different kv than workers write to).
    expect(ctx.memory).toBeDefined();
    // The in-process worker memory exposes no `vectorSearch`; the
    // kernel's HybridMemoryBackend does. This is a cheap, structural
    // way to detect the regression without importing internals.
    const memoryShape = ctx.memory as { vectorSearch?: unknown };
    expect(typeof memoryShape.vectorSearch).toBe('function');
  });
});
