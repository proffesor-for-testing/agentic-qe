/**
 * RVF store integrity helpers (issue #563).
 *
 * An export that is killed mid-write leaves a store that was created but never
 * completed. Such a file cannot be opened (`RVF error 0x0106: ManifestNotFound`)
 * and cannot be created over either, because the path already exists
 * (`RVF error 0x0303: FsyncFailed`). Both paths fail forever, so the RVF
 * backend stays disabled for the life of the project until someone deletes the
 * file by hand.
 *
 * Recovery has to be evidence-based rather than fingerprint-based. Measured
 * against @ruvector/rvf-node 0.1.8:
 *
 *   • A *valid, empty* store is 162 bytes with magic `SFVR` — byte-for-byte
 *     the size the issue reports as "truncated: header only". Size and magic
 *     therefore cannot distinguish a broken store from a healthy empty one.
 *   • `<store>.lock` is a 104-byte record with magic `FLVR` and the owning pid
 *     as a little-endian u32 at offset 4. `FLVR` in a lock is the *normal*
 *     case — the issue reads it as "RVF store bytes leaked into the lock", but
 *     the store magic is `SFVR`; a 104-byte `FLVR` lock is just a live-or-stale
 *     lock record.
 *
 * So the only sound trigger is "open failed *and* create failed": at that point
 * the file is provably unusable. The lock's pid is used as a *guard* — if it is
 * held by a live process, the store is presumed healthy and left alone.
 */

import { existsSync, openSync, readSync, closeSync, renameSync, unlinkSync } from 'fs';

/** Magic of a lock record (the store's own magic is `SFVR`). */
const LOCK_MAGIC = 'FLVR';

/** Byte offset of the owning pid within a lock record (u32 LE). */
const LOCK_PID_OFFSET = 4;

/** Sidecars that belong to a store and must be quarantined alongside it. */
const STORE_SIDECAR_SUFFIXES = ['', '.idmap.json', '.manifest.json'] as const;

/** Read the first `n` bytes of a file, or null if unreadable/shorter. */
function readHead(path: string, n: number): Buffer | null {
  let fd: number | undefined;
  try {
    fd = openSync(path, 'r');
    const buf = Buffer.alloc(n);
    if (readSync(fd, buf, 0, n, 0) < n) return null;
    return buf;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* best-effort */ }
    }
  }
}

/** True when a process with `pid` exists (signal 0 probes without delivering). */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means it exists but belongs to another user — still alive.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** The pid recorded in `<rvfPath>.lock`, or null if there is no readable lock. */
export function readLockOwnerPid(rvfPath: string): number | null {
  const head = readHead(`${rvfPath}.lock`, LOCK_PID_OFFSET + 4);
  if (!head || head.subarray(0, 4).toString('latin1') !== LOCK_MAGIC) return null;
  const pid = head.readUInt32LE(LOCK_PID_OFFSET);
  return pid > 0 ? pid : null;
}

/**
 * True when the store's lock is held by a process that is still running.
 *
 * Deliberately conservative: an unreadable or pid-less lock reports false (the
 * caller's open already failed, so there is nothing to protect), while a live
 * pid reports true and blocks recovery. Pid reuse can only produce a false
 * "alive", which fails safe — we leave the store alone.
 */
export function isLockHeldByLiveProcess(rvfPath: string): boolean {
  const pid = readLockOwnerPid(rvfPath);
  if (pid === null) return false;
  // A same-PID lock can belong to another adapter initialized through a
  // different in-process path. PID equality does not prove that handle was
  // closed, and breaking the lock can quarantine/replace a store that this
  // process still has open. Treat every live owner conservatively.
  return isPidAlive(pid);
}

/**
 * Move an unusable store and its sidecars aside so the next create succeeds.
 * Returns the quarantine base path, or null if nothing was quarantined.
 *
 * Only call this once open *and* create have both failed — that is the proof
 * the file is unusable. The store is a derived cache, rebuilt from the unified
 * DB, so quarantining is recoverable; we move rather than delete because the
 * bytes may hold writes that never reached SQLite, and they are the only
 * evidence if this recurs.
 */
export function quarantineUnusableStore(rvfPath: string, reason: string): string | null {
  if (!existsSync(rvfPath)) return null;

  // Never pull a store out from under a live peer.
  if (isLockHeldByLiveProcess(rvfPath)) {
    console.warn(
      `[RVF] ${rvfPath} is unusable but its lock is held by a live process — ` +
        'leaving it alone and degrading to SQLite for this run.',
    );
    return null;
  }

  // Keyed by pid, not a timestamp: a crash-loop quarantining the same file
  // repeatedly overwrites its own copy instead of filling .agentic-qe/ with
  // one corrupt store per startup.
  const quarantineBase = `${rvfPath}.corrupt-${process.pid}`;

  for (const sidecar of STORE_SIDECAR_SUFFIXES) {
    const from = `${rvfPath}${sidecar}`;
    if (!existsSync(from)) continue;
    try {
      renameSync(from, `${quarantineBase}${sidecar}`);
    } catch {
      // A failed quarantine must not throw and take down the caller; the
      // caller's retry will simply fail again and degrade as before.
    }
  }

  // The store is gone, so its lock — stale by definition here — goes with it.
  try {
    if (existsSync(`${rvfPath}.lock`)) unlinkSync(`${rvfPath}.lock`);
  } catch {
    // best-effort
  }

  console.warn(
    `[RVF] Quarantined unusable store ${rvfPath} → ${quarantineBase} (${reason}). ` +
      'It is a derived cache and will be rebuilt from the unified DB. ' +
      'Please report a recurrence with the quarantined files (issue #563).',
  );

  return quarantineBase;
}
