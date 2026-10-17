/**
 * Test helper for the measured-only worker tests (#1028, #1043): a namespaced
 * kv store shaped like the kernel memory the daemon hands workers after
 * `fleet_init` (`get`/`set`/`search` with an optional namespace).
 */
import { vi } from 'vitest';
import type { WorkerContext } from '../../../../src/workers/interfaces';

export const DEFAULT_NS = 'qe-kernel';

export function namespacedStore() {
  const rows = new Map<string, unknown>();
  const k = (key: string, ns?: string) => `${ns ?? DEFAULT_NS}\u0000${key}`;
  const globToRegExp = (pattern: string) =>
    new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
  const memory = {
    get: vi.fn(async (key: string, options?: { namespace?: string }) => rows.get(k(key, options?.namespace))),
    set: vi.fn(async (key: string, value: unknown, options?: { namespace?: string }) => {
      rows.set(k(key, options?.namespace), JSON.parse(JSON.stringify(value)));
    }),
    delete: vi.fn(async (key: string, options?: { namespace?: string }) => rows.delete(k(key, options?.namespace))),
    search: vi.fn(async (pattern: string, limit?: number, options?: { namespace?: string }) => {
      const prefix = `${options?.namespace ?? DEFAULT_NS}\u0000`;
      const re = globToRegExp(pattern);
      return [...rows.keys()]
        .filter((key) => key.startsWith(prefix) && re.test(key.slice(prefix.length)))
        .map((key) => key.slice(prefix.length))
        .slice(0, limit ?? 100);
    }),
  };
  return {
    memory,
    read: (key: string, ns?: string) => rows.get(k(key, ns)),
    /** Keys the worker wrote (own namespace only). */
    writtenKeys: () => memory.set.mock.calls.map((c) => c[0] as string),
  };
}

export type NamespacedStore = ReturnType<typeof namespacedStore>;

export function contextFor(memory: NamespacedStore['memory']): WorkerContext {
  return {
    eventBus: { publish: vi.fn().mockResolvedValue(undefined) },
    memory,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    domains: {
      getDomainAPI: vi.fn().mockReturnValue({}),
      getDomainHealth: vi.fn().mockReturnValue({ status: 'healthy', errors: [] }),
    },
    signal: new AbortController().signal,
  } as unknown as WorkerContext;
}
