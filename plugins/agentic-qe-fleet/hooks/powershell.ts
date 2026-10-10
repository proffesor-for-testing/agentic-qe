/**
 * The guard's reading of a PowerShell tool command: Remove-Item, Move-Item,
 * Copy-Item, Set-Content, New-Item -Force and friends (and their aliases) on
 * learning data, `>` redirects, .NET file APIs, `cmd /c`, `Start-Process`,
 * `Invoke-Expression`/`iex` and `& { ... }` script blocks, and pipelines where
 * an earlier stage lists the store (`gci .agentic-qe *.db | Remove-Item`).
 * Anything else in a stage (sqlite3, git, python -c, ...) is read by the
 * shell rules. Pure: no `$`.
 */
import { holdsAqe } from './commands'
import { isData, isDataFileOrGlob, kindOf, textNamesData, type Ctx } from './context'
import { DATA_FILE, baseName, globMatches, globReachesData, underAqe } from './paths'
import { assignment, foreachOf, hasUnknownVar, rhsValues, substitute, type PsVars } from './psvars'

const DELETE = new Set(['remove-item', 'rm', 'del', 'erase', 'rd', 'rmdir', 'ri'])
const MOVE = new Set(['move-item', 'mv', 'move', 'mi'])
const COPY = new Set(['copy-item', 'cp', 'copy', 'cpi', 'cpp'])
const RENAME = new Set(['rename-item', 'ren', 'rni'])
const WRITE = new Set(['set-content', 'sc', 'clear-content', 'clc', 'out-file', 'add-content', 'ac', 'tee-object', 'tee'])
const CREATE = new Set(['new-item', 'ni'])
const CD = new Set(['cd', 'set-location', 'sl', 'chdir', 'pushd', 'push-location'])
const LIST = new Set(['get-childitem', 'gci', 'ls', 'dir'])
const EXPR = new Set(['invoke-expression', 'iex'])
const START = new Set(['start-process', 'saps', 'start'])
const PWSH = /^(pwsh|powershell)(\.exe)?$/
/** A downstream stage that destroys what is piped to it. */
const CONSUMES = /(^|[\s{;(])(remove-item|ri|rm|del|erase|rd|rmdir|move-item|mv|move|mi|clear-content|clc|set-content|sc|rename-item|ren|rni)(?=$|[\s;})])|\.delete\s*\(/i
/** .NET file APIs that delete, move or overwrite. */
const DOTNET = /\[(System\.)?IO\.(File|Directory|FileInfo|DirectoryInfo)\]::(Delete|Move|Copy|Replace|WriteAll\w*|AppendAll\w*|Create\w*|Open\w*)\b|\.Delete\s*\(/i
/** Names and extensions of the store's files and directory, for literal Where-Object filters. */
const STORE_NAMES = ['memory.db', 'memory.db-wal', 'memory.db-shm', 'memory.db-journal', 'brain.rvf', '.agentic-qe']
const STORE_EXTENSIONS = ['.db', '.db-wal', '.db-shm', '.db-journal', '.rvf', '.agentic-qe']
/** A `(...)`, `@(...)` or `$(...)` group inside a stage (one level of nesting). */
const GROUP = /[@$]?\(((?:[^()]|\([^()]*\))*)\)/g
/** `$x.Delete(...)` / `$x.MoveTo(...)` on a variable. */
const METHOD_ON_VAR = /\$\{?([A-Za-z_]\w*)\}?\.(delete|moveto)\s*\(/gi

/**
 * Whether a stage is a Where-Object filter on Name or Extension, by `-eq`, `-like` or `-match`
 * against a literal that cannot match a store file or the directory (`Where-Object Extension -eq '.tmp'`).
 */
function narrowsAwayFromStore(stage: string): boolean {
  if (!/^\s*(where-object|where|\?)(\s|\{|$)/i.test(stage)) return false
  // A literal: single-quoted (where `$` is literal), or double-quoted without `$` (no expansion).
  const m = /(?:\$_\.)?\b(name|extension)\s+-[ic]?(eq|like|match)\s+(?:'([^']*)'|"([^"$]*)")/i.exec(stage)
  if (m === null) return false
  const candidates = (m[1] as string).toLowerCase() === 'name' ? STORE_NAMES : STORE_EXTENSIONS
  const literal = (m[3] ?? m[4]) as string
  const op = (m[2] as string).toLowerCase()
  if (op === 'eq') return candidates.every(c => c.toLowerCase() !== literal.toLowerCase())
  if (op === 'like') return candidates.every(c => !globMatches(literal, c))
  try {
    const re = new RegExp(literal, 'i')
    return candidates.every(c => !re.test(c))
  } catch {
    return false
  }
}

/** How deep `iex`, `& { }` and `Start-Process` text is followed before naming the store at all is refused. */
const MAX_DEPTH = 6

/** Splits at top-level separators (outside quotes, braces and parentheses; backtick escapes). */
function splitTop(command: string, at: (c: string, next: string | undefined) => boolean): string[] {
  const out: string[] = []
  let cur = ''
  let quote: string | undefined
  let depth = 0
  for (let i = 0; i < command.length; i++) {
    const c = command[i] as string
    if (quote !== undefined) {
      if (c === quote) quote = undefined
      cur += c
    } else if (c === '`') {
      cur += command[i + 1] ?? ''
      i++
    } else if (c === "'" || c === '"') {
      quote = c
      cur += c
    } else if (c === '{' || c === '(') {
      depth++
      cur += c
    } else if (c === '}' || c === ')') {
      depth = Math.max(0, depth - 1)
      cur += c
    } else if (depth === 0 && at(c, command[i + 1])) {
      if (command[i + 1] === c) i++
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map(s => s.trim()).filter(s => s !== '')
}

const statements = (command: string): string[] => splitTop(command, (c, n) => c === ';' || c === '\n' || (c === '&' && n === '&') || (c === '|' && n === '|'))
const stages = (statement: string): string[] => splitTop(statement, (c, n) => c === '|' && n !== '|')

/** Words of one stage, quotes and grouping parentheses removed, backslashes kept (they are path separators here). */
const psWords = (seg: string): string[] =>
  [...seg.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)]
    .map(m => m[1] ?? m[2] ?? m[3] ?? '')
    .map(w => w.replace(/^-\w+:(?=.)/, '').replace(/^[@$]?\(+|\)+$/g, ''))

/** Redirect targets (`>`, `>>`, `*>`, `2>`). */
const psRedirects = (seg: string): string[] => [...seg.matchAll(/(?:^|[^-])[*\d]?>{1,2}\s*(['"]?)([^\s'"]+)\1/g)].map(m => m[2] ?? '')

/** The value of a named parameter (`-Destination X`, `-Path X`), case-insensitively. */
function param(ws: readonly string[], ...names: string[]): string | undefined {
  const i = ws.findIndex(w => names.some(n => w.toLowerCase() === `-${n}`))
  return i === -1 ? undefined : ws[i + 1]
}

/** Whether a switch is given, by any unambiguous prefix PowerShell accepts (`-r`, `-rec`, `-Recurse`). */
const hasSwitch = (ws: readonly string[], name: string, min: number): boolean =>
  ws.some(w => w.startsWith('-') && w.length - 1 >= min && name.startsWith(w.slice(1).toLowerCase()))

/** Operands: words that are not `-Param` names (a parameter's value counts as an operand). */
const operands = (ws: readonly string[]): string[] => ws.filter(w => !/^-[A-Za-z]/.test(w))

/** The verb of a stage (past a leading `&`/`.` call operator) and its argument words. */
function verbOf(seg: string): { verb: string; args: string[] } {
  const ws = psWords(seg)
  const call = ws[0] === '&' || ws[0] === '.'
  return { verb: baseName(call ? (ws[1] ?? '') : (ws[0] ?? '')).toLowerCase(), args: call ? ws.slice(2) : ws.slice(1) }
}

/**
 * Whether a stage hands the store to the next one: it names it; it lists recursively from
 * where it may be; it lists hidden items (`-Force`, `-Hidden`) for a recursive delete; or it
 * lists inside `.agentic-qe` (after `sl .agentic-qe`).
 */
function feedsStore(seg: string, ctx: Ctx, recursiveConsumer = false): boolean {
  if (textNamesData(seg.replace(/\\/g, '/'), ctx)) return true
  const { verb, args } = verbOf(seg)
  if (!LIST.has(verb)) return false
  const hidden = hasSwitch(args, 'force', 2) || hasSwitch(args, 'hidden', 2)
  if (!hasSwitch(args, 'recurse', 1) && !(hidden && recursiveConsumer) && !ctx.inAqe) return false
  const ops = operands(args)
  // The listing root: -Path, or the first operand unless it is a bare pattern (`ls -r *.db` lists from here).
  const first = ops[0]
  const path = param(args, 'path', 'literalpath') ?? (first !== undefined && !(/[*?]/.test(first) && !/[\\/]/.test(first)) ? first : undefined)
  if (path !== undefined && !holdsAqe(path.replace(/\\/g, '/'), ctx) && !underAqe(path.replace(/\\/g, '/'), ctx.inAqe)) return false
  const patterns = [param(args, 'filter'), param(args, 'include'), ...ops.filter(o => o !== path)].filter((p): p is string => p !== undefined)
  return patterns.length === 0 || patterns.some(p => globReachesData(baseName(p)) || globMatches(baseName(p), '.agentic-qe'))
}

function judgePsSegment(seg: string, ctx: Ctx, depth: number): string | undefined {
  const redirect = psRedirects(seg).find(t => isDataFileOrGlob(t, ctx))
  if (redirect !== undefined) return `a PowerShell redirect overwrites ${redirect}`
  // A .NET file API on the store, or on an argument the guard cannot resolve (an unknown `$p`, read as `*`).
  if (DOTNET.test(seg) && (textNamesData(seg.replace(/\\/g, '/'), ctx) || /\(\s*['"]?\*/.test(seg))) return 'a .NET file API deletes or overwrites AQE learning data'
  // A script block (`& { ... }`, `ForEach-Object { ... }`) is read as PowerShell of its own.
  for (const block of seg.matchAll(/\{([^{}]*)\}/g)) {
    const what = judgePowerShell(block[1] ?? '', ctx, depth + 1)
    if (what !== undefined) return what
  }
  const { verb, args } = verbOf(seg)
  const ops = operands(args)
  if (CD.has(verb)) {
    const t = ops[0]
    if (t !== undefined) ctx.inAqe = underAqe(t, ctx.inAqe) && !t.startsWith('..')
    return undefined
  }
  if (verb === 'cmd' || verb === 'cmd.exe') {
    const c = args.findIndex(a => /^\/[ck]$/i.test(a))
    return c === -1 ? undefined : judgePowerShell(args.slice(c + 1).join(' '), ctx, depth + 1)
  }
  if (EXPR.has(verb)) return judgePowerShell(ops.join(' '), ctx, depth + 1)
  if (START.has(verb)) {
    // `-ArgumentList '/c','rd','/s','/q','.agentic-qe'` is a comma list; `'-Command ...'` one string.
    const listed = /-(?:argumentlist|args)\s+((?:(?:'[^']*'|"[^"]*"|[^\s,'"]+)\s*,\s*)*(?:'[^']*'|"[^"]*"|[^\s,'"]+))/i.exec(seg)?.[1]
    const list = listed === undefined ? ops.slice(1).join(' ') : listed.split(/\s*,\s*/).map(a => a.replace(/^(['"])([\s\S]*)\1$/, '$2')).join(' ')
    const file = param(args, 'filepath') ?? ops[0] ?? ''
    return judgePowerShell(`${file} ${list}`, ctx, depth + 1)
  }
  if (PWSH.test(verb)) {
    const c = args.findIndex(a => /^-(c|command|encodedcommand|ec|e)$/i.test(a))
    if (c === -1) return undefined
    if (/^-(encodedcommand|ec|e)$/i.test(args[c] as string)) return `\`${verb} -EncodedCommand\` runs a script the guard cannot read`
    return judgePowerShell(args.slice(c + 1).join(' '), ctx, depth + 1)
  }
  if (DELETE.has(verb)) {
    const hit = ops.find(a => isData(a, ctx))
    if (hit !== undefined) return `\`${verb}\` on ${hit}`
    return textNamesData(seg.replace(/\\/g, '/'), ctx) ? `\`${verb}\` on what names AQE learning data` : undefined
  }
  if (MOVE.has(verb) || RENAME.has(verb)) {
    const dest = param(args, 'destination', 'newname') ?? (ops.length > 1 ? ops[ops.length - 1] : undefined)
    const src = ops.filter(o => o !== dest)
    const moved = src.find(a => isData(a, ctx))
    if (moved !== undefined) return `\`${verb}\` moves ${moved} away`
    return dest !== undefined && isDataFileOrGlob(dest, ctx) ? `\`${verb}\` overwrites ${dest}` : undefined
  }
  if (COPY.has(verb)) {
    const dest = param(args, 'destination') ?? ops[ops.length - 1]
    if (dest === undefined || ops.length < 2) return undefined
    const k = kindOf(dest, ctx)
    const src = ops.filter(o => o !== dest)
    if (k === 'file' || k === 'glob' || (k === 'dir' && src.some(s => DATA_FILE.test(baseName(s))))) return `\`${verb}\` overwrites ${dest}`
    return undefined
  }
  if (WRITE.has(verb)) {
    const target = param(args, 'path', 'literalpath', 'filepath') ?? ops.find(o => isDataFileOrGlob(o, ctx)) ?? ops[0]
    return target !== undefined && isDataFileOrGlob(target, ctx) ? `\`${verb}\` writes ${target}` : undefined
  }
  // New-Item -Force replaces an existing file with an empty one.
  if (CREATE.has(verb) && hasSwitch(args, 'force', 2)) {
    const hit = ops.find(o => isDataFileOrGlob(o, ctx))
    return hit === undefined ? undefined : `\`${verb} -Force\` replaces ${hit}`
  }
  // Not a PowerShell file cmdlet: read it as a shell command (sqlite3, git, python -c, bash -c ...).
  return ctx.bash(seg.replace(/\\/g, '/'), ctx)
}

/** The refusal reason for a PowerShell command line, or undefined. Variables bound on the line are read through. */
export function judgePowerShell(command: string, ctx: Ctx, depth = 0, vars: PsVars = new Map()): string | undefined {
  if (depth > MAX_DEPTH) return /agentic/i.test(command) ? 'PowerShell nested too deeply to read names learning data' : undefined
  for (const raw of statements(command)) {
    // `iex` of text holding a variable the guard cannot resolve: it cannot read what runs.
    if (/^(iex|invoke-expression)\b/i.test(raw.trim()) && hasUnknownVar(raw, vars)) return '`Invoke-Expression` runs text the guard cannot read'
    const loop = foreachOf(raw)
    if (loop !== undefined) vars.set(loop.name, rhsValues(substitute(loop.source, vars), ctx, t => feedsStore(t, ctx, true)))
    // `$db.Delete()`, `$f.MoveTo(...)` on a variable that holds the store or a listing of it.
    for (const m of raw.matchAll(METHOD_ON_VAR)) {
      if ((vars.get((m[1] as string).toLowerCase()) ?? []).some(v => isData(v.replace(/\\/g, '/'), ctx))) return `\`$${m[1] as string}.${m[2] as string}()\` on AQE learning data`
    }
    const bound = assignment(raw)
    const statement = substitute(bound === undefined ? raw : bound.rhs, vars)
    const parts = stages(statement)
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] as string
      const what = judgePsSegment(part, ctx, depth)
      if (what !== undefined) return what
      const recursive = hasSwitch(verbOf(part).args, 'recurse', 1)
      if (CONSUMES.test(part)) {
        // A `(...)`/`@(...)`/`$(...)` argument is a stage of its own (`Remove-Item (gci -r -Filter *.db)`).
        for (const g of part.matchAll(GROUP)) if (feedsStore(g[1] as string, ctx, recursive)) return `\`${verbOf(part).verb}\` is handed AQE learning data by \`(${(g[1] as string).trim()})\``
        // Data flow: a destroying stage fed by one that names, lists recursively or lists hidden items of the store,
        // unless a literal Where-Object filter in between cannot pass a store file.
        const fed = parts.slice(0, i).some((up, j) => feedsStore(up, ctx, recursive) && !parts.slice(j + 1, i).some(narrowsAwayFromStore))
        if (i > 0 && fed) return `a PowerShell pipeline feeds AQE learning data to \`${verbOf(part).verb}\``
      }
      // `-OutVariable dbs` / `-ov dbs`: the variable holds what this stage outputs.
      const ov = /-(?:outvariable|ov)\s+\+?([A-Za-z_]\w*)/i.exec(part)
      if (ov !== null) vars.set((ov[1] as string).toLowerCase(), rhsValues(part, ctx, t => feedsStore(t, ctx, true)))
    }
    if (bound !== undefined) {
      const values = rhsValues(statement, ctx, t => feedsStore(t, ctx, true))
      vars.set(bound.name, bound.append ? [...(vars.get(bound.name) ?? []), ...values] : values)
    }
  }
  return undefined
}
