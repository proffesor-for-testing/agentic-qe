/**
 * The guard's reading of a PowerShell tool command: Remove-Item, Move-Item,
 * Copy-Item, Set-Content and friends (and their aliases) on learning data,
 * `>` redirects, .NET file APIs, and `cmd /c`. Anything else in a segment
 * (sqlite3, git, python -c, ...) is read by the shell rules. Pure: no `$`.
 */
import { isData, isDataFileOrGlob, kindOf, textNamesData, type Ctx } from './context'
import { DATA_FILE, baseName, underAqe } from './paths'

const DELETE = new Set(['remove-item', 'rm', 'del', 'erase', 'rd', 'rmdir', 'ri'])
const MOVE = new Set(['move-item', 'mv', 'move', 'mi'])
const COPY = new Set(['copy-item', 'cp', 'copy', 'cpi', 'cpp'])
const RENAME = new Set(['rename-item', 'ren', 'rni'])
const WRITE = new Set(['set-content', 'sc', 'clear-content', 'clc', 'out-file', 'add-content', 'ac', 'tee-object', 'tee', 'new-item', 'ni'])
const CD = new Set(['cd', 'set-location', 'sl', 'chdir', 'pushd', 'push-location'])
/** .NET file APIs that delete, move or overwrite. */
const DOTNET = /\[(System\.)?IO\.(File|Directory|FileInfo|DirectoryInfo)\]::(Delete|Move|Copy|Replace|WriteAll\w*|AppendAll\w*|Create\w*|Open\w*)\b|\.Delete\s*\(/i

/** Splits at unquoted `;`, `|`, `&&`, `||` and newlines (backtick is PowerShell's escape). */
function psSegments(command: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: string | undefined
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
    } else if (c === ';' || c === '|' || c === '\n' || (c === '&' && command[i + 1] === '&')) {
      if (command[i + 1] === c) i++
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map(s => s.trim()).filter(s => s !== '')
}

/** Words of one segment, quotes removed, backslashes kept (they are path separators here). */
const psWords = (seg: string): string[] =>
  [...seg.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)].map(m => m[1] ?? m[2] ?? m[3] ?? '').map(w => w.replace(/^-\w+:(?=.)/, ''))

/** Redirect targets (`>`, `>>`, `*>`, `2>`). */
const psRedirects = (seg: string): string[] => [...seg.matchAll(/(?:^|[^-])[*\d]?>{1,2}\s*(['"]?)([^\s'"]+)\1/g)].map(m => m[2] ?? '')

/** The value of a named parameter (`-Destination X`, `-Path X`), case-insensitively. */
function param(ws: readonly string[], ...names: string[]): string | undefined {
  const i = ws.findIndex(w => names.some(n => w.toLowerCase() === `-${n}`))
  return i === -1 ? undefined : ws[i + 1]
}

/** Operands: words that are not `-Param` names (a parameter's value counts as an operand). */
const operands = (ws: readonly string[]): string[] => ws.filter(w => !/^-[A-Za-z]/.test(w))

function judgePsSegment(seg: string, ctx: Ctx): string | undefined {
  const redirect = psRedirects(seg).find(t => isDataFileOrGlob(t, ctx))
  if (redirect !== undefined) return `a PowerShell redirect overwrites ${redirect}`
  if (DOTNET.test(seg) && textNamesData(seg.replace(/\\/g, '/'), ctx)) return 'a .NET file API deletes or overwrites AQE learning data'
  const ws = psWords(seg)
  const verb = baseName((ws[0] ?? '').replace(/^[&.]$/, '')).toLowerCase() || baseName(ws[1] ?? '').toLowerCase()
  const args = ws[0] === '&' || ws[0] === '.' ? ws.slice(2) : ws.slice(1)
  const ops = operands(args)
  if (CD.has(verb)) {
    const t = ops[0]
    if (t !== undefined) ctx.inAqe = underAqe(t, ctx.inAqe) && !t.startsWith('..')
    return undefined
  }
  if (verb === 'cmd' || verb === 'cmd.exe') {
    const c = args.findIndex(a => /^\/[ck]$/i.test(a))
    return c === -1 ? undefined : judgePowerShell(args.slice(c + 1).join(' '), ctx)
  }
  if (DELETE.has(verb)) {
    const hit = ops.find(a => isData(a, ctx))
    return hit === undefined ? undefined : `\`${verb}\` on ${hit}`
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
    const target = param(args, 'path', 'literalpath', 'filepath') ?? ops[0]
    return target !== undefined && isDataFileOrGlob(target, ctx) ? `\`${verb}\` writes ${target}` : undefined
  }
  // Not a PowerShell file cmdlet: read it as a shell command (sqlite3, git, python -c, bash -c ...).
  return ctx.bash(seg.replace(/\\/g, '/'), ctx)
}

/** The refusal reason for a PowerShell command line, or undefined. */
export function judgePowerShell(command: string, ctx: Ctx): string | undefined {
  for (const seg of psSegments(command)) {
    const what = judgePsSegment(seg, ctx)
    if (what !== undefined) return what
  }
  return undefined
}
