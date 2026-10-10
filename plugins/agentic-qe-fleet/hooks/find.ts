/**
 * The guard's reading of `find`: a find that deletes, moves or rewrites what
 * it finds is refused unless the guard can prove it never reaches the store.
 * Exclusions are honoured only in forms whose effect is certain. Pure: no `$`.
 */
import { COPIERS, DATA_SAMPLES, holdsAqe, isDestructiveVerb, isVerb, SHELLS, SQLITE_TOOLS, verbName } from './commands'
import { isData, isDataFileOrGlob, type Ctx } from './context'
import { globMatch } from './glob'
import { globMatches, globReachesData, normalisePath, underAqe } from './paths'
import { commandStart, expandBraces, isOption } from './shell'

const EXEC = new Set(['-exec', '-execdir', '-ok', '-okdir'])
const NAME_TESTS = new Set(['-name', '-iname'])
const PATH_TESTS = /^-i?(path|wholename)$/

/** find's starting points (the words before its first test, after -H/-L/-P/-D x/-O n) and where the expression starts. */
function findRoots(args: readonly string[]): { roots: string[]; end: number } {
  let i = 0
  while (i < args.length && /^-([HLP]|O\d*|D)$/.test(args[i] as string)) i += args[i] === '-D' ? 2 : 1
  const roots: string[] = []
  for (; i < args.length && !/^[-(!]/.test(args[i] as string); i++) roots.push(args[i] as string)
  return { roots, end: i }
}

/** Output actions: what a find prints is what its reader (`$(...)`, `| xargs`) receives. */
const OUTPUTS = /^-(print0?|ls)$/
const OUTPUTS_VALUED = /^-(printf|fprint0?|fprintf|fls)$/

/**
 * The same find, deleting what it would print: `-delete` beside each output action, or the
 * whole expression wrapped as `( ... ) -delete` when it has none (the implicit `-print` covers
 * every `-o` branch, so a trailing `-delete` would bind only to the last one).
 */
export function asDeleting(args: readonly string[]): string[] {
  const { end } = findRoots(args)
  const head = args.slice(0, end)
  const expr = args.slice(end)
  if (expr.length === 0) return [...head, '-delete']
  if (!expr.some(a => OUTPUTS.test(a) || OUTPUTS_VALUED.test(a))) return [...head, '(', ...expr, ')', '-delete']
  const out: string[] = []
  for (let i = 0; i < expr.length; i++) {
    const a = expr[i] as string
    if (OUTPUTS.test(a)) out.push('-delete')
    else if (OUTPUTS_VALUED.test(a)) {
      out.push('-delete')
      i++
    } else out.push(a)
  }
  return [...head, ...out]
}

/** What a found path is replaced by when an `-exec` command is judged as if it ran on the store. */
const FOUND = '.agentic-qe/memory.db'

/**
 * Whether one `-exec` argv deletes, moves or rewrites what find hands it. The verb after any
 * wrapper decides (`-exec sudo rm`); `git` only with a destructive subcommand; a shell's `-c`
 * text is judged with `{}`/`$1` read as the store; a copy only when the found path (or the
 * store) is its destination, so `-exec cp {} /tmp/backup/` passes.
 */
function execDestroys(argv: readonly string[], ctx: Ctx): boolean {
  const at = commandStart(argv, isVerb)
  const verb = verbName(argv[at] ?? '')
  const rest = argv.slice(at + 1)
  if (verb === 'git') return ['rm', 'clean', 'checkout', 'restore', 'mv', 'reset', 'stash'].includes(rest.find(a => !isOption(a)) ?? '')
  if (SHELLS.has(verb) || verb === 'eval') {
    const c = rest.findIndex(a => /^-[A-Za-z]*c[A-Za-z]*$/.test(a))
    const text = verb === 'eval' ? rest.join(' ') : c === -1 ? undefined : rest[c + 1]
    if (text === undefined) return true
    // `$1` in the text was already read as `*` by expansion, so a lone `*` is a found path too.
    return ctx.bash(text.replace(/\{\}|\$\{?[0-9@*]\}?|(?<![\w./-])\*(?![\w./-])/g, FOUND), ctx) !== undefined
  }
  // A SQLite client is judged on what it would run against a found database (`-exec sqlite3 {} .tables` passes).
  if (SQLITE_TOOLS.has(verb)) return ctx.bash(argv.map(a => `'${a.replace(/\{\}/g, FOUND).replace(/'/g, "'\\''")}'`).join(' '), ctx) !== undefined
  if (COPIERS.has(verb)) {
    const ops = rest.filter(a => !isOption(a))
    const dest = ops[ops.length - 1] ?? ''
    return ops.length < 2 || dest.includes('{}') || isData(dest, ctx)
  }
  return isDestructiveVerb(verb)
}

/** The index of the first action that deletes or rewrites (`-delete`, or an -exec that `execDestroys`), or -1. Every -exec is read. */
function destroyingAction(args: readonly string[], ctx: Ctx): number {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-delete') return i
    if (!EXEC.has(args[i] as string)) continue
    let j = i + 1
    const argv: string[] = []
    while (j < args.length && args[j] !== ';' && args[j] !== '+') argv.push(args[j++] as string)
    if (execDestroys(argv, ctx)) return i
    i = j
  }
  return -1
}

