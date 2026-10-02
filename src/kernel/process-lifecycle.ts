/**
 * Agentic QE v3 - Process lifecycle ownership (#801)
 *
 * A long-running entry point (the MCP server) owns process shutdown: before it
 * exits it must drain in-flight work and release native handles. The shared
 * patterns RVF adapter, for example, holds a `patterns.rvf.lock` marker that
 * only its own close() removes.
 *
 * Module-level signal handlers elsewhere (the kernel stores, the CLI wrapper)
 * used to call `process.exit(0)` synchronously. Node runs signal listeners one
 * after another in the same tick, so that exit pre-empted the owner's async
 * graceful shutdown and leaked the marker. Those handlers now route the
 * request to the claimed owner and do not exit themselves.
 *
 * With no owner claimed (every non-MCP CLI command), nothing changes and
 * callers keep their own exit behaviour.
 *
 * The owner lives on `globalThis` under a registry symbol because `aqe mcp`
 * loads the MCP bundle into the CLI bundle's process. Each bundle has its own
 * copy of this module, and both copies must see the same owner.
 */

const OWNER_KEY = Symbol.for('agentic-qe.process-lifecycle-owner');

export interface ProcessLifecycleOwner {
  /** Diagnostic name, e.g. `mcp`. */
  readonly name: string;
  /**
   * Start the owner's graceful shutdown. Must be idempotent, must not throw,
   * and must eventually exit the process (e.g. guarded by a watchdog). Before
   * exiting, on every path, it must call `closeRegisteredStores()`.
   */
  shutdown(reason: string): void;
}

const CLOSERS_KEY = Symbol.for('agentic-qe.process-lifecycle-store-closers');

type GlobalWithOwner = typeof globalThis & {
  [OWNER_KEY]?: ProcessLifecycleOwner;
  [CLOSERS_KEY]?: Array<() => void>;
};

function closers(): Array<() => void> {
  const g = globalThis as GlobalWithOwner;
  return (g[CLOSERS_KEY] ??= []);
}

/**
 * Register a synchronous, idempotent close for a process-wide store (the
 * kernel's unified memory/persistence singletons). A claimed owner closes
 * every registered store at the end of its shutdown, so stores are closed on
 * every termination path, not only the signal ones. Returns an unregister
 * function. Shared across bundle copies through the registry symbol.
 */
export function registerStoreCloser(close: () => void): () => void {
  closers().push(close);
  return () => {
    const list = closers();
    const at = list.indexOf(close);
    if (at >= 0) list.splice(at, 1);
  };
}

/**
 * Close every registered store, most recently registered first (a facade is
 * registered after the store it wraps, so it closes first). Synchronous so it
 * also works from a process 'exit' listener; never throws. Closers must be
 * idempotent: this may run from both the shutdown and an exit backstop.
 */
export function closeRegisteredStores(): void {
  for (const close of [...closers()].reverse()) {
    try { close(); } catch { /* best effort: keep closing the rest */ }
  }
}

/** Make `owner` responsible for every graceful shutdown in this process. */
export function claimProcessLifecycle(owner: ProcessLifecycleOwner): void {
  (globalThis as GlobalWithOwner)[OWNER_KEY] = owner;
}

/** Remove the current owner (only if it is still `owner`, when given). Test seam. */
export function releaseProcessLifecycle(owner?: ProcessLifecycleOwner): void {
  const g = globalThis as GlobalWithOwner;
  if (!owner || g[OWNER_KEY] === owner) delete g[OWNER_KEY];
}

export function getProcessLifecycleOwner(): ProcessLifecycleOwner | undefined {
  return (globalThis as GlobalWithOwner)[OWNER_KEY];
}

/**
 * Hand a termination request to the claimed owner.
 *
 * Returns true when an owner accepted it: the caller must then NOT exit the
 * process itself. Returns false when no owner is claimed: the caller keeps its
 * own behaviour.
 */
export function requestOwnedShutdown(reason: string): boolean {
  const owner = getProcessLifecycleOwner();
  if (!owner) return false;
  try {
    owner.shutdown(reason);
    return true;
  } catch {
    // A broken owner must not leave the process running: let the caller exit.
    return false;
  }
}
