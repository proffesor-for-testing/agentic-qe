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
/** A downstream stage that destroys what is piped to it. */
const CONSUMES = /(^|[\s{;(])(remove-item|ri|rm|del|erase|rd|rmdir|move-item|mv|move|mi|clear-content|clc|set-content|sc|rename-item|ren|rni)(?=$|[\s;})])/i
/** .NET file APIs that delete, move or overwrite. */
const DOTNET = /\[(System\.)?IO\.(File|Directory|FileInfo|DirectoryInfo)\]::(Delete|Move|Copy|Replace|WriteAll\w*|AppendAll\w*|Create\w*|Open\w*)\b|\.Delete\s*\(/i
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

/** Whether a stage hands the store to the next one: it names it, or lists recursively from where it may be. */
function feedsStore(seg: string, ctx: Ctx): boolean {
  if (textNamesData(seg.replace(/\\/g, '/'), ctx)) return true
  const { verb, args } = verbOf(seg)
  if (!LIST.has(verb) || !hasSwitch(args, 'recurse', 1)) return false
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
  if (DOTNET.test(seg) && textNamesData(seg.replace(/\\/g, '/'), ctx)) return 'a .NET file API deletes or overwrites AQE learning data'
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
    const file = param(args, 'filepath') ?? ops[0] ?? ''
    const list = param(args, 'argumentlist', 'args') ?? ops.slice(1).join(' ')
    return judgePowerShell(`${file} ${list}`, ctx, depth + 1)
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

/** The refusal reason for a PowerShell command line, or undefined. */
export function judgePowerShell(command: string, ctx: Ctx, depth = 0): string | undefined {
  if (depth > MAX_DEPTH) return /agentic/i.test(command) ? 'PowerShell nested too deeply to read names learning data' : undefined
  for (const statement of statements(command)) {
    const parts = stages(statement)
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] as string
      const what = judgePsSegment(part, ctx, depth)
      if (what !== undefined) return what
      // Data flow: a destroying stage fed by one that names or recursively lists the store.
      if (i > 0 && CONSUMES.test(part) && parts.slice(0, i).some(up => feedsStore(up, ctx))) return `a PowerShell pipeline feeds AQE learning data to \`${verbOf(part).verb}\``
    }
  }
  return undefined
}
