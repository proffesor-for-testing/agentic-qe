import type { Hook, Register } from 'claude-code'

import { answer, type DataFile } from './command'
import { fallbackVerdict, isGuarded, judge, SUFFIX } from './guard'
import { readOptions, type GuardMode } from './options'
import { cleanReason, type Counts, countsOf, mergeSaved, MOD_NAME, newStats, noSaved, parseSaved, type Saved, segmentText, STATUS_DIR, STATUS_PATH, statusText, type Stats, toolName, ZERO } from './status'

type Dollar = Parameters<Hook<'session.start'>>[0]

/** The status file and the folders above it under the project root, outermost first. */
const PARTS: readonly (readonly [string, 'dir' | 'file'])[] = [
  ['.claude-flow', 'dir'],
  [STATUS_DIR, 'dir'],
  [STATUS_PATH, 'file'],
]

const missing = (err: unknown): boolean => /ENOENT|no such file|not found|does not exist/i.test(String((err as { message?: unknown })?.message ?? err))

/**
 * Why the status file must not be touched, or undefined when it may be: a
 * symbolic link anywhere from `.claude-flow` down, or something other than a
 * folder or a regular file where one is expected. A missing part is fine (the
 * write creates it); a part that cannot be checked is not. Never follows a
 * link, never removes one.
 *
 * `$.fs` has no no-follow write or rename, so a link swapped in between this
 * check and the read or write that follows is not caught (a short window).
 */
async function statusBlocked($: Dollar, root: string): Promise<string | undefined> {
  for (const [rel, kind] of PARTS) {
    let st: { kind: string; isLink: boolean }
    try {
      st = await $.fs.stat(`${root}/${rel}`)
    } catch (err) {
      if (missing(err)) continue // not there yet: the write creates it; the parts below are still checked
      return `${rel} could not be checked`
    }
    if (st.isLink) return `${rel} is a symbolic link (never followed)`
    if (st.kind !== kind) return `${rel} is not a ${kind === 'dir' ? 'folder' : 'regular file'}`
  }
  return undefined
}

/** What the status file carries across sessions, or null when it is missing, unreadable or unsafe to read. */
async function readSaved($: Dollar, root: string, nowMs: number): Promise<Saved | null> {
  try {
    if ((await statusBlocked($, root)) !== undefined) return null
    return parseSaved(await $.fs.read(`${root}/${STATUS_PATH}`), nowMs)
  } catch {
    return null
  }
}

/** Writes the status file unless it is unsafe; returns why it was not written, or undefined when it was. */
async function writeStatus($: Dollar, root: string, text: string): Promise<string | undefined> {
  const blocked = await statusBlocked($, root)
  if (blocked !== undefined) return blocked
  await $.fs.write(`${root}/${STATUS_PATH}`, text)
  return undefined
}

/**
 * One session of the mod: its mode, its counters, the project root, the segment last drawn,
 * the cross-session totals as last written (`saved`) and the session counts already in them (`written`).
 */
type Session = { readonly mode: GuardMode; readonly stats: Stats; root?: string; segment?: string; saved: Saved; written: Counts; unavailable?: string }

/**
 * Writes the console's status file; a failure only costs the console a row. The totals are
 * re-read first, so sessions running side by side add to them rather than overwrite each other;
 * a missing or corrupt file falls back to what this session last wrote (zero at the start).
 * A status file reached through a symbolic link is neither read nor written (statusfile.ts).
 */
async function flush($: Dollar, s: Session): Promise<void> {
  if (s.root === undefined) return
  try {
    const now = await $.clock.now()
    const saved = mergeSaved((await readSaved($, s.root, now)) ?? s.saved, s.stats, s.written)
    s.unavailable = await writeStatus($, s.root, statusText(s.stats, s.mode, now, saved))
    if (s.unavailable === undefined) {
      s.saved = saved
      s.written = countsOf(s.stats)
    }
  } catch {
    /* the status file is a courtesy */
  }
  const text = segmentText(s.stats, s.mode)
  if (text === s.segment) return
  try {
    await $.ruflo.segment({ id: 'aqe', text })
    s.segment = text
  } catch {
    /* ruflo-mods is not seated: no status-bar segment */
  }
}

async function aqeDir($: Dollar, root: string | undefined): Promise<readonly DataFile[] | null> {
  if (root === undefined) return null
  const dir = `${root}/.agentic-qe`
  if (!(await $.fs.exists(dir))) return null
  return (await $.fs.list(dir)).filter(f => f.kind === 'file').map(f => ({ name: f.name, size: f.size, mtimeMs: f.mtimeMs }))
}

/**
 * agentic-qe as a mod (aqe-mod): a tighten-only guard for AQE's irreplaceable
 * learning data, `/aqe-mod`, and the status file the ruflo console reads.
 * Everything goes through `$`; no network, no process, no MCP calls.
 */
export const register: Register = (on, options) => {
  const s: Session = { mode: readOptions(options).mode, stats: newStats(), saved: noSaved(), written: { ...ZERO } }

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    try {
      s.root = (await $.session.root()) as string | undefined
      s.stats.startedMs = await $.clock.now()
    } catch {
      /* no root: no status file, the guard still runs */
    }
    try {
      await $.command.register({ name: MOD_NAME, description: 'AQE mod: status, check <command>, fleet, gate' })
    } catch {
      /* a name taken by another plugin must not stop the guard */
    }
    await flush($, s)
    return result
  })

  // Tighten-only: a deny or the event unchanged; never a rewrite, never an allow over another hook.
  on('tool.call', async ($, e, next) => {
    if (s.mode === 'off' || !isGuarded(e.tool)) return next(e)
    s.stats.calls++
    const refusal = judge(e.tool, e, { root: s.root })
    if (refusal === undefined) return next(e)
    s.stats.lastDenied = refusal.cls
    try {
      // The reason, cut short and without its fixed advice; never the command (#924).
      const outcome = s.mode === 'enforce' ? 'blocked' : 'flagged'
      s.stats.lastRefusal = { atMs: await $.clock.now(), tool: toolName(e.tool), outcome, reason: cleanReason(refusal.reason, SUFFIX) }
    } catch {
      /* no clock: the counters still move */
    }
    if (s.mode === 'enforce') {
      s.stats.blocked++
      await flush($, s)
      return { deny: refusal.reason }
    }
    s.stats.flagged++
    try {
      $.ui.toast('aqe-mod (notify): this call would delete or overwrite .agentic-qe learning data')
    } catch {
      /* a refused toast changes nothing */
    }
    await flush($, s)
    return next(e)
  }).catch(($, e, next) => {
    // Fail closed: a guard that threw or overran refuses the call; a re-entry beneath its own
    // `$` call is judged once (see fallbackVerdict).
    const verdict = fallbackVerdict(s.mode, e.tool, e, next.called, next.error.kind, { root: s.root })
    return verdict ?? next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await flush($, s)
    return result
  })

  /** `/aqe-mod`, answered here: read-only verbs, no model turn. */
  on('command.run', { command: 'aqe-mod' }, async ($, e) => {
    const args = typeof e.args === 'string' ? e.args : ''
    await flush($, s)
    const text = await answer(args, {
      mode: s.mode,
      stats: s.stats,
      saved: mergeSaved(s.saved, s.stats, s.written),
      unavailable: s.unavailable,
      tools: async () => (await $.tool.list()).map(t => t.name),
      aqeDir: () => aqeDir($, s.root),
      root: s.root,
    })
    return { text }
  })
}
