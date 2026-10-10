/**
 * The guard's rules for one simple shell command, by its command word.
 * Pure: no `$`. Nested shell text (`bash -c`, `eval`, heredocs) goes back
 * through `ctx.bash`, so every rule applies at any depth.
 */
import { expandWords, isData, isDataFileOrGlob, kindOf, type Ctx } from './context'
import { baseName, DATA_FILE, globReachesData, globToRegex, underAqe } from './paths'
import { INTERPRETER, judgeInterpreter, judgeSqlite } from './scripts'
import { commandStart, expandBraces, isOption, type Segment } from './shell'

const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'mksh', 'ash', 'fish', 'busybox'])
const DELETERS = new Set(['rm', 'unlink', 'shred', 'srm', 'trash', 'trash-put', 'gio', 'rmdir', 'wipe'])
const COPIERS = new Set(['cp', 'install', 'ln', 'rsync', 'scp'])
/** Compressors that replace the file they compress (unless told to keep it). */
const COMPRESSORS = new Set(['gzip', 'bzip2', 'xz', 'lzma', 'compress', 'pigz', 'lzip'])
/** Commands that write the file named by an output option. */
const OUTPUT_FLAGS: Readonly<Record<string, readonly string[]>> = {
  curl: ['-o', '--output'],
  wget: ['-O', '--output-document'],
  sort: ['-o', '--output'],
}
/** Every command word the guard judges (so a wrapper's valued flag never swallows it). */
const KNOWN = new Set([...DELETERS, ...COPIERS, ...SHELLS, ...COMPRESSORS, 'mv', 'truncate', 'dd', 'tee', 'find', 'git', 'cd', 'pushd', 'sqlite3', 'sqlite', 'sed', 'eval', 'su'])
export const isVerb = (w: string): boolean => KNOWN.has(baseName(w)) || INTERPRETER.test(baseName(w))

/** One file of each learning-data kind: an exclude must keep them all. */
const DATA_SAMPLES = ['memory.db', 'memory.db-wal', 'memory.db-shm', 'memory.db-journal', 'brain.rvf']

const WRITE_OPS = new Set(['>', '>>', '>|', '&>', '&>>', '<>'])

/** `-t DIR` / `--target-directory=DIR` (cp, mv, install, ln), or undefined. */
function targetDir(args: readonly string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (a === '-t' || a === '--target-directory') return args[i + 1]
    if (a.startsWith('--target-directory=')) return a.slice('--target-directory='.length)
  }
  return undefined
}

/** Whether writing to `dest` replaces learning data: a data file or glob, or the directory with a data-named source. */
function overwrites(dest: string, sources: readonly string[], ctx: Ctx): boolean {
  const kind = kindOf(dest, ctx)
  if (kind === 'file' || kind === 'glob') return true
  return kind === 'dir' && sources.some(s => DATA_FILE.test(baseName(s)))
}

/** `cd`/`pushd`: entering `.agentic-qe` makes bare `memory.db` the store; leaving it does the opposite. */
function changeDir(target: string | undefined, ctx: Ctx): void {
  if (target === undefined || target === '~' || target === '-' || target.startsWith('/') || target.startsWith('~')) ctx.inAqe = target !== undefined && underAqe(target)
  else if (underAqe(target)) ctx.inAqe = true
  else if (target === '..' || target.startsWith('../')) ctx.inAqe = false
}

/** `NAME=value` words before the command word, and `for NAME in ...`, `read NAME`: remembered for `$NAME`. */
function bindVars(ws: readonly string[], start: number, seg: Segment, ctx: Ctx): void {
  for (const w of ws.slice(0, start)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(w)
    if (m !== null) ctx.vars.set(m[1] as string, [m[2] as string])
  }
  const verb = ws[start]
  if (verb === 'export' || verb === 'local' || verb === 'declare' || verb === 'readonly' || verb === 'typeset') bindVars(ws.slice(start + 1), ws.length - start - 1, seg, ctx)
  if ((verb === 'for' || verb === 'select') && ws[start + 2] === 'in') ctx.vars.set(ws[start + 1] as string, ws.slice(start + 3).flatMap(w => expandBraces(w)))
  if (verb === 'read' && seg.piped) {
    const fed = seg.upstream.split(/\s+/).find(w => isData(w, ctx))
    if (fed !== undefined) for (const name of ws.slice(start + 1).filter(w => !isOption(w))) ctx.vars.set(name, [fed])
  }
}

