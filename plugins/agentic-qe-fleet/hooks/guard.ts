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
 * `PRAGMA integrity_check`, `.backup`, `ls`, `du`.
 */
import { baseName, DATA_FILE, globReachesData, protectedKind, underAqe } from './paths'

/** A refusal: the reason shown to the model, and the console's fixed class for it. */
export type Refusal = { readonly reason: string; readonly cls: 'destructive' }

/** The tools whose input the guard reads; every other tool passes untouched. */
export const GUARDED_TOOLS = ['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'] as const

const PREFIX = 'aqe-mod refused this: '
const SUFFIX = ' AQE learning data (.agentic-qe/*.db, -wal, -shm, *.rvf) is irreplaceable. Back it up with `cp .agentic-qe/memory.db .agentic-qe/memory.db.bak-$(date +%s)` and ask the user to run this themselves, or set the plugin option guardMode to notify/off.'

const refuse = (what: string): Refusal => ({ reason: `${PREFIX}${what}.${SUFFIX}`, cls: 'destructive' })

const field = (input: unknown, key: string): string => {
  const v = typeof input === 'object' && input !== null ? (input as Record<string, unknown>)[key] : undefined
  return typeof v === 'string' ? v : ''
}

/** Commands that take a command after them (their own options skipped). */
const WRAPPERS = new Set(['sudo', 'doas', 'env', 'command', 'exec', 'nohup', 'time', 'nice', 'ionice', 'stdbuf', 'builtin', 'xargs', 'timeout', 'chronic', 'unbuffer'])
/** Wrapper options that take a separate value (`sudo -u root rm ...`). */
const VALUED = new Set(['-u', '-g', '-C', '-D', '-h', '-p', '-U', '-r', '-t', '-n', '-I', '-L', '-P', '-s', '-k', '--signal', '--kill-after', '--user', '--group'])
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'eval'])
const DELETERS = new Set(['rm', 'unlink', 'shred', 'srm', 'trash', 'trash-put', 'gio', 'rmdir', 'wipe'])
const COPIERS = new Set(['cp', 'install', 'ln', 'rsync', 'scp'])
/** Every command word the guard judges. */
const KNOWN = new Set([...DELETERS, ...COPIERS, ...SHELLS, 'mv', 'truncate', 'dd', 'tee', 'find', 'git', 'cd', 'sqlite3'])
/** SQL that destroys rows or schema, and sqlite dot-commands that replace the file. */
const DESTRUCTIVE_SQL = /\b(drop\s+(table|index|view|trigger)|delete\s+from|truncate(\s+table)?\s+\w)|(^|[\s"';])\.(restore|drop)\b/i
/** In-language deletes and overwrites (node/python/perl one-liners). */
const CODE_DESTROY = /\b(unlinkSync|unlink|rmSync|rmdirSync|writeFileSync|truncateSync|os\.remove|os\.unlink|shutil\.rmtree|shutil\.move|Path\([^)]*\)\.unlink|File\.delete)\s*\(/i

const strip = (w: string) => w.replace(/^[({]+|[)};]+$/g, '').replace(/['"\\]/g, '')
const isOption = (w: string) => w.startsWith('-') && w !== '-'

/** Splits a command line into simple commands at `;`, `&&`, `||`, `|`, `&`, newlines, backticks and `$( )`. */
export function segments(command: string): string[] {
  return command
    .split(/\|\||&&|\$\(|[;|&\n`()]/)
    .map(s => s.trim())
    .filter(s => s !== '')
}

/** Whitespace-separated words of one simple command, quotes removed. */
export const words = (segment: string): string[] => segment.split(/\s+/).map(strip).filter(w => w !== '')

/** The command word's index, past assignments, wrappers and their options. */
function commandStart(ws: readonly string[], from = 0): number {
  let i = from
  while (i < ws.length) {
    const w = ws[i] as string
    const name = baseName(w)
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) i++
    else if (WRAPPERS.has(name)) {
      i++
      while (i < ws.length && (isOption(ws[i] as string) || /^\d+[smhd]?$/.test(ws[i] as string))) {
        // `sudo -n rm x`: a valued-looking flag followed by a verb the guard judges does not swallow the verb.
        const after = ws[i + 1]
        i += VALUED.has(ws[i] as string) && after !== undefined && !KNOWN.has(baseName(after)) ? 2 : 1
      }
    } else return i
  }
  return i
}

/** Redirect targets (`>`, `>>`, `>|`, `&>`) anywhere in the line. */
function redirectTargets(command: string): string[] {
  const out: string[] = []
  const re = />{1,2}\|?\s*(['"]?)([^\s'";|&<>()]+)\1/g
  for (let m = re.exec(command); m !== null; m = re.exec(command)) {
    const t = m[2] as string
    if (!t.startsWith('&')) out.push(t)
  }
  return out
}

type Ctx = { inAqe: boolean; mentionsData: boolean }

const isData = (w: string, ctx: Ctx) => protectedKind(w, ctx.inAqe) !== undefined
const isDataFileOrGlob = (w: string, ctx: Ctx) => {
  const k = protectedKind(w, ctx.inAqe)
  return k === 'file' || k === 'glob'
}

/** One simple command, from its command word on. */
function judgeSimple(ws: readonly string[], ctx: Ctx, viaXargs: boolean): string | undefined {
  const start = commandStart(ws)
  if (start >= ws.length) return undefined
  const verb = baseName(ws[start] as string)
  const args = ws.slice(start + 1)
  const operands = args.filter(a => !isOption(a))
  const piped = viaXargs || ws.slice(0, start).some(w => baseName(w) === 'xargs')

  if (verb === 'cd') {
    if (operands[0] !== undefined && underAqe(operands[0])) ctx.inAqe = true
    return undefined
  }

  if (SHELLS.has(verb)) {
    const c = args.indexOf('-c')
    const inner = verb === 'eval' ? args : c === -1 ? [] : args.slice(c + 1)
    return inner.length === 0 ? undefined : judgeSimple(inner, ctx, piped)
  }

  if (DELETERS.has(verb) || verb === 'truncate') {
    const hit = operands.find(a => (verb === 'truncate' ? isDataFileOrGlob(a, ctx) : isData(a, ctx)))
    if (hit !== undefined) return `\`${verb}\` on ${hit}`
    if (piped && ctx.mentionsData) return `\`xargs ${verb}\` fed learning-data paths`
    return undefined
  }

  if (verb === 'mv') {
    const dest = operands[operands.length - 1]
    const sources = operands.slice(0, -1)
    const moved = sources.find(a => isData(a, ctx))
    if (moved !== undefined) return `\`mv\` moves ${moved} away`
    if (dest !== undefined && overwrites(dest, sources, ctx)) return `\`mv\` overwrites ${dest}`
    if (piped && ctx.mentionsData) return '`xargs mv` fed learning-data paths'
    return undefined
  }

  if (COPIERS.has(verb)) {
    const dest = operands[operands.length - 1]
    if (dest === undefined) return undefined
    if (overwrites(dest, operands.slice(0, -1), ctx)) return `\`${verb}\` overwrites ${dest}`
    if (verb === 'rsync' && args.some(a => a.startsWith('--delete')) && underAqe(dest, ctx.inAqe)) return `\`rsync --delete\` into ${dest}`
    return undefined
  }

  if (verb === 'dd') {
    const of = args.find(a => a.startsWith('of=') && isDataFileOrGlob(a.slice(3), ctx))
    return of === undefined ? undefined : `\`dd ${of}\``
  }

  if (verb === 'tee') {
    const hit = operands.find(a => isDataFileOrGlob(a, ctx))
    return hit === undefined ? undefined : `\`tee\` overwrites ${hit}`
  }

  if (verb === 'find') return judgeFind(args, ctx)

  if (verb === 'git') return judgeGit(args, ctx)

  return undefined
}

/** Whether writing to `dest` replaces learning data: a data file or glob, or the directory with a data-named source. */
function overwrites(dest: string, sources: readonly string[], ctx: Ctx): boolean {
  const kind = protectedKind(dest, ctx.inAqe)
  if (kind === 'file' || kind === 'glob') return true
  return kind === 'dir' && sources.some(s => DATA_FILE.test(baseName(s)))
}

/** `find <under .agentic-qe> ... -delete` or `-exec rm`, unless every `-name` excludes data files. */
function judgeFind(args: readonly string[], ctx: Ctx): string | undefined {
  const roots = args.filter((a, i) => !isOption(a) && (i === 0 || !isOption(args[i - 1] as string)))
  if (!roots.some(r => underAqe(r, ctx.inAqe))) return undefined
  const execAt = args.findIndex(a => a === '-exec' || a === '-execdir' || a === '-ok' || a === '-okdir')
  const execVerb = execAt === -1 ? '' : baseName(args[execAt + 1] ?? '')
  const destroys = args.includes('-delete') || DELETERS.has(execVerb) || execVerb === 'truncate' || execVerb === 'mv' || execVerb === 'shred'
  if (!destroys) return undefined
  const names = args.flatMap((a, i) => (a === '-name' || a === '-iname' ? [args[i + 1] ?? '*'] : []))
  if (names.length > 0 && !names.some(globReachesData)) return undefined
  return '`find ... -delete/-exec` under .agentic-qe'
}

/** `git clean -x/-X` (deletes the ignored .agentic-qe) and `git checkout/restore/rm` on data files. */
function judgeGit(args: readonly string[], ctx: Ctx): string | undefined {
  const sub = args.find(a => !isOption(a))
  if (sub === 'clean') {
    const flags = args.filter(a => /^-[A-Za-z]+$/.test(a)).join('')
    const dry = flags.includes('n') || args.includes('--dry-run')
    const excluded = args.some((a, i) => (a === '-e' || a.startsWith('--exclude')) && /agentic-qe/i.test(a + (args[i + 1] ?? '')))
    if (/[xX]/.test(flags) && !dry && !excluded) return '`git clean -x` deletes the git-ignored .agentic-qe directory'
    return undefined
  }
  if (sub === 'checkout' || sub === 'restore' || sub === 'rm') {
    const hit = args.find(a => isData(a, ctx))
    return hit === undefined ? undefined : `\`git ${sub}\` on ${hit}`
  }
  return undefined
}

/** The refusal for one shell command line, or undefined to let it run. */
export function judgeBash(command: string): Refusal | undefined {
  if (command.trim() === '') return undefined
  const segs = segments(command)
  const allWords = segs.flatMap(words)
  const ctx: Ctx = { inAqe: false, mentionsData: false }

  // A first pass for `cd .agentic-qe` and for whether any learning-data path is named at all.
  for (const seg of segs) {
    const ws = words(seg)
    const s = commandStart(ws)
    if (baseName(ws[s] ?? '') === 'cd' && ws[s + 1] !== undefined && underAqe(ws[s + 1] as string)) ctx.inAqe = true
  }
  ctx.mentionsData = allWords.some(w => protectedKind(w, ctx.inAqe) !== undefined)
  const inAqeAnywhere = ctx.inAqe
  ctx.inAqe = false

  const redirect = redirectTargets(command).find(t => {
    const k = protectedKind(strip(t), inAqeAnywhere)
    return k === 'file' || k === 'glob'
  })
  if (redirect !== undefined) return refuse(`a shell redirect overwrites ${redirect}`)

  const namesDb = allWords.some(w => {
    const k = protectedKind(w, inAqeAnywhere)
    return k === 'file' || k === 'glob' || k === 'dir'
  })
  if (namesDb && DESTRUCTIVE_SQL.test(command)) return refuse('destructive SQL (DROP/DELETE FROM/TRUNCATE/.restore) against an AQE learning database')
  if (namesDb && CODE_DESTROY.test(command)) return refuse('a script deletes or overwrites an AQE learning database')

  for (const seg of segs) {
    const what = judgeSimple(words(seg), ctx, false)
    if (what !== undefined) return refuse(what)
  }
  return undefined
}

/** The refusal for a file tool writing to a learning-data file, or undefined. */
export function judgeFileTool(path: string): Refusal | undefined {
  const k = protectedKind(path)
  return k === 'file' || k === 'glob' ? refuse(`a file tool writes to ${path}`) : undefined
}

/** True for the tools the guard reads. */
export const isGuarded = (tool: string): boolean => (GUARDED_TOOLS as readonly string[]).includes(tool)

/** The guard's verdict on one tool call (`input` the call's fields), or undefined to let it run. */
export function judge(tool: string, input: unknown): Refusal | undefined {
  if (tool === 'Bash') return judgeBash(field(input, 'command'))
  if (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit') return judgeFileTool(field(input, 'file_path'))
  if (tool === 'NotebookEdit') return judgeFileTool(field(input, 'notebook_path'))
  return undefined
}
