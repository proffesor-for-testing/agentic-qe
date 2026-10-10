/**
 * The guard's reading of `find`: a find that deletes, moves or rewrites what
 * it finds is refused unless the guard can prove it never reaches the store.
 * Exclusions are honoured only in forms whose effect is certain. Pure: no `$`.
 */
import { DATA_SAMPLES, holdsAqe, isDestructiveWord, isVerb } from './commands'
import { isDataFileOrGlob, type Ctx } from './context'
import { globMatch } from './glob'
import { baseName, globMatches, globReachesData, normalisePath, underAqe } from './paths'
import { commandStart, expandBraces, type Segment } from './shell'

const EXEC = new Set(['-exec', '-execdir', '-ok', '-okdir'])
const NAME_TESTS = new Set(['-name', '-iname'])
const PATH_TESTS = /^-i?(path|wholename)$/

/** find's starting points: the words before its first test (after -H/-L/-P/-D x/-O n). */
function findRoots(args: readonly string[]): string[] {
  let i = 0
  while (i < args.length && /^-([HLP]|O\d*|D)$/.test(args[i] as string)) i += args[i] === '-D' ? 2 : 1
  const roots: string[] = []
  for (; i < args.length && !/^[-(!]/.test(args[i] as string); i++) roots.push(args[i] as string)
  return roots
}

/** The index of the first action that deletes or rewrites (`-delete`, or any -exec whose argv names such a command), or -1. */
function destroyingAction(args: readonly string[]): number {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-delete') return i
    if (!EXEC.has(args[i] as string)) continue
    let j = i + 1
    const argv: string[] = []
    while (j < args.length && args[j] !== ';' && args[j] !== '+') argv.push(args[j++] as string)
    // The verb after any wrapper (`-exec sudo rm`), or any destructive word at all (`-exec git rm`).
    const verb = baseName(argv[commandStart(argv, isVerb)] ?? '')
    if (isDestructiveWord(verb) || argv.some(isDestructiveWord)) return i
    i = j
  }
  return -1
}

/**
 * Whether the expression provably keeps find out of `.agentic-qe`. Only two forms count, and
 * never with `-depth`/`-d` (which evaluates children before the prune):
 * - `-name .agentic-qe -prune -o ...` / `-path <root>/.agentic-qe[/*] -prune -o ...` with the
 *   destructive action after that `-o`;
 * - `-not -path P` / `! -path P` where P matches every data file under every root, and also the
 *   directory unless a positive `-name` cannot match it.
 */
function excludesStore(args: readonly string[], bases: readonly string[], action: number, names: readonly string[]): boolean {
  if (args.includes('-depth') || args.includes('-d')) return false
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
    if ((NAME_TESTS.has(a) || PATH_TESTS.test(a)) && args[i + 2] === '-prune' && args[i + 3] === '-o' && action > i + 3 && literalSpot(a, args[i + 1] ?? '')) return true
    if ((a === '-not' || a === '!') && PATH_TESTS.test(args[i + 1] ?? '')) {
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
  const action = destroyingAction(args)
  if (action === -1) return undefined

  const roots = findRoots(args)
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
  if (excludesStore(args, bases, action, names)) return undefined

  const direct = roots.some(r => underAqe(r, ctx.inAqe)) || (roots.length === 0 && ctx.inAqe) || paths.some(reachesSpot)
  const above = (roots.length === 0 && !ctx.inAqe) || roots.some(r => holdsAqe(r, ctx))
  const narrowed = paths.some(p => !reachesSpot(p))
  if (!direct && !(above && !narrowed)) return undefined
  // A -name/-iname in the action's branch must be able to match a data file, or the directory itself.
  if (names.length > 0 && !names.some(n => globReachesData(n) || globMatches(n, '.agentic-qe'))) return undefined
  return direct ? '`find ... -delete/-exec` under .agentic-qe' : '`find ... -delete/-exec` from where .agentic-qe may be reaches its learning data'
}

/** Whether an earlier stage of this pipeline is a `find` that would reach learning data if it deleted (`find . -name '*.db' | xargs rm`). */
export function fedByFind(seg: Segment, ctx: Ctx): boolean {
  return seg.stages.some(stage => {
    if (!stage.some(w => w === 'find' || w.endsWith('/find'))) return false
    const at = commandStart(stage, isVerb)
    return baseName(stage[at] ?? '') === 'find' && judgeFind([...stage.slice(at + 1), '-delete'], ctx) !== undefined
  })
}
