/**
 * What the guard knows while it reads one command line: where the command has
 * changed into, the variables it has set, the project root, and how to judge a
 * nested shell command. Pure: no `$`.
 */
import { MAX_PATH, protectedKind, type ProtectedKind } from './paths'
import { expandBraces, unmask, type Segment } from './shell'

/** Where the guard is judging: the project root, when the session knows it (so `find /abs/root ...` is read as from above `.agentic-qe`). */
export type GuardScope = { readonly root?: string }

export type Ctx = {
  /** The command has changed into `.agentic-qe` (`cd .agentic-qe`, `git -C .agentic-qe`). */
  inAqe: boolean
  /** Some word of the whole line names learning data (for `xargs rm`, `| sh`, `while read`). */
  mentionsData: boolean
  /** The line may change globbing (`shopt`, `GLOBIGNORE`): `*` may then match `.agentic-qe`. */
  dotglob: boolean
  readonly root: string | undefined
  /** Shell variables the line set (`F=...`, `for f in ...`, `read f`), each to the values it can hold. */
  readonly vars: Map<string, readonly string[]>
  /** How deep in `bash -c`/`eval`/heredoc nesting this line is. */
  readonly depth: number
  /** Judges a nested shell command line (`bash -c "..."`, `.shell ...`) under this context. */
  readonly bash: (command: string, ctx: Ctx) => string | undefined
  /** What a `$(...)`/backtick substitution may expand to (producers.ts), cached per inner text. */
  readonly subst: (inner: string, ctx: Ctx) => readonly string[]
  /** What `read` receives from a `< <(...)` on the line, when that may be the store. */
  readFed: readonly string[] | undefined
  /** Judges a PowerShell command line (`pwsh -c ...` from the Bash tool) under this context. */
  readonly pwsh: (command: string, ctx: Ctx) => string | undefined
}

/** How a word touches learning data under this context, or undefined. */
export const kindOf = (word: string, ctx: Ctx): ProtectedKind | undefined => protectedKind(word.replace(EXTGLOB, '*'), ctx.inAqe, ctx.dotglob)

/** An extglob group (`@(qe)`, `!(x)`, `+(a|b)`): read as `*`, which it may match. */
const EXTGLOB = /[@!+*?]\([^()]*\)/g

export const isData = (w: string, ctx: Ctx): boolean => kindOf(w, ctx) !== undefined

export const isDataFileOrGlob = (w: string, ctx: Ctx): boolean => {
  const k = kindOf(w, ctx)
  return k === 'file' || k === 'glob'
}

/** Results one word may expand to before its expansions are read as `*` instead. */
export const WORD_BUDGET = 256

/** A `$` expansion's alternatives: one of these values stands in its place. */
type Unit = readonly string[]

/** The index of the bracket closing the one at `open` (`(`/`{`), or -1. */
function matching(w: string, open: number, o: string, c: string): number {
  let depth = 0
  for (let i = open; i < w.length; i++) {
    if (w[i] === o) depth++
    else if (w[i] === c && --depth === 0) return i
  }
  return -1
}

/** `${...}`'s alternatives: a known variable's values, a default word or `*`; anything unmodelled is `*`. */
function braceParam(inner: string, vars: ReadonlyMap<string, readonly string[]>, depth: number): Unit {
  const name = /^[A-Za-z_][A-Za-z0-9_]*$/.test(inner) ? inner : undefined
  if (name !== undefined) return vars.get(name) ?? ['*']
  // `${arr[@]}`, `${arr[*]}`, `${arr[0]}`: the array's values (an array binding holds every element).
  const element = /^([A-Za-z_][A-Za-z0-9_]*)\[[^\]]*\]$/.exec(inner)
  if (element !== null) return vars.get(element[1] as string) ?? ['*']
  const op = /^([A-Za-z_][A-Za-z0-9_]*)(:?[-=?+])(.*)$/s.exec(inner)
  if (op === null || depth > 8) return ['*']
  const known = vars.get(op[1] as string)
  const word = loose(op[3] as string, depth + 1)
  if ((op[2] as string).endsWith('+')) return [word, '']
  return [...(known ?? []), word, '*']
}

/** Resolves a substitution's inner text to what it may expand to; without one, every substitution is `*`. */
export type Subst = (inner: string) => readonly string[]

