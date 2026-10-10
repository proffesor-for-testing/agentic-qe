/**
 * The learning-data guard: decides whether one tool call would destroy or
 * overwrite AQE's irreplaceable learning data (the CLAUDE.md "Data Protection"
 * rule, made mechanical).
 *
 * Pure and synchronous: no `$`, no I/O, no imports outside this folder, so it
 * runs unchanged in the sandbox, under `claude plugin test` and under vitest.
 *
 * Tighten-only by construction: `judge` returns a refusal reason or undefined.
 * It never rewrites a call and never allows something another hook refused.
 *
 * Reads and backups pass: `cp .agentic-qe/memory.db x.bak`, `sqlite3 ... "SELECT ..."`,
 * `PRAGMA integrity_check`, `.backup /tmp/x`, `ls`, `du`.
 *
 * The rules live by concern: shell.ts reads the command line, verbs.ts and
 * writers.ts judge each command, find.ts judges find, producers.ts decides what
 * substitutions and pipelines may yield, scripts.ts judges sqlite3 and
 * interpreter one-liners, powershell.ts the PowerShell tool, paths.ts says what
 * is learning data.
 */
import { expandVars, isData, textNamesData, WORD_BUDGET, type Ctx, type GuardScope } from './context'
import { protectedKind } from './paths'
import type { GuardMode } from './options'
import { judgePowerShell } from './powershell'
import { substitutionAlts } from './producers'
import { parse } from './shell'
import { judgeSegment } from './verbs'

export type { GuardScope } from './context'
export { segments, words } from './shell'

/** A refusal: the reason shown to the model, and the console's fixed class for it. */
export type Refusal = { readonly reason: string; readonly cls: 'destructive' }

