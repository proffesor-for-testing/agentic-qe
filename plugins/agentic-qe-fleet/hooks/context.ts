/**
 * What the guard knows while it reads one command line: where the command has
 * changed into, the variables it has set, the project root, and how to judge a
 * nested shell command. Pure: no `$`.
 */
import { outsideProjectTemp, protectedKind, type ProtectedKind } from './paths'
import { expandBraces, type Segment } from './shell'

/** Where the guard is judging: the project root, when the session knows it. */
export type GuardScope = { readonly root?: string }

export type Ctx = {
  /** The command has changed into `.agentic-qe` (`cd .agentic-qe`, `git -C .agentic-qe`). */
  inAqe: boolean
  /** Some word of the whole line names learning data (for `xargs rm`, `| sh`, `while read`). */
  mentionsData: boolean
  readonly root: string | undefined
  /** Shell variables the line set (`F=...`, `for f in ...`, `read f`), each to the values it can hold. */
  readonly vars: Map<string, readonly string[]>
  /** How deep in `bash -c`/`eval`/heredoc nesting this line is. */
  readonly depth: number
  /** Judges a nested shell command line (`bash -c "..."`, `.shell ...`) under this context. */
  readonly bash: (command: string, ctx: Ctx) => string | undefined
}

/** How a word touches learning data under this context, or undefined. */
export function kindOf(word: string, ctx: Ctx): ProtectedKind | undefined {
  if (outsideProjectTemp(word, ctx.root)) return undefined
  return protectedKind(word, ctx.inAqe)
}

export const isData = (w: string, ctx: Ctx): boolean => kindOf(w, ctx) !== undefined

export const isDataFileOrGlob = (w: string, ctx: Ctx): boolean => {
  const k = kindOf(w, ctx)
  return k === 'file' || k === 'glob'
}

const VAR = /\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/

/** A word with each known `$NAME`/`${NAME}` replaced, one result per value it can hold (capped). */
function expandVars(word: string, vars: ReadonlyMap<string, readonly string[]>, depth = 0): string[] {
  const m = VAR.exec(word)
  if (m === null || depth > 4) return [word]
  const name = (m[1] ?? m[2]) as string
  const values = vars.get(name)
  const head = word.slice(0, m.index)
  const tail = word.slice(m.index + m[0].length)
  if (values === undefined) return expandVars(tail, vars, depth + 1).map(t => head + m[0] + t)
  return values.slice(0, 32).flatMap(v => expandVars(tail, vars, depth + 1).map(t => head + v + t))
}

/** A segment's words as the shell expands them: known variables, then braces in unquoted words. */
export function expandWords(seg: Segment, ctx: Ctx): string[] {
  return seg.words.flatMap((w, i) => {
    const vs = ctx.vars.size === 0 ? [w] : expandVars(w, ctx.vars)
    return seg.quoted[i] === true ? vs : vs.flatMap(v => expandBraces(v))
  })
}

/**
 * Words inside a script or SQL text that could be paths: split at quotes,
 * whitespace and punctuation, so `rmSync('.agentic-qe', {...})`,
 * `os.path.join('.agentic-qe','memory.db')` and `'${root}/.agentic-qe/memory.db'` each yield the path.
 */
export const pathTokens = (text: string): string[] => text.split(/[\s'"`,;()[\]{}+<>|&=$]+/).filter(t => t !== '')

/** Whether a script or SQL text names learning data (the directory counts). */
export const textNamesData = (text: string, ctx: Ctx): boolean => pathTokens(text).some(t => isData(t, ctx))

/** Whether a script or SQL text names a learning-data file or glob (the directory alone does not). */
export const textNamesDataFile = (text: string, ctx: Ctx): boolean => pathTokens(text).some(t => isDataFileOrGlob(t, ctx))
