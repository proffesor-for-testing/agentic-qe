/**
 * Integration test for issue #491 Bug 1 + Bug 4b.
 *
 * The MCP-hosted daemon constructs its WorkerManager *before* the kernel
 * exists (src/mcp/entry.ts calls daemon.start() with no kernel) and is
 * given no late hook to learn about the kernel. Until v3.9.30, that meant
 * every domain-dependent worker tick failed with "<domain> not available"
 * and `aqe learning loop-health` showed `learningWorker: never-ran` even
 * when the worker ran every cycle.
 *
 * This test pins the contract: after handleFleetInit returns, the global
 * daemon's WorkerManager:
 *   1. resolves a real domain API (not undefined from StubWorkerDomainAccess)
 *   2. holds the same memory instance the kernel holds (so worker writes
 *      reach the dashboard's reads)
 *
 * If anyone ever drops the setKernel / setMemory wiring from handleFleetInit
 * again — as #491 documents has happened before — this test fails before
 * users ever see it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  handleFleetInit,
  disposeFleet,
  getFleetState,
} from '../../../src/mcp/handlers/core-handlers';
import { getDaemon, resetDaemon } from '../../../src/workers/daemon';

describe('Issue #491 — fleet_init wires daemon WorkerManager', () => {
  beforeEach(async () => {
    // Both globals must be reset so each test sees a fresh wiring path.
    await disposeFleet();
    resetDaemon();
  });

  afterEach(async () => {
    await disposeFleet();
    resetDaemon();
  });

  it('exposes a non-undefined domain API from the daemon worker manager', async () => {
    // Pre-init the daemon to reproduce the production sequence (entry.ts
    // creates the daemon before the kernel exists).
    const daemon = getDaemon();
    const workerManager = daemon.getWorkerManager();

    // Sanity: with no kernel, the worker manager's domain access returns
    // undefined for every domain. This is the StubWorkerDomainAccess
    // failure mode from Bug 1.
    const beforeCtx = (workerManager as unknown as {
      createContext: (id: string, signal: AbortSignal) => {
        domains: { getDomainAPI: <T>(d: string) => T | undefined };
      };
    }).createContext('test-pre', new AbortController().signal);
    expect(beforeCtx.domains.getDomainAPI('learning-optimization')).toBeUndefined();

    // Now call handleFleetInit — this is the seam where the wiring must happen.
    const result = await handleFleetInit({
      memoryBackend: 'memory',
      maxAgents: 2,
      lazyLoading: false, // load every plugin so domain APIs resolve
    });
    expect(result.success).toBe(true);

    // Post-init: the worker manager must resolve a real domain API.
    const afterCtx = (workerManager as unknown as {
      createContext: (id: string, signal: AbortSignal) => {
        domains: { getDomainAPI: <T>(d: string) => T | undefined };
      };
    }).createContext('test-post', new AbortController().signal);

    const learningAPI = afterCtx.domains.getDomainAPI('learning-optimization');
    expect(learningAPI).toBeDefined();
  });

  it('shares the kernel memory instance with workers (Bug 4b)', async () => {
    // Pre-init the daemon and grab its initial memory.
    const daemon = getDaemon();
    const workerManager = daemon.getWorkerManager();

    // Initialise the fleet.
    const result = await handleFleetInit({
      memoryBackend: 'memory',
      maxAgents: 2,
      lazyLoading: false,
    });
    expect(result.success).toBe(true);

    // After init, the worker manager's memory must be the kernel's memory.
    // If they diverge, anything a worker writes (e.g. learning:loop-health)
    // never lands in the kv the dashboard reads from.
    const kernelMemory = getFleetState().kernel?.memory;
    expect(kernelMemory).toBeDefined();

    const afterCtx = (workerManager as unknown as {
      createContext: (id: string, signal: AbortSignal) => {
        memory: unknown;
      };
    }).createContext('test-mem', new AbortController().signal);

    expect(afterCtx.memory).toBe(kernelMemory);
  });

  it('still surfaces a domain API after a second fleet_init (idempotency guard)', async () => {
    const daemon = getDaemon();
    const workerManager = daemon.getWorkerManager();

    const first = await handleFleetInit({
      memoryBackend: 'memory',
      maxAgents: 2,
      lazyLoading: false,
    });
    expect(first.success).toBe(true);

    // Second call — handleFleetInit early-returns when already initialized.
    // The wiring established by the first call must survive.
    const second = await handleFleetInit({
      memoryBackend: 'memory',
      maxAgents: 2,
      lazyLoading: false,
    });
    expect(second.success).toBe(true);

    const ctx = (workerManager as unknown as {
      createContext: (id: string, signal: AbortSignal) => {
        domains: { getDomainAPI: <T>(d: string) => T | undefined };
      };
    }).createContext('test-second', new AbortController().signal);

    expect(ctx.domains.getDomainAPI('learning-optimization')).toBeDefined();
  });
});
