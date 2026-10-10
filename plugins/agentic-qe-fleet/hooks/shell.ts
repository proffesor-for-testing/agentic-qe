/**
 * A small, quote-aware reader for the shell commands the guard judges.
 *
 * Pure: no `$`, no imports. It is not a shell: it reads just enough of bash to
 * find each simple command, its words as the command will see them (quotes
 * removed, escapes applied, `$(...)` kept inside its word), its redirects,
 * the text fed to its stdin (heredocs, here-strings, the stages piped into it),
 * and the commands inside `$(...)`, backticks and `<(...)`, which it reads as
 * commands of their own. Anything it cannot read stays in a word, so the guard
 * errs toward judging more, never less.
 */

/** A redirect on one simple command: its operator and target word. */
export type Redirect = { readonly op: string; readonly target: string }

/** One simple command. */
export type Segment = {
  /** Its words as the command sees them, redirects removed. */
  readonly words: readonly string[]
  /** For each word, whether any of it was quoted (the shell does not brace-expand quoted text). */
  readonly quoted: readonly boolean[]
  readonly redirects: readonly Redirect[]
  /** Heredoc and here-string bodies fed to its stdin ('' when none). */
  readonly stdin: string
  /** True when an earlier pipeline stage feeds its stdin. */
  readonly piped: boolean
  /** The words and stdin of the earlier stages of its pipeline ('' when none). */
  readonly upstream: string
}

type Building = {
  words: string[]
  quoted: boolean[]
  redirects: Redirect[]
  stdin: string
  pipeline: number
  stage: number
}

type Heredoc = { readonly seg: Building; readonly delim: string; readonly strip: boolean; readonly literal: boolean }

/** Reads a `$(`, `<(` or `>(` body from just past its `(`; returns the inner text and the index of the closing `)`. */
function readParen(src: string, from: number): { inner: string; end: number } {
  let depth = 1
  let quote: string | undefined
  for (let i = from; i < src.length; i++) {
    const c = src[i] as string
    if (quote !== undefined) {
      if (c === '\\' && quote === '"') i++
      else if (c === quote) quote = undefined
      continue
    }
    if (c === '\\') i++
    else if (c === "'" || c === '"') quote = c
    else if (c === '(') depth++
    else if (c === ')' && --depth === 0) return { inner: src.slice(from, i), end: i }
  }
  return { inner: src.slice(from), end: src.length }
}

/** Reads a backtick body from just past the opening backtick. */
function readBacktick(src: string, from: number): { inner: string; end: number } {
  for (let i = from; i < src.length; i++) {
    if (src[i] === '\\') i++
    else if (src[i] === '`') return { inner: src.slice(from, i), end: i }
  }
  return { inner: src.slice(from), end: src.length }
}

/** The command substitutions (`$(...)`, backticks) inside text the shell expands, such as an unquoted heredoc body. */
export function substitutions(text: string): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '$' && text[i + 1] === '(') {
      const r = readParen(text, i + 2)
      out.push(r.inner)
      i = r.end
    } else if (text[i] === '`') {
      const r = readBacktick(text, i + 1)
      out.push(r.inner)
      i = r.end
    }
  }
  return out
}

const REDIRECT = /^(&>>|&>|>>|>\||>&|>|<<<|<<-|<<|<>|<&|<)/

