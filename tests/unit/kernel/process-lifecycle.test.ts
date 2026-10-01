/**
 * #801: kernel signal handlers must not process.exit() underneath a claimed
 * lifecycle owner (the MCP server), and must keep their exit behaviour when
 * no owner is claimed (every non-MCP CLI command).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  claimProcessLifecycle,
  getProcessLifecycleOwner,
  releaseProcessLifecycle,
  requestOwnedShutdown,
} from '../../../src/kernel/process-lifecycle.js';

afterEach(() => {
  releaseProcessLifecycle();
  vi.restoreAllMocks();
});

describe('process lifecycle ownership', () => {
  it('reports no owner and declines requests when none is claimed', () => {
    expect(getProcessLifecycleOwner()).toBeUndefined();
    expect(requestOwnedShutdown('SIGTERM')).toBe(false);
  });

  it('routes every request to the claimed owner', () => {
    const shutdown = vi.fn();
    claimProcessLifecycle({ name: 'test', shutdown });
    expect(requestOwnedShutdown('SIGTERM')).toBe(true);
    expect(requestOwnedShutdown('jsonrpc-shutdown')).toBe(true);
    expect(shutdown.mock.calls).toEqual([['SIGTERM'], ['jsonrpc-shutdown']]);
  });

  it('is shared across module copies through the global registry symbol', () => {
    const owner = { name: 'other-bundle', shutdown: vi.fn() };
    (globalThis as Record<symbol, unknown>)[Symbol.for('agentic-qe.process-lifecycle-owner')] = owner;
    expect(getProcessLifecycleOwner()).toBe(owner);
  });

  it('lets the caller exit when the owner throws', () => {
    claimProcessLifecycle({ name: 'broken', shutdown: () => { throw new Error('boom'); } });
    expect(requestOwnedShutdown('SIGINT')).toBe(false);
  });

  it('releases only the matching owner', () => {
    const owner = { name: 'a', shutdown: vi.fn() };
    claimProcessLifecycle(owner);
    releaseProcessLifecycle({ name: 'b', shutdown: vi.fn() });
    expect(getProcessLifecycleOwner()).toBe(owner);
    releaseProcessLifecycle(owner);
    expect(getProcessLifecycleOwner()).toBeUndefined();
  });
});

describe.each([
  ['unified-memory', () => import('../../../src/kernel/unified-memory.js')],
  ['unified-persistence', () => import('../../../src/kernel/unified-persistence.js')],
])('%s signal handlers', (_name, load) => {
  /** Load a fresh module copy, capturing its handlers instead of installing them. */
  async function captureHandlers(): Promise<Map<string, Array<(...args: unknown[]) => void>>> {
    vi.resetModules();
    const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    vi.spyOn(process, 'on').mockImplementation(((event: string, fn: (...args: unknown[]) => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), fn]);
      return process;
    }) as typeof process.on);
    await load();
    vi.mocked(process.on).mockRestore();
    return handlers;
  }

  it.each(['SIGTERM', 'SIGINT'] as const)('exits on %s when no owner is claimed', async (signal) => {
    const handlers = await captureHandlers();
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    for (const fn of handlers.get(signal) ?? []) fn(signal);
    expect(handlers.get(signal)?.length).toBeGreaterThan(0);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it.each(['SIGTERM', 'SIGINT'] as const)('defers %s to a claimed owner and closes at exit', async (signal) => {
    const handlers = await captureHandlers();
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const once = vi.spyOn(process, 'once').mockImplementation((() => process) as typeof process.once);
    const shutdown = vi.fn();
    claimProcessLifecycle({ name: 'mcp', shutdown });
    for (const fn of handlers.get(signal) ?? []) fn(signal);
    expect(exit).not.toHaveBeenCalled();
    expect(shutdown).toHaveBeenCalledWith(signal);
    expect(once).toHaveBeenCalledWith('exit', expect.any(Function));
  });
});
