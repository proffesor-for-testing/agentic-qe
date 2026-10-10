/**
 * PowerShell variables and splats for the guard: `$p = ...` binds what its
 * right side may hold, and `$p`, `$p.FullName` and `@p` are read as those
 * values before a statement is judged. A right side that names the store, or
 * a listing that reaches it, binds the store; a hashtable or array binds its
 * values (a splat); an unknown `$var` reads as `*`, like an unresolved bash
 * expansion. Pure: no `$`.
 */
import { isData, pathTokens, textNamesData, type Ctx } from './context'

/** Variables bound so far on the line, by lower-case name. */
export type PsVars = Map<string, readonly string[]>

/** Automatic variables left as written (`$_` in a pipeline block, `$true`, `$env:X`, `$PWD`). */
const AUTOMATIC = new Set(['_', 'psitem', 'true', 'false', 'null', 'pwd', 'home', 'env', 'args', 'input', 'this', 'pshome', 'psscriptroot', 'lastexitcode', 'error', 'host', 'profile', 'matches'])
/** A variable or splat reference, with any `.Property` after it. */
const REF = /(?<![\w.`])([$@])\{?([A-Za-z_]\w*)\}?((?:\.\w+)*)/g

const unquote = (v: string): string => v.trim().replace(/^(['"])([\s\S]*)\1$/, '$2')

/** `$name = <rhs>` / `$name += <rhs>` as a statement: the name, the right side, and whether it appends. */
export const assignment = (statement: string): { name: string; rhs: string; append: boolean } | undefined => {
  const m = /^\$\{?([A-Za-z_]\w*)\}?\s*(\+?)=(?!=)\s*([\s\S]+)$/.exec(statement.trim())
  return m === null ? undefined : { name: (m[1] as string).toLowerCase(), rhs: m[3] as string, append: m[2] === '+' }
}

/** `foreach ($d in <expr>)`: the loop variable and its source, or undefined. */
export const foreachOf = (statement: string): { name: string; source: string } | undefined => {
  const m = /^foreach\s*\(\s*\$([A-Za-z_]\w*)\s+in\s+([^)]*)\)/i.exec(statement.trim())
  return m === null ? undefined : { name: (m[1] as string).toLowerCase(), source: m[2] as string }
}

/**
 * What a right side may hold. `feeds` says whether a command lists the store
 * (`Get-ChildItem .agentic-qe -Filter *.db`).
 */
export function rhsValues(rhs: string, ctx: Ctx, feeds: (text: string) => boolean): readonly string[] {
  const t = rhs.trim()
  const hash = /^@\{([\s\S]*)\}$/.exec(t)
  if (hash !== null) {
    // A splat: `@{Path='.agentic-qe'; Recurse=$true}` reads as `-Path .agentic-qe -Recurse`.
    return (hash[1] as string).split(/[;\n]/).flatMap(entry => {
      const m = /^\s*['"]?([A-Za-z_]\w*)['"]?\s*=\s*([\s\S]*?)\s*$/.exec(entry)
      if (m === null) return []
      const v = unquote(m[2] as string)
      if (/^\$true$/i.test(v)) return [`-${m[1] as string}`]
      if (/^\$false$/i.test(v)) return []
      return [`-${m[1] as string}`, v]
    })
  }
  // `@(...)`, `(...)`, `$(...)` around a command: what that command yields (`@(Get-ChildItem -Recurse -Filter *.db)`).
  const group = /^[@$]?\(([\s\S]*)\)((?:\.\w+)*)$/.exec(t)?.[1]
  const literals = (v: string) => /^\s*(['"][^'"]*['"]\s*,\s*)*['"][^'"]*['"]\s*$/.test(v) || v.trim() === ''
  if (group !== undefined && !literals(group)) return rhsValues(group, ctx, feeds)
  const array = group ?? (/^(['"][^'"]*['"]\s*,\s*)+['"][^'"]*['"]$/.test(t) ? t : undefined)
  if (array !== undefined) return array.split(',').map(unquote).filter(v => v !== '')
  const literal = /^(['"])([^'"]*)\1$/.exec(t)
  if (literal !== null) return [literal[2] as string]
  const slashed = t.replace(/\\/g, '/')
  if (textNamesData(slashed, ctx)) return [...new Set(pathTokens(slashed).filter(x => isData(x, ctx))), '.agentic-qe/memory.db']
  if (feeds(t)) return ['.agentic-qe/memory.db']
  return ['*']
}

/** Whether text uses a `$variable` that is neither bound nor automatic. */
export function hasUnknownVar(text: string, vars: PsVars): boolean {
  for (const m of text.matchAll(REF)) {
    const key = (m[2] as string).toLowerCase()
    if (m[1] === '$' && !vars.has(key) && !AUTOMATIC.has(key)) return true
  }
  return false
}

/** Text with bound `$name`, `$name.Prop` and `@name` replaced by their values, and unknown `$name` by `*`. */
export function substitute(text: string, vars: PsVars): string {
  return text.replace(REF, (whole, sigil: string, name: string) => {
    const key = name.toLowerCase()
    const values = vars.get(key)
    if (values !== undefined) return values.map(v => (/\s/.test(v) ? `'${v}'` : v)).join(' ')
    if (sigil === '@' || AUTOMATIC.has(key)) return whole
    return '*'
  })
}