/** Reads a command line into its simple commands, in the order they run (substitutions first). */
export function parse(src: string, depth = 0): Segment[] {
  /** What runs, in order: a substitution's commands before the command that holds it. */
  const order: Array<Building | Segment> = []
  let pipeline = 0
  let seg: Building = { words: [], quoted: [], redirects: [], stdin: '', pipeline, stage: 0 }
  let word = ''
  let started = false
  let wasQuoted = false
  let pendingOp: string | undefined
  const heredocs: Heredoc[] = []

  const nested = (inner: string) => {
    if (depth < 8) order.push(...parse(inner, depth + 1))
  }
  const endWord = () => {
    if (!started) return
    if (pendingOp === '<<' || pendingOp === '<<-') heredocs.push({ seg, delim: word, strip: pendingOp === '<<-', literal: wasQuoted })
    else if (pendingOp === '<<<') seg.stdin += `${word}\n`
    else if (pendingOp !== undefined) seg.redirects.push({ op: pendingOp, target: word })
    else {
      seg.words.push(word)
      seg.quoted.push(wasQuoted)
    }
    pendingOp = undefined
    word = ''
    started = false
    wasQuoted = false
  }
  const endSegment = (pipe: boolean) => {
    endWord()
    pendingOp = undefined
    if (seg.words.length > 0 || seg.redirects.length > 0 || heredocs.some(h => h.seg === seg)) order.push(seg)
    const stage = pipe ? seg.stage + 1 : 0
    if (!pipe) pipeline++
    seg = { words: [], quoted: [], redirects: [], stdin: '', pipeline, stage }
  }
  const readHeredocs = (from: number): number => {
    let i = from
    while (heredocs.length > 0) {
      const h = heredocs.shift() as Heredoc
      const body: string[] = []
      while (i < src.length) {
        const nl = src.indexOf('\n', i)
        const line = src.slice(i, nl === -1 ? src.length : nl)
        i = nl === -1 ? src.length : nl + 1
        if ((h.strip ? line.replace(/^\t+/, '') : line) === h.delim) break
        body.push(line)
      }
      const text = body.join('\n')
      h.seg.stdin += `${text}\n`
      if (!h.literal) for (const s of substitutions(text)) nested(s)
    }
    return i
  }

  let quote: '"' | "'" | undefined
  for (let i = 0; i < src.length; i++) {
    const c = src[i] as string
    const next = src[i + 1]
    if (quote === "'") {
      if (c === "'") quote = undefined
      else word += c
      continue
    }
    if (quote === '"') {
      if (c === '"') quote = undefined
      else if (c === '\\' && next !== undefined && '$`"\\\n'.includes(next)) {
        if (next !== '\n') word += next
        i++
      } else if (c === '$' && next === '(') {
        const r = readParen(src, i + 2)
        nested(r.inner)
        word += src.slice(i, r.end + 1)
        i = r.end
      } else if (c === '`') {
        const r = readBacktick(src, i + 1)
        nested(r.inner)
        word += src.slice(i, r.end + 1)
        i = r.end
      } else word += c
      continue
    }
    if (c === ' ' || c === '\t') endWord()
    else if (c === '\n') {
      endSegment(false)
      i = readHeredocs(i + 1) - 1
    } else if (c === '#' && !started) {
      const nl = src.indexOf('\n', i)
      i = (nl === -1 ? src.length : nl) - 1
    } else if (c === "'" || c === '"') {
      quote = c
      started = true
      wasQuoted = true
    } else if (c === '$' && next === "'") {
      // ANSI-C quoting: read to the closing quote; escapes other than \' are kept as written.
      let j = i + 2
      for (; j < src.length && src[j] !== "'"; j++) {
        if (src[j] === '\\' && j + 1 < src.length) {
          word += src[j + 1] === "'" ? "'" : `\\${src[j + 1]}`
          j++
        } else word += src[j]
      }
      started = true
      wasQuoted = true
      i = j
    } else if ((c === '$' || ((c === '<' || c === '>') && !started)) && next === '(') {
      const r = readParen(src, i + 2)
      nested(r.inner)
      word += src.slice(i, r.end + 1)
      started = true
      i = r.end
    } else if (c === '`') {
      const r = readBacktick(src, i + 1)
      nested(r.inner)
      word += src.slice(i, r.end + 1)
      started = true
      i = r.end
    } else if (c === '\\') {
      if (next === '\n') i++
      else if (next !== undefined) {
        word += next
        started = true
        i++
      }
    } else if (c === ';') {
      if (next === ';' || next === '&') i++
      endSegment(false)
    } else if (c === '&' && next === '&') {
      endSegment(false)
      i++
    } else if (c === '|' && next === '|') {
      endSegment(false)
      i++
    } else if (c === '|') {
      if (next === '&') i++
      endSegment(true)
    } else if (c === '(' || c === ')') endSegment(false)
    else if (c === '>' || c === '<' || (c === '&' && next === '>')) {
      const m = REDIRECT.exec(src.slice(i)) as RegExpExecArray
      const op = m[0]
      // A numeric word right before is the fd (`2>`), not an argument.
      if (started && !wasQuoted && /^\d+$/.test(word)) {
        word = ''
        started = false
      } else endWord()
      i += op.length - 1
      const dup = (op === '>&' || op === '<&') && /^\s*[\d-]/.test(src.slice(i + 1))
      if (dup) {
        const m2 = /^\s*[\d-]+/.exec(src.slice(i + 1)) as RegExpExecArray
        i += m2[0].length
      } else pendingOp = op === '>&' ? '>' : op
    } else if (c === '&') endSegment(false)
    else {
      word += c
      started = true
    }
  }
  endSegment(false)
  readHeredocs(src.length)

  const built = order.filter((o): o is Building => 'pipeline' in o)
  return order.map(o => {
    if (!('pipeline' in o)) return o
    const upstream = built
      .filter(u => u.pipeline === o.pipeline && u.stage < o.stage)
      .map(u => `${u.words.join(' ')}\n${u.stdin}`)
      .join('\n')
    return { words: o.words, quoted: o.quoted, redirects: o.redirects, stdin: o.stdin, piped: o.stage > 0, upstream }
  })
}

/** Splits a command line into the text of its simple commands (words joined by spaces). */
export const segments = (command: string): string[] => parse(command).map(s => s.words.join(' '))

