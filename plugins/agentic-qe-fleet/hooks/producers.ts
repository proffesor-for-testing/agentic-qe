/**
 * Commands whose output becomes other commands' arguments: `$(...)`/backtick
 * substitutions, `< <(...)` feeding `read`, and pipeline stages feeding
 * `xargs`/`read`. The guard cannot see their output, so it decides what that
 * output may be: a substitution that names the store yields those paths; one
 * that lists files which may include the store (`find`, `ls -A`, `git
 * ls-files -o`), or whose output is opaque (`cat list`, `base64 -d`), may
 * yield the store itself. Only known-harmless producers (`date`, `pwd`,
 * `find . -name '*.tmp'`) read as plain `*`. Pure: no `$`.
 */
import { holdsAqe, isVerb, verbName } from './commands'
import { isData, pathTokens, textNamesData, type Ctx } from './context'
import { judgeFind } from './find'
import { commandStart, isOption, parse, type Segment } from './shell'

/** What the output of a command that may list or emit the store can be (`*` first, so a destination slot sees the store). */
export const DATA_ALTS: readonly string[] = ['*', '.agentic-qe', '.agentic-qe/memory.db']

/** Commands whose output is never a path the guard cares about. */
const HARMLESS = new Set(['date', 'pwd', 'mktemp', 'basename', 'dirname', 'realpath', 'readlink', 'whoami', 'id', 'uname', 'hostname', 'nproc', 'seq', 'true', 'false', 'tty', 'getconf', 'echo', 'printf', 'wc'])
/** Shell-setup generators whose output `eval` runs (`eval "$(ssh-agent -s)"`). */
const ENV_INIT = new Set(['ssh-agent', 'direnv', 'pyenv', 'rbenv', 'nodenv', 'fnm', 'brew', 'conda', 'zoxide', 'starship', 'mise', 'rtx', 'gpg-agent', 'dircolors', 'keychain'])
/** Filters that only select or reorder lines they are piped. */
const FILTERS = new Set(['head', 'tail', 'sort', 'uniq', 'grep', 'egrep', 'fgrep', 'wc', 'cut', 'tr'])
const GIT_READS = new Set(['rev-parse', 'describe', 'branch', 'log', 'show', 'status', 'diff', 'tag', 'config', 'remote', 'symbolic-ref', 'hash-object'])

/** Command words that may list the store (`find`, `ls -A`, `dir`, `git ls-files -o`). */
const LISTERS = /(^|\/)(find|ls|dir|git)$/

type Verdict = 'harmless' | 'reaches' | 'opaque'

/** Whether one command's output may name the store: never, by listing it (`reaches`), or unknowably (`opaque`). */
function verdictOf(words: readonly string[], ctx: Ctx, piped: boolean): Verdict {
  const at = commandStart(words, isVerb)
  const verb = verbName(words[at] ?? '')
  const args = words.slice(at + 1)
  const operands = args.filter(a => !isOption(a))
  if (verb === '') return 'harmless'
  if (verb === 'find') return judgeFind([...args, '-delete'], ctx) === undefined ? 'harmless' : 'reaches'
  if (verb === 'ls' || verb === 'dir') {
    const all = args.some(a => /^-[A-Za-z]*[aA]/.test(a) || a === '--all' || a === '--almost-all')
    return all && (operands.length === 0 || operands.some(o => holdsAqe(o, ctx))) ? 'reaches' : 'harmless'
  }
  if (verb === 'git') {
    const sub = operands[0] ?? ''
    if (sub === 'ls-files') return args.some(a => /^-[A-Za-z]*[oi]/.test(a) || a === '--others' || a === '--ignored') ? 'reaches' : 'harmless'
    return GIT_READS.has(sub) ? 'harmless' : 'opaque'
  }
  // echo/printf print their arguments: harmless unless an unknown variable feeds them.
  if (HARMLESS.has(verb)) return (verb === 'echo' || verb === 'printf') && args.some(a => /\$[A-Za-z_{@*0-9]/.test(a)) ? 'opaque' : 'harmless'
  if (FILTERS.has(verb) && (piped || operands.length === 0)) return 'harmless'
  return 'opaque'
}

/** The worst verdict over every command a text runs (nested substitutions included). */
function verdictOfText(text: string, ctx: Ctx): Verdict {
  let worst: Verdict = 'harmless'
  for (const seg of parse(text)) {
    if (seg.dropped !== undefined) return 'opaque'
    const v = verdictOf(seg.words, ctx, seg.piped)
    if (v === 'opaque') return 'opaque'
    if (v === 'reaches') worst = 'reaches'
  }
  return worst
}

/**
 * What a `$(...)`/backtick substitution may expand to. Naming the store: those paths (and `*`).
 * Listing files that may include it, or opaque: DATA_ALTS. Harmless: `*`.
 */
export function substitutionAlts(inner: string, ctx: Ctx): readonly string[] {
  if (inner.trim() === '') return ['']
  if (textNamesData(inner, ctx)) {
    const named = pathTokens(inner).filter(t => isData(t, ctx))
    return ['*', ...new Set(named)]
  }
  if (ctx.depth > 6) return DATA_ALTS
  return verdictOfText(inner, ctx) === 'harmless' ? ['*'] : DATA_ALTS
}

/** Whether `eval`/`bash -c` would run a script the guard cannot read: one that is wholly an expansion (`"$CMD"`, `"$(curl ... | base64 -d)"`). */
export function opaqueScript(raw: string, ctx: Ctx): boolean {
  const word = raw.trim()
  const sub = /^\$\(([\s\S]*)\)$|^`([\s\S]*)`$/.exec(word)
  if (sub !== null) {
    const inner = sub[1] ?? sub[2] ?? ''
    const first = parse(inner)[0]
    if (first !== undefined && ENV_INIT.has(verbName(first.words[commandStart(first.words, isVerb)] ?? ''))) return false
    return verdictOfText(inner, ctx) !== 'harmless' || textNamesData(inner, ctx)
  }
  const v = /^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/.exec(word)
  return v !== null && !ctx.vars.has(v[1] as string)
}

/** Whether an earlier stage of this pipeline lists files that may include the store (`find . -name '*.db' | xargs rm`, `git ls-files -oi | xargs rm`). */
export function fedByProducer(seg: Segment, ctx: Ctx): boolean {
  // Only these can list the store; most stages are skipped without being read.
  return seg.stages.some((stage, i) => stage.some(w => LISTERS.test(w)) && verdictOf(stage, ctx, i > 0) === 'reaches')
}