/**
 * Whether the expression provably keeps find out of `.agentic-qe`. Only two forms count, and
 * never with `-depth`/`-d` (which evaluates children before the prune):
 * - a branch that is exactly `-name .agentic-qe -prune` / `-path <root>/.agentic-qe[/*] -prune`,
 *   then `-o`, with the destructive action after it, and never for `-delete` (BSD find reads
 *   `-delete` as `-d`, which makes `-prune` do nothing);
 * - `-not -path P` / `! -path P` as a conjunct of the action's own branch, where P matches every
 *   data file under every root, and also the directory unless a positive `-name` cannot match it.
 */
function excludesStore(args: readonly string[], bases: readonly string[], action: number, names: readonly string[], branch: { from: number; to: number }, exprStart: number): boolean {
  if (args.includes('-depth') || args.includes('-d') || args.includes('(') || args.includes(')')) return false
  const literalSpot = (test: string, v: string) =>
    NAME_TESTS.has(test)
      ? v.toLowerCase() === '.agentic-qe'
      : bases.every(b => {
          const p = normalisePath(v).replace(/\/+$/, '')
          return p === normalisePath(`${b}/.agentic-qe`) || p === `${normalisePath(`${b}/.agentic-qe`)}/*`
        })
  const coversFiles = (v: string) => bases.every(b => DATA_SAMPLES.every(f => globMatch(v, `${b}/.agentic-qe/${f}`, true)))
  const coversDir = (v: string) => bases.every(b => globMatch(v, `${b}/.agentic-qe`, true))
  const namesMissDir = names.length > 0 && !names.some(n => globMatches(n, '.agentic-qe'))
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    const branchStart = i === exprStart || args[i - 1] === '-o' || args[i - 1] === '-or'
    const prunable = args[action] !== '-delete' && branchStart && args[i + 2] === '-prune' && args[i + 3] === '-o' && action > i + 3
    if ((NAME_TESTS.has(a) || PATH_TESTS.test(a)) && prunable && literalSpot(a, args[i + 1] ?? '')) return true
    if ((a === '-not' || a === '!') && i >= branch.from && i < branch.to && PATH_TESTS.test(args[i + 1] ?? '')) {
      const v = args[i + 2] ?? ''
      if (coversFiles(v) && (coversDir(v) || namesMissDir)) return true
    }
  }
  return false
}

/** The `-o`-separated branch holding the action (the whole expression when parentheses make that unclear). */
function branchOf(args: readonly string[], action: number): { from: number; to: number } {
  if (args.some(a => a === '(' || a === ')')) return { from: 0, to: args.length }
  let from = 0
  let to = args.length
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '-o' && args[i] !== '-or') continue
    if (i < action) from = i + 1
    else {
      to = i
      break
    }
  }
  return { from, to }
}

/**
 * `find` that deletes, moves or rewrites what it finds where that can reach learning data:
 * a root under `.agentic-qe` or one that may hold it (`.`, `..`, `~`, `$HOME`), a `-path`
 * naming it, a `-name` matching a data file or the directory, unless `excludesStore` proves
 * otherwise. `-fprint` over a store is refused too.
 */
export function judgeFind(args: readonly string[], ctx: Ctx): string | undefined {
  const out = args.findIndex((a, i) => /^-f(print0?|printf|ls)$/.test(a) && isDataFileOrGlob(args[i + 1] ?? '', ctx))
  if (out !== -1) return `\`find ${args[out] ?? ''}\` overwrites ${args[out + 1] ?? ''}`
  const action = destroyingAction(args, ctx)
  if (action === -1) return undefined

  const { roots, end: exprStart } = findRoots(args)
  const bases = (roots.length === 0 ? ['.'] : roots).map(r => r.replace(/\/+$/, '') || '/')
  // -path/-wholename patterns are matched (`*` crossing `/`) against where the store would be printed from each root.
  const spots = bases.flatMap(b => [
    `${b}/.agentic-qe`,
    ...DATA_SAMPLES.map(f => `${b}/.agentic-qe/${f}`),
    ...(underAqe(b, ctx.inAqe) ? [b, ...DATA_SAMPLES.map(f => `${b}/${f}`)] : []),
  ])
  const reachesSpot = (pattern: string) => expandBraces(pattern).some(g => spots.some(spot => globMatch(g, spot, true)))
  const { from, to } = branchOf(args, action)
  const positive = (i: number) => args[i - 1] !== '-not' && args[i - 1] !== '!'
  const names: string[] = []
  const paths: string[] = []
  for (let i = from; i < to; i++) {
    const a = args[i] as string
    if (NAME_TESTS.has(a) && positive(i)) names.push(...expandBraces(args[i + 1] ?? '*'))
    if (PATH_TESTS.test(a) && positive(i)) paths.push(args[i + 1] ?? '')
  }
  if (excludesStore(args, bases, action, names, { from, to }, exprStart)) return undefined

  const direct = roots.some(r => underAqe(r, ctx.inAqe)) || (roots.length === 0 && ctx.inAqe) || paths.some(reachesSpot)
  const above = (roots.length === 0 && !ctx.inAqe) || roots.some(r => holdsAqe(r, ctx))
  // Only a literal -path narrows: one with `*`, `?` or `[` may match a store at any depth (`-path '*proj*'` under ~).
  const narrowed = paths.some(p => !/[*?[]/.test(p) && !reachesSpot(p))
  if (!direct && !(above && !narrowed)) return undefined
  // A -name/-iname in the action's branch must be able to match a data file, or the directory itself.
  if (names.length > 0 && !names.some(n => globReachesData(n) || globMatches(n, '.agentic-qe'))) return undefined
  return direct ? '`find ... -delete/-exec` under .agentic-qe' : '`find ... -delete/-exec` from where .agentic-qe may be reaches its learning data'
}