/** Words of one command line, as the commands see them. */
export const words = (command: string): string[] => parse(command).flatMap(s => [...s.words])

const RANGE_NUM = /^(-?\d+)\.\.(-?\d+)$/
const RANGE_CHAR = /^([A-Za-z])\.\.([A-Za-z])$/

/** The alternatives of the first expandable `{...}` in a word, or undefined. */
function firstBrace(w: string): { start: number; end: number; alts: string[] } | undefined {
  for (let i = 0; i < w.length; i++) {
    if (w[i] !== '{' || w[i - 1] === '$') continue
    let depth = 0
    const cuts: number[] = []
    let end = -1
    for (let j = i; j < w.length; j++) {
      if (w[j] === '{') depth++
      else if (w[j] === '}' && --depth === 0) {
        end = j
        break
      } else if (w[j] === ',' && depth === 1) cuts.push(j)
    }
    if (end === -1) return undefined
    const inner = w.slice(i + 1, end)
    if (cuts.length > 0) {
      const alts: string[] = []
      let from = i + 1
      for (const cut of [...cuts, end]) {
        alts.push(w.slice(from, cut))
        from = cut + 1
      }
      return { start: i, end, alts }
    }
    const num = RANGE_NUM.exec(inner)
    const chr = RANGE_CHAR.exec(inner)
    if (num !== null || chr !== null) {
      const a = num !== null ? Number(num[1]) : (chr?.[1] as string).charCodeAt(0)
      const b = num !== null ? Number(num[2]) : (chr?.[2] as string).charCodeAt(0)
      const alts: string[] = []
      const step = a <= b ? 1 : -1
      for (let k = a; alts.length <= 1024 && (step > 0 ? k <= b : k >= b); k += step) alts.push(num !== null ? String(k) : String.fromCharCode(k))
      return { start: i, end, alts }
    }
  }
  return undefined
}

/**
 * Bash brace expansion of one word (`memory.db{,-wal}`, `memory.{db,db-wal}`,
 * nested `{a,{b,c}}`, `{1..3}`). Past `limit` results, each brace group is read
 * as `*` instead, so a huge expansion is judged as the glob it covers.
 */
export function expandBraces(word: string, limit = 256): string[] {
  const out: string[] = []
  let over = false
  const walk = (w: string) => {
    if (over) return
    const b = firstBrace(w)
    if (b === undefined) {
      if (out.length >= limit) over = true
      else out.push(w)
      return
    }
    for (const alt of b.alts) walk(w.slice(0, b.start) + alt + w.slice(b.end + 1))
  }
  walk(word)
  if (!over) return out
  let loose = word
  for (let b = firstBrace(loose); b !== undefined; b = firstBrace(loose)) loose = `${loose.slice(0, b.start)}*${loose.slice(b.end + 1)}`
  return [...out, loose]
}

/** Shell keywords and grouping words that come before a command word (`then rm x`, `! rm x`, `{ rm x; }`). */
export const KEYWORDS = new Set(['!', '{', '}', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', 'fi', 'done', 'esac', 'coproc'])
/** Commands that take a command after them (their own options skipped). */
export const WRAPPERS = new Set([
  'sudo', 'doas', 'env', 'command', 'exec', 'nohup', 'time', 'nice', 'ionice', 'stdbuf', 'builtin', 'xargs', 'timeout', 'chronic', 'unbuffer',
  'npx', 'bunx', 'pnpx', 'watch', 'noglob', 'nocorrect', 'caffeinate',
])
/** Wrapper options that take a separate value (`sudo -u root rm ...`). */
const VALUED = new Set(['-u', '-g', '-C', '-D', '-h', '-p', '-U', '-r', '-t', '-n', '-I', '-L', '-P', '-s', '-k', '--signal', '--kill-after', '--user', '--group', '--package', '--interval'])

export const isOption = (w: string): boolean => w.startsWith('-') && w !== '-'

/**
 * The command word's index, past assignments, keywords, `function NAME`,
 * wrappers and their options. `isVerb` says whether a word is a command the
 * guard judges, so a valued-looking flag does not swallow it (`sudo -n rm x`).
 */
export function commandStart(ws: readonly string[], isVerb: (w: string) => boolean, from = 0): number {
  let i = from
  while (i < ws.length) {
    const w = ws[i] as string
    const name = w.replace(/^.*\//, '')
    if (/^[A-Za-z_][A-Za-z0-9_]*\+?=/.test(w) || KEYWORDS.has(w)) i++
    else if (w === 'function') i += 2
    else if (WRAPPERS.has(name)) {
      i++
      while (i < ws.length && (isOption(ws[i] as string) || /^\d+(\.\d+)?[smhd]?$/.test(ws[i] as string))) {
        const after = ws[i + 1]
        i += VALUED.has(ws[i] as string) && after !== undefined && !isVerb(after) ? 2 : 1
      }
    } else return i
  }
  return i
}
