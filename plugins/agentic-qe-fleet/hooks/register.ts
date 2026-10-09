import type { Hook, Register } from 'claude-code'

import { answer, type DataFile } from './command'
import { isGuarded, judge } from './guard'
import { readOptions, type GuardMode } from './options'
import { MOD_NAME, newStats, segmentText, STATUS_PATH, statusText, type Stats } from './status'

type Dollar = Parameters<Hook<'session.start'>>[0]

/** One session of the mod: its mode, its counters, the project root, the segment last drawn. */
type Session = { readonly mode: GuardMode; readonly stats: Stats; root?: string; segment?: string }

/** Writes the console's status file; a failure only costs the console a row. */
async function flush($: Dollar, s: Session): Promise<void> {
  if (s.root === undefined) return
  try {
    await $.fs.write(`${s.root}/${STATUS_PATH}`, statusText(s.stats, s.mode, await $.clock.now()))
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
  const s: Session = { mode: readOptions(options).mode, stats: newStats() }

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
    const refusal = judge(e.tool, e)
    if (refusal === undefined) return next(e)
    s.stats.lastDenied = refusal.cls
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
    // A guard that failed refuses only what its own pure check refuses; everything else goes on.
    if (next.called) return next(e)
    if (s.mode !== 'enforce' || !isGuarded(e.tool)) return next(e)
    try {
      const refusal = judge(e.tool, e)
      return refusal === undefined ? next(e) : { deny: refusal.reason }
    } catch {
      return { deny: 'aqe-mod: the learning-data guard failed on this call, so it was refused.' }
    }
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await flush($, s)
    return result
  })

  /** `/aqe-mod`, answered here: read-only verbs, no model turn. */
  on('command.run', { command: 'aqe-mod' }, async ($, e) => {
    const args = typeof e.args === 'string' ? e.args : ''
    const text = await answer(args, {
      mode: s.mode,
      stats: s.stats,
      tools: async () => (await $.tool.list()).map(t => t.name),
      aqeDir: () => aqeDir($, s.root),
    })
    await flush($, s)
    return { text }
  })
}