/** `bash -c CMD`, `bash -lc CMD`, `sh -ec CMD`, `eval ...`, `bash <<EOF`, `... | sh`. */
function judgeShell(verb: string, args: readonly string[], seg: Segment, ctx: Ctx, viaXargs: boolean): string | undefined {
  if (verb === 'eval') return ctx.bash(args.join(' '), ctx)
  let command: string | undefined
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (/^[-+][oO]$/.test(a)) i++
    else if (/^-[A-Za-z]*c[A-Za-z]*$/.test(a)) {
      command = args.slice(i + 1).find(x => !isOption(x)) ?? ''
      break
    } else if (!isOption(a)) break
  }
  if (command !== undefined) {
    if (viaXargs && ctx.mentionsData) return `\`xargs ${verb} -c\` fed learning-data paths`
    return ctx.bash(command, ctx)
  }
  if (seg.stdin !== '') {
    const what = ctx.bash(seg.stdin, ctx)
    if (what !== undefined) return what
  }
  if (seg.piped && seg.upstream.split(/\s+/).some(w => isData(w, ctx))) return `a script piped into \`${verb}\` names learning data`
  return undefined
}

/** find's starting points: the words before its first test (after -H/-L/-P/-D x/-O n). */
function findRoots(args: readonly string[]): string[] {
  let i = 0
  while (i < args.length && /^-([HLP]|O\d*|D)$/.test(args[i] as string)) i += args[i] === '-D' ? 2 : 1
  const roots: string[] = []
  for (; i < args.length && !/^[-(!]/.test(args[i] as string); i++) roots.push(args[i] as string)
  return roots
}

/** Whether a find root holds the project's `.agentic-qe` beneath it (`.`, `$PWD`, the project root). */
function holdsAqe(root: string, ctx: Ctx): boolean {
  if (/^(\.\/?|\$\{?PWD\}?\/?|\$\(pwd\)\/?)$/.test(root)) return true
  if (ctx.root === undefined || !root.startsWith('/')) return false
  const r = ctx.root.replace(/\/+$/, '')
  const q = root.replace(/\/+$/, '')
  return q === r || r.startsWith(`${q}/`)
}

/**
 * `find` that deletes, moves or rewrites what it finds (`-delete`, `-exec rm/mv/cp/sh ...`)
 * where that can reach learning data: a root under `.agentic-qe`, a `-path` naming it, or a root
 * above it (`find . -name '*.db' -delete`) not excluded by `-not -path`/`-prune`. Every
 * `-name` must be able to match a data file. `-fprint` over a store is refused too.
 */
function judgeFind(args: readonly string[], ctx: Ctx): string | undefined {
  const out = args.findIndex((a, i) => /^-f(print0?|printf|ls)$/.test(a) && isDataFileOrGlob(args[i + 1] ?? '', ctx))
  if (out !== -1) return `\`find ${args[out] ?? ''}\` overwrites ${args[out + 1] ?? ''}`
  const execAt = args.findIndex(a => a === '-exec' || a === '-execdir' || a === '-ok' || a === '-okdir')
  const execVerb = execAt === -1 ? '' : baseName(args[execAt + 1] ?? '')
  const destroys =
    args.includes('-delete') ||
    DELETERS.has(execVerb) ||
    COPIERS.has(execVerb) ||
    SHELLS.has(execVerb) ||
    INTERPRETER.test(execVerb) ||
    ['truncate', 'mv', 'shred', 'dd', 'tee', 'sed'].includes(execVerb) ||
    COMPRESSORS.has(execVerb)
  if (!destroys) return undefined

  const roots = findRoots(args)
  const paths = args.flatMap((a, i) => (/^-i?(path|wholename)$/.test(a) ? [{ value: args[i + 1] ?? '', negated: args[i - 1] === '-not' || args[i - 1] === '!', pruned: args[i + 2] === '-prune' }] : []))
  const namesAqe = (v: string) => /agentic-qe/i.test(v)
  if (paths.some(p => (p.negated || p.pruned) && namesAqe(p.value))) return undefined
  const direct = roots.some(r => underAqe(r, ctx.inAqe)) || (roots.length === 0 && ctx.inAqe) || paths.some(p => !p.negated && !p.pruned && namesAqe(p.value))
  const above = (roots.length === 0 && !ctx.inAqe) || roots.some(r => holdsAqe(r, ctx))
  const narrowed = paths.some(p => !p.negated && !p.pruned && !namesAqe(p.value) && !/^\*?$/.test(p.value))
  if (!direct && !(above && !narrowed)) return undefined

  const names = args.flatMap((a, i) => (a === '-name' || a === '-iname' ? expandBraces(args[i + 1] ?? '*') : []))
  if (names.length > 0 && !names.some(globReachesData)) return undefined
  return direct ? '`find ... -delete/-exec` under .agentic-qe' : '`find ... -delete/-exec` from above .agentic-qe reaches its learning data'
}

/** git options before the subcommand that take a separate value. */
const GIT_VALUED = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix', '--exec-path'])

/** Whether git-clean exclude patterns keep every learning-data file (`-e .agentic-qe`, `-e '*.db*' -e '*.rvf'`). */
function excludesData(patterns: readonly string[]): boolean {
  const keeps = (pattern: string, file: string): boolean => {
    const bare = pattern.replace(/^\/+|\/+$/g, '').replace(/^\*\*\//, '')
    if (/^\.agentic-qe(\/\*{1,2})?$/i.test(bare)) return true
    const name = bare.replace(/^\.agentic-qe\//i, '')
    return !name.includes('/') && expandBraces(name).some(n => globToRegex(n).test(file))
  }
  return DATA_SAMPLES.every(f => patterns.some(p => keeps(p, f)))
}

/** `git clean -x/-X` (deletes the ignored .agentic-qe) and `git checkout/restore/rm` on data files. */
function judgeGit(args: readonly string[], ctx: Ctx): string | undefined {
  let i = 0
  let local = ctx
  for (; i < args.length; i++) {
    const a = args[i] as string
    if (!isOption(a)) break
    if (GIT_VALUED.has(a)) {
      const v = args[++i] ?? ''
      if (a === '-C') local = { ...local, inAqe: underAqe(v, local.inAqe) && v !== '' }
    }
  }
  const sub = args[i]
  const rest = args.slice(i + 1)
  if (sub === 'clean') {
    const flags = rest.filter(a => /^-[A-Za-z]+$/.test(a)).join('')
    const dry = flags.includes('n') || rest.includes('--dry-run')
    const patterns: string[] = []
    const paths: string[] = []
    for (let j = 0; j < rest.length; j++) {
      const a = rest[j] as string
      if (a === '-e' || a === '--exclude') patterns.push(rest[++j] ?? '')
      else if (a.startsWith('--exclude=')) patterns.push(a.slice('--exclude='.length))
      else if (/^-e./.test(a)) patterns.push(a.slice(2))
      else if (!isOption(a)) paths.push(a)
    }
    if (!/[xX]/.test(flags) || dry || excludesData(patterns)) return undefined
    // Pathspecs that cannot reach .agentic-qe (`git clean -fdx dist/`) leave it alone.
    const reaches = paths.length === 0 || local.inAqe || paths.some(p => p === '.' || p === './' || p === ':/' || /[*?[]/.test(p) || underAqe(p) || p.startsWith('/'))
    return reaches ? '`git clean -x` deletes the git-ignored .agentic-qe directory' : undefined
  }
  if (sub === 'checkout' || sub === 'restore' || sub === 'rm') {
    const hit = rest.find(a => isData(a, local))
    return hit === undefined ? undefined : `\`git ${sub}\` on ${hit}`
  }
  return undefined
}

/** The deleting, moving and overwriting commands. */
function judgeWriters(verb: string, args: readonly string[], ctx: Ctx, piped: boolean): string | undefined {
  const operands = args.filter(a => !isOption(a))
  if (DELETERS.has(verb) || verb === 'truncate') {
    const hit = operands.find(a => (verb === 'truncate' ? isDataFileOrGlob(a, ctx) : isData(a, ctx)))
    if (hit !== undefined) return `\`${verb}\` on ${hit}`
    return piped && ctx.mentionsData ? `\`xargs ${verb}\` fed learning-data paths` : undefined
  }
  if (COMPRESSORS.has(verb)) {
    const keeps = args.some(a => /^-[A-Za-z]*[kcdt]/.test(a) || a === '--keep' || a === '--stdout' || a === '--decompress' || a === '--test')
    const hit = keeps ? undefined : operands.find(a => isDataFileOrGlob(a, ctx))
    return hit === undefined ? undefined : `\`${verb}\` replaces ${hit} with an archive`
  }
  if (verb === 'mv') {
    const dir = targetDir(args)
    const dest = dir ?? operands[operands.length - 1]
    const sources = dir === undefined ? operands.slice(0, -1) : operands.filter(o => o !== dir)
    const moved = sources.find(a => isData(a, ctx))
    if (moved !== undefined) return `\`mv\` moves ${moved} away`
    if (dest !== undefined && overwrites(dest, sources, ctx)) return `\`mv\` overwrites ${dest}`
    return piped && ctx.mentionsData ? '`xargs mv` fed learning-data paths' : undefined
  }
  if (COPIERS.has(verb)) {
    const dir = targetDir(args)
    const dest = dir ?? operands[operands.length - 1]
    if (dest === undefined) return undefined
    const sources = dir === undefined ? operands.slice(0, -1) : operands.filter(o => o !== dir)
    if (overwrites(dest, sources, ctx)) return `\`${verb}\` overwrites ${dest}`
    if (verb === 'rsync' && args.some(a => a.startsWith('--delete')) && underAqe(dest, ctx.inAqe)) return `\`rsync --delete\` into ${dest}`
    if (verb === 'rsync' && args.includes('--remove-source-files') && sources.some(s => underAqe(s, ctx.inAqe))) return '`rsync --remove-source-files` moves learning data away'
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
  if (verb === 'sed' && args.some(a => /^-[A-Za-z]*i/.test(a) || a.startsWith('--in-place'))) {
    const hit = operands.find(a => isDataFileOrGlob(a, ctx))
    return hit === undefined ? undefined : `\`sed -i\` rewrites ${hit}`
  }
  const flags = OUTPUT_FLAGS[verb]
  if (flags !== undefined) {
    const at = args.findIndex((a, i) => flags.includes(a) && isDataFileOrGlob(args[i + 1] ?? '', ctx))
    if (at !== -1) return `\`${verb} ${args[at] ?? ''}\` overwrites ${args[at + 1] ?? ''}`
  }
  return undefined
}

/** One simple command's refusal, or undefined. */
export function judgeSegment(seg: Segment, ctx: Ctx, viaXargs = false): string | undefined {
  const ws = expandWords(seg, ctx)
  const start = commandStart(ws, isVerb)
  bindVars(ws, start, seg, ctx)

  const redirect = seg.redirects.find(r => WRITE_OPS.has(r.op) && isDataFileOrGlob(r.target, ctx))
  if (redirect !== undefined) return `a shell redirect overwrites ${redirect.target}`
  if (start >= ws.length) return undefined

  const verb = baseName(ws[start] as string)
  const args = ws.slice(start + 1)
  const piped = viaXargs || ws.slice(0, start).some(w => baseName(w) === 'xargs')

  if (verb === 'cd' || verb === 'pushd') {
    changeDir(args.find(a => !isOption(a)), ctx)
    return undefined
  }
  if (SHELLS.has(verb) || verb === 'eval') return judgeShell(verb, args, seg, ctx, piped)
  if (verb === 'su') {
    const c = args.findIndex(a => a === '-c' || a === '--command')
    return c === -1 ? undefined : ctx.bash(args[c + 1] ?? '', ctx)
  }
  if (verb === 'sqlite3' || verb === 'sqlite') return judgeSqlite(args, seg, ctx)
  if (INTERPRETER.test(verb)) return judgeInterpreter(verb, args, seg, ctx)
  if (verb === 'find') return judgeFind(args, ctx)
  if (verb === 'git') return judgeGit(args, ctx)
  return judgeWriters(verb, args, ctx, piped)
}