/** Splits a word into literal text and `$` expansions (unknown ones as `*`). */
function units(word: string, vars: ReadonlyMap<string, readonly string[]>, depth = 0, subst?: Subst): Array<string | Unit> {
  const out: Array<string | Unit> = []
  let lit = ''
  for (let i = 0; i < word.length; i++) {
    const c = word[i] as string
    const n = word[i + 1]
    let unit: Unit | undefined
    let end = i
    if (c === '`') {
      const close = word.indexOf('`', i + 1)
      end = close === -1 ? word.length - 1 : close
      unit = subst === undefined ? ['*'] : subst(word.slice(i + 1, end))
    } else if (c === '$' && n === '(') {
      const close = matching(word, i + 1, '(', ')')
      end = close === -1 ? word.length - 1 : close
      unit = subst === undefined ? ['*'] : subst(word.slice(i + 2, close === -1 ? word.length : close))
    } else if (c === '$' && n === '{') {
      const close = matching(word, i + 1, '{', '}')
      end = close === -1 ? word.length - 1 : close
      unit = braceParam(word.slice(i + 2, close === -1 ? word.length : close), vars, depth)
    } else if (c === '$' && n !== undefined && /[A-Za-z_]/.test(n)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(word.slice(i + 1, i + 257)) as RegExpExecArray
      end = i + m[0].length
      unit = vars.get(m[0]) ?? ['*']
    } else if (c === '$' && n !== undefined && /[0-9@*#?$!-]/.test(n)) {
      end = i + 1
      unit = ['*']
    }
    if (unit === undefined) lit += c
    else {
      if (lit !== '') out.push(lit)
      lit = ''
      out.push(unit)
      i = end
    }
  }
  if (lit !== '') out.push(lit)
  return out
}

/** A word with every `$` expansion read as `*`: what it can always match. */
const loose = (word: string, depth = 0): string =>
  units(word, new Map(), depth)
    .map(u => (typeof u === 'string' ? u : '*'))
    .join('')

/**
 * A word as the shell may expand it: each known variable by the values it can
 * hold, every other `$NAME`, `${...}`, `$@`, `$(...)` and backtick as `*`
 * (unknown text can be anything), `${X:-w}` as `w` or `*`. Past `budget`
 * results the whole word is read loose, every expansion as `*`.
 */
export function expandVars(word: string, vars: ReadonlyMap<string, readonly string[]>, budget = WORD_BUDGET, subst?: Subst): string[] {
  if (!word.includes('$') && !word.includes('`')) return [word]
  const parts = units(word, vars, 0, subst)
  let count = 1
  let length = 0
  for (const p of parts) {
    if (typeof p === 'string') length += p.length
    else {
      count *= Math.max(1, p.length)
      // A loop, not Math.max(...spread): a unit may hold more values than the call stack takes.
      length += p.reduce((m, v) => Math.max(m, v.length), 0)
    }
  }
  // Too many results, or too long: read loose, but keep any alternative that names the store as a word of its own.
  if (count > budget || length > MAX_PATH) {
    const named = parts.flatMap(p => (typeof p === 'string' ? [] : p.filter(v => /agentic/i.test(v))))
    return [loose(word), ...new Set(named)]
  }
  let out = ['']
  for (const p of parts) out = typeof p === 'string' ? out.map(o => o + p) : out.flatMap(o => p.map(v => o + v))
  return out
}

/** A segment's words as the shell expands them: braces (unquoted ones only), then `$` expansions. */
export function expandWords(seg: Segment, ctx: Ctx): string[] {
  // Most words hold nothing to expand: no `$`, backtick or brace.
  if (!seg.words.some(w => /[$`{]/.test(w))) return [...seg.words]
  return seg.words.flatMap((w, i) => {
    const ex = seg.expandable[i] ?? w
    const braced = ex.includes('{') ? expandBraces(ex).map(unmask) : [w]
    const budget = Math.max(1, Math.floor(WORD_BUDGET / braced.length))
    return braced.flatMap(b => expandVars(b, ctx.vars, budget, inner => ctx.subst(inner, ctx)))
  })
}

/**
 * Words inside a script or SQL text that could be paths: split at quotes,
 * whitespace and punctuation, so `rmSync('.agentic-qe', {...})`,
 * `os.path.join('.agentic-qe','memory.db')` and `'${root}/.agentic-qe/memory.db'` each yield the path.
 */
export const pathTokens = (text: string): string[] => text.split(/[\s'"`,;(){}+<>|&=$]+/).filter(t => t !== '')

/** Whether a script or SQL text names learning data (the directory counts). */
export const textNamesData = (text: string, ctx: Ctx): boolean => pathTokens(text).some(t => isData(t, ctx))

/** Whether a script or SQL text names a learning-data file or glob (the directory alone does not). */
export const textNamesDataFile = (text: string, ctx: Ctx): boolean => pathTokens(text).some(t => isDataFileOrGlob(t, ctx))
