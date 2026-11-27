/**
 * Lifecycle of the agent-browser sessions an accessibility audit opens (#1465).
 *
 * Each audit runs in its own session named `aqe-a11y-<pid>-<uuid>`, where pid
 * is this process. An agent-browser daemon outlives the process that started
 * it and carries its session name only in its environment, so:
 *
 *  - every live audit session is kept in a process-level registry, and the
 *    MCP shutdown path closes them all (`closeLiveAuditSessions`), with a
 *    synchronous best-effort kill on process 'exit' (`killLiveAuditSessionsSync`);
 *  - a process killed outright (SIGKILL) leaves its sessions behind, so the
 *    next audit in any process reaps `aqe-a11y-<pid>-*` sessions whose pid is
 *    dead (`reapOrphanedAuditSessions`).
 *
 * Sessions without the aqe-a11y- prefix, and sessions whose owner pid is
 * alive, are never touched.
 */

import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { runAgentBrowser } from './command-executor.js';
import { safeJsonParse } from '../../../shared/safe-json.js';

export const AUDIT_SESSION_PREFIX = 'aqe-a11y-';
const OWNED_SESSION = /^aqe-a11y-(\d+)-[0-9a-f-]{36}$/;
const CLOSE_TIMEOUT_MS = 1500;
const LIST_TIMEOUT_MS = 5000;
/** Reaping lists sessions through npx, so it runs at most this often per process. */
const REAP_INTERVAL_MS = 60_000;

const liveSessions = new Set<string>();
let lastReap = 0;

/** A new audit session name owned by this process. */
export function newAuditSessionName(pid: number = process.pid): string {
  return `${AUDIT_SESSION_PREFIX}${pid}-${randomUUID()}`;
}

/** The pid that owns an audit session, or null for any other session name. */
export function auditSessionOwner(name: string): number | null {
  const match = OWNED_SESSION.exec(name);
  return match ? Number(match[1]) : null;
}

export function registerAuditSession(name: string): void {
  if (name.startsWith(AUDIT_SESSION_PREFIX)) liveSessions.add(name);
}

export function unregisterAuditSession(name: string): void {
  liveSessions.delete(name);
}

export function liveAuditSessions(): string[] {
  return [...liveSessions];
}

/** True when a process with this pid exists (EPERM means it exists but is not ours). */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Ask a session's daemon to close its browser and exit. Never throws.
 * Returns true when the close command completed, false when it failed or
 * timed out (the daemon may still be running).
 */
export async function closeAuditSession(name: string, timeoutMs = CLOSE_TIMEOUT_MS): Promise<boolean> {
  if (!name.startsWith(AUDIT_SESSION_PREFIX)) return false;
  try {
    await runAgentBrowser(['--session', name, 'close'], timeoutMs);
    return true;
  } catch {
    // best effort: the daemon may already be gone, or the close timed out
    return false;
  }
}

/** Close every live audit session in parallel, each bounded by `timeoutMs`. */
export async function closeLiveAuditSessions(timeoutMs = CLOSE_TIMEOUT_MS): Promise<string[]> {
  const names = liveAuditSessions();
  const closed = await Promise.all(names.map((name) => closeAuditSession(name, timeoutMs)));
  // Keep a session registered when its close failed or timed out, so the
  // synchronous exit fallback (killLiveAuditSessionsSync) still reaches its daemon.
  names.forEach((name, i) => { if (closed[i]) liveSessions.delete(name); });
  return names;
}

/**
 * Linux only: pids of agent-browser daemons whose AGENT_BROWSER_SESSION is one
 * of `names`. Elsewhere returns an empty list (sessions are then closed by the
 * async shutdown path or reaped by the next audit).
 */
export function findDaemonPids(names: Iterable<string>, procDir = '/proc'): number[] {
  const wanted = new Set(names);
  if (wanted.size === 0 || process.platform !== 'linux') return [];
  const pids: number[] = [];
  let entries: string[];
  try {
    entries = readdirSync(procDir);
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const environ = readFileSync(`${procDir}/${entry}/environ`, 'utf8').split('\0');
      const session = environ.find((v) => v.startsWith('AGENT_BROWSER_SESSION='))?.slice('AGENT_BROWSER_SESSION='.length);
      if (session && wanted.has(session)) pids.push(Number(entry));
    } catch {
      // not readable (another user's process, or it just exited)
    }
  }
  return pids;
}

/**
 * Synchronous last resort for process 'exit': SIGTERM the daemons of any audit
 * session still registered. A SIGTERMed daemon closes its browser.
 */
export function killLiveAuditSessionsSync(): void {
  try {
    for (const pid of findDaemonPids(liveSessions)) {
      try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
    }
  } catch {
    // never throw from an exit handler
  }
  liveSessions.clear();
}

/** Active agent-browser session names, from `agent-browser --json session list`. */
export async function listAgentBrowserSessions(): Promise<string[]> {
  const result = await runAgentBrowser(['--json', 'session', 'list'], LIST_TIMEOUT_MS);
  try {
    const parsed = safeJsonParse(String(result.stdout ?? '')) as { data?: { sessions?: unknown } };
    const sessions = parsed?.data?.sessions;
    return Array.isArray(sessions) ? sessions.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Close audit sessions left behind by a process that no longer exists.
 * Throttled per process unless `force` is set. Returns the sessions closed.
 */
export async function reapOrphanedAuditSessions(options: {
  force?: boolean;
  list?: () => Promise<string[]>;
  close?: (name: string) => Promise<void>;
  alive?: (pid: number) => boolean;
} = {}): Promise<string[]> {
  const now = Date.now();
  if (!options.force && now - lastReap < REAP_INTERVAL_MS) return [];
  lastReap = now;
  const list = options.list ?? listAgentBrowserSessions;
  const close = options.close ?? closeAuditSession;
  const alive = options.alive ?? isPidAlive;
  try {
    const orphans = (await list()).filter((name) => {
      const owner = auditSessionOwner(name);
      return owner !== null && owner !== process.pid && !alive(owner);
    });
    await Promise.all(orphans.map((name) => close(name)));
    return orphans;
  } catch {
    return [];
  }
}
