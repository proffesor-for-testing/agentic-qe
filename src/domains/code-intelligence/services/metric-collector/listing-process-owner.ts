/**
 * Own detached listing subprocesses until completion or caller termination.
 * Normal attempt completion removes the handlers; interrupted callers must
 * synchronously kill every owned group before deleting listing artifacts.
 */
import { rmSync } from 'node:fs';

type Owner = { directory: string; stopTree: () => void };
const owners = new Set<Owner>();
const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
type OwnedSignal = typeof signals[number];

function removeHandlers(): void {
  process.removeListener('exit', cleanup);
  for (const signal of signals) process.removeListener(signal, signalHandlers[signal]);
}

function cleanup(): void {
  const pending = [...owners];
  owners.clear();
  for (const owner of pending) {
    try { owner.stopTree(); } catch { /* Continue terminating other owned trees. */ }
  }
  for (const directory of new Set(pending.map(owner => owner.directory))) {
    try { rmSync(directory, { recursive: true, force: true }); } catch { /* Best effort during exit. */ }
  }
}

function interrupted(signal: OwnedSignal): void {
  cleanup();
  removeHandlers();
  // Restore signal termination (including its exit status) instead of swallowing
  // Ctrl-C or converting a requested shutdown into a successful metrics result.
  process.kill(process.pid, signal);
}

const signalHandlers: Record<OwnedSignal, () => void> = {
  SIGINT: () => interrupted('SIGINT'),
  SIGTERM: () => interrupted('SIGTERM'),
  SIGHUP: () => interrupted('SIGHUP'),
};

/** Register a process-tree owner, returning an idempotent release callback. */
export function ownListingProcess(directory: string, stopTree: () => void): () => void {
  if (owners.size === 0) {
    process.once('exit', cleanup);
    for (const signal of signals) process.on(signal, signalHandlers[signal]);
  }
  const owner = { directory, stopTree };
  owners.add(owner);
  return () => {
    owners.delete(owner);
    if (owners.size === 0) removeHandlers();
  };
}