/** The tools whose input the guard reads; every other tool passes untouched. */
export const GUARDED_TOOLS = ['Bash', 'Monitor', 'PowerShell', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'] as const

const PREFIX = 'aqe-mod refused this: '
const SUFFIX = ' AQE learning data (.agentic-qe/*.db, -wal, -shm, *.rvf) is irreplaceable. Back it up with `cp .agentic-qe/memory.db .agentic-qe/memory.db.bak-$(date +%s)` and ask the user to run this themselves, or set the plugin option guardMode to notify/off.'

const refuse = (what: string): Refusal => ({ reason: `${PREFIX}${what}.${SUFFIX}`, cls: 'destructive' })

const field = (input: unknown, key: string): string => {
  const v = typeof input === 'object' && input !== null ? (input as Record<string, unknown>)[key] : undefined
  return typeof v === 'string' ? v : ''
}

/** The longest shell command the guard reads (256 KiB); a longer one is refused unread. */
export const MAX_COMMAND = 256 * 1024

/** Nesting past this (`bash -c "bash -c ..."`) is refused when the line names learning data at all. */
const MAX_DEPTH = 6

/** Judges one shell command line under `ctx`; the recursion behind `bash -c`, `eval`, heredocs and `.shell`. */
function bashWhat(command: string, ctx: Ctx): string | undefined {
  if (command.trim() === '') return undefined
  // Past the depth the guard follows, the text is not read piecemeal: naming the store at all is enough.
  if (ctx.depth > MAX_DEPTH) return ctx.mentionsData || /agentic/i.test(command) || textNamesData(command, ctx) ? 'a command nested too deeply to read names learning data' : undefined
  // `shopt -s dotglob`/`GLOBIGNORE` make `*` match dot names: from here on, globs may reach `.agentic-qe`.
  if (/\bshopt\b|GLOBIGNORE/.test(command)) ctx.dotglob = true
  const segs = parse(command)
  if (!ctx.mentionsData)
    ctx.mentionsData = segs.some(s => s.words.some(w => isData(w, ctx)) || s.redirects.some(r => isData(r.target, ctx)) || (s.stdin !== '' && textNamesData(s.stdin, ctx)))
  // `done < <(find ...)`: what the process substitution prints is what `read` receives, earlier on the line.
  // `done <<< "$(find ...)"` or `done <<< "$dbs"`: a here-string feeds `read` the same way. The line's
  // earlier assignments (`dbs=$(find ...)`) are not bound yet here, so they are replayed, once, on a copy.
  const replay = segs.some(s => (s.hereStrings ?? []).length > 0) ? new Map(ctx.vars) : undefined
  for (const s of segs) {
    for (const w of replay === undefined ? [] : (s.hereStrings ?? [])) {
      const named = expandVars(w, replay as Map<string, readonly string[]>, WORD_BUDGET, inner => ctx.subst(inner, ctx)).filter(v => isData(v, ctx))
      if (named.length > 0) {
        ctx.readFed = [...new Set([...(ctx.readFed ?? []), ...named, '*'])]
        ctx.mentionsData = true
      }
    }
    if (replay !== undefined) for (const w of s.words) assignOn(replay, w, ctx)
    for (const r of s.redirects) {
      if (r.op !== '<' || !r.target.startsWith('<(')) continue
      const alts = ctx.subst(r.target.slice(2, r.target.endsWith(')') ? -1 : undefined), ctx)
      if (alts.length > 1) {
        ctx.readFed = alts
        ctx.mentionsData = true
      }
    }
  }
  const inner: Ctx = { ...ctx, depth: ctx.depth + 1 }
  for (const seg of segs) {
    const what = judgeSegment(seg, inner)
    // `cd`, variables and mentions inside a nested shell carry on in the line that holds it.
    ctx.inAqe = inner.inAqe
    ctx.mentionsData = ctx.mentionsData || inner.mentionsData
    ctx.dotglob = ctx.dotglob || inner.dotglob
    ctx.readFed = ctx.readFed ?? inner.readFed
    if (what !== undefined) return what
  }
  return undefined
}

/** Applies one `NAME=value` word to a variable map (the here-string replay). */
function assignOn(vars: Map<string, readonly string[]>, word: string, ctx: Ctx): void {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(word)
  if (m !== null) vars.set(m[1] as string, expandVars(m[2] as string, vars, WORD_BUDGET, inner => ctx.subst(inner, ctx)))
}

const newCtx = (scope: GuardScope | undefined): Ctx => ({
  inAqe: false,
  mentionsData: false,
  dotglob: false,
  root: scope?.root,
  vars: new Map(),
  depth: 0,
  bash: (command, ctx) => bashWhat(command, { ...ctx }),
  subst: cachedSubst(),
  readFed: undefined,
  pwsh: (command, ctx) => judgePowerShell(command, { ...ctx }),
})

/** `substitutionAlts`, remembered per inner text for one call (a word may repeat a substitution). */
function cachedSubst(): Ctx['subst'] {
  const seen = new Map<string, readonly string[]>()
  return (inner, ctx) => {
    const key = `${ctx.inAqe ? 1 : 0}${ctx.dotglob ? 1 : 0}${inner}`
    const hit = seen.get(key)
    if (hit !== undefined) return hit
    const alts = substitutionAlts(inner, ctx)
    seen.set(key, alts)
    return alts
  }
}

/** The refusal for one shell command line, or undefined to let it run. */
export function judgeBash(command: string, scope?: GuardScope): Refusal | undefined {
  const what = bashWhat(command, newCtx(scope))
  return what === undefined ? undefined : refuse(what)
}

/** The refusal for one PowerShell command line, or undefined. */
export function judgePwsh(command: string, scope?: GuardScope): Refusal | undefined {
  if (command.trim() === '') return undefined
  const what = judgePowerShell(command, newCtx(scope))
  return what === undefined ? undefined : refuse(what)
}

/** The refusal for a file tool writing to a learning-data file, or undefined. */
export function judgeFileTool(path: string): Refusal | undefined {
  const k = protectedKind(path)
  return k === 'file' || k === 'glob' ? refuse(`a file tool writes to ${path}`) : undefined
}

/** True for the tools the guard reads. */
export const isGuarded = (tool: string): boolean => (GUARDED_TOOLS as readonly string[]).includes(tool)

/**
 * The guard's verdict on one tool call (`input` the call's fields), or undefined to let it run.
 * `scope.root` (the project root) only widens what is refused (`find /root -name '*.db' -delete`);
 * every `.agentic-qe` path is protected with or without it.
 */
export function judge(tool: string, input: unknown, scope?: GuardScope): Refusal | undefined {
  if (tool === 'Bash' || tool === 'Monitor' || tool === 'PowerShell') {
    const command = field(input, 'command')
    // Past this size the reader's cost is no longer small and bounded: refuse rather than judge.
    if (command.length > MAX_COMMAND) return refuse(`a ${Math.round(command.length / 1024)} KiB command is too long for the guard to read`)
    return tool === 'PowerShell' ? judgePwsh(command, scope) : judgeBash(command, scope)
  }
  if (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit') return judgeFileTool(field(input, 'file_path'))
  if (tool === 'NotebookEdit') return judgeFileTool(field(input, 'notebook_path'))
  return undefined
}

/** The refusal the `.catch` handler gives when the guard's own check throws. */
export const GUARD_FAILED = 'aqe-mod: the learning-data guard failed on this call, so it was refused.'

/** Why the `tool.call` hook's `.catch` handler was asked (the engine's `next.error.kind`). */
export type FailureKind = 'throw' | 'timeout' | 're-entry'

/**
 * The `tool.call` hook's `.catch` decision, or undefined to run `next(e)`.
 * - `next` already ran (`called`): its settled result is replayed.
 * - The hook threw or overran its budget before deciding: in enforce mode the
 *   call is refused outright. The judge is not run again: whatever made it
 *   throw or run slow would do so twice.
 * - A re-entry (the call rose beneath the guard's own `$` call, so the hook did
 *   not run): enforce mode judges it once, and refuses it when that throws.
 * notify and off never refuse here.
 */
export function fallbackVerdict(
  mode: GuardMode,
  tool: string,
  input: unknown,
  called: boolean,
  kind: FailureKind,
  scope?: GuardScope,
): { readonly deny: string } | undefined {
  if (called || mode !== 'enforce' || !isGuarded(tool)) return undefined
  if (kind !== 're-entry') return { deny: GUARD_FAILED }
  try {
    const refusal = judge(tool, input, scope)
    return refusal === undefined ? undefined : { deny: refusal.reason }
  } catch {
    return { deny: GUARD_FAILED }
  }
}
