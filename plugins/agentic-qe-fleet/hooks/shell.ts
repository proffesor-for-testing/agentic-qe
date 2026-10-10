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

export { BRACE_MAX_DEPTH, BRACE_MAX_LENGTH, expandBraces } from './braces'

/** A redirect on one simple command: its operator and target word. */
export type Redirect = { readonly op: string; readonly target: string }

/** One simple command. */
export type Segment = {
  /** Its words as the command sees them, redirects removed. */
  readonly words: readonly string[]
  /** Each word with its quoted `{`, `}` and `,` masked (see `mask`): only unquoted braces expand. */
  readonly expandable: readonly string[]
  readonly redirects: readonly Redirect[]
  /** Heredoc and here-string bodies fed to its stdin ('' when none). */
  readonly stdin: string
  /** True when an earlier pipeline stage feeds its stdin. */
  readonly piped: boolean
  /** The words and stdin of the earlier stages of its pipeline ('' when none). */
  readonly upstream: string
  /** The words of each earlier stage of its pipeline (`find ... | xargs rm`). */
  readonly stages: readonly (readonly string[])[]
  /** Set on a stand-in segment for a substitution nested past the depth the reader follows: its text, unread. */
  readonly dropped?: string
  /** A heredoc fed to it whose end is not in the text: what it reads is unknown. */
  readonly opaqueStdin?: boolean
}

/** How deep `$(...)` / backtick nesting is read; deeper text is handed back unread, as `dropped`. */
export const MAX_NESTING = 8

/** How many earlier pipeline stages feed a stage (`find | grep | xargs rm` needs two). */
const FEED = 8

type Building = {
  words: string[]
  expandable: string[]
  redirects: Redirect[]
  stdin: string
  pipeline: number
  stage: number
  opaqueStdin?: boolean
}

type Heredoc = { readonly seg: Building; readonly delim: string; readonly strip: boolean; readonly literal: boolean }

/** Quoted `{`, `}` and `,` stand-ins (private-use characters), so brace expansion skips them. */
export const mask = (text: string): string => text.replace(/[{},]/g, c => (c === '{' ? '\uE000' : c === '}' ? '\uE001' : '\uE002'))
export const unmask = (text: string): string => text.replace(/[\uE000-\uE002]/g, c => (c === '\uE000' ? '{' : c === '\uE001' ? '}' : ','))

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

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"', '?': '?' }

/** Reads `$'...'` from just past its opening quote, decoding escapes as bash does; returns the text and the closing quote's index. */
export function readAnsiC(src: string, from: number): { text: string; end: number } {
  let text = ''
  let j = from
  for (; j < src.length && src[j] !== "'"; j++) {
    if (src[j] !== '\\' || j + 1 >= src.length) {
      text += src[j]
      continue
    }
    const e = src[j + 1] as string
    const hex = e === 'x' ? /^[0-9a-fA-F]{1,2}/.exec(src.slice(j + 2, j + 4)) : e === 'u' || e === 'U' ? /^[0-9a-fA-F]{1,8}/.exec(src.slice(j + 2, j + (e === 'u' ? 6 : 10))) : null
    const oct = /^[0-7]{1,3}/.exec(src.slice(j + 1, j + 4))
    if (hex !== null) {
      text += String.fromCodePoint(Math.min(parseInt(hex[0], 16), 0x10ffff))
      j += 1 + hex[0].length
    } else if (oct !== null) {
      text += String.fromCharCode(parseInt(oct[0], 8) & 0xff)
      j += oct[0].length
    } else if (e === 'c' && j + 2 < src.length) {
      text += String.fromCharCode((src.charCodeAt(j + 2) & 0x1f) >>> 0)
      j += 2
    } else {
      text += SIMPLE_ESCAPES[e] ?? `\\${e}`
      j++
    }
  }
  return { text, end: j }
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

const REDIRECT = /&>>|&>|>>|>\||>&|>|<<<|<<-|<<|<>|<&|</y
const FD_DUP = /\s*[\d-]+/y
/** Characters with no meaning to the reader, read as one run. */
const PLAIN = /[^ \t\n'"\\$`;&|()<>]+/y

/** Reads a command line into its simple commands, in the order they run (substitutions first). */
export function parse(src: string, depth = 0): Segment[] {
  /** What runs, in order: a substitution's commands before the command that holds it. */
  const order: Array<Building | Segment> = []
  let pipeline = 0
  let seg: Building = { words: [], expandable: [], redirects: [], stdin: '', pipeline, stage: 0 }
  let word = ''
  /** The word again, quoted braces masked. */
  let ex = ''
  const plain = (t: string) => {
    word += t
    ex += t
  }
  const quoted = (t: string) => {
    word += t
    ex += t.length === 1 ? (t === '{' ? '\uE000' : t === '}' ? '\uE001' : t === ',' ? '\uE002' : t) : mask(t)
  }
  let started = false
  let wasQuoted = false
  let pendingOp: string | undefined
  const heredocs: Heredoc[] = []

  const nested = (inner: string) => {
    if (depth < MAX_NESTING) order.push(...parse(inner, depth + 1))
    else order.push({ words: [], expandable: [], redirects: [], stdin: '', piped: false, upstream: '', stages: [], dropped: inner })
  }
  const endWord = () => {
    if (!started) return
    if (pendingOp === '<<' || pendingOp === '<<-') heredocs.push({ seg, delim: word, strip: pendingOp === '<<-', literal: wasQuoted })
    else if (pendingOp === '<<<') seg.stdin += `${word}\n`
    else if (pendingOp !== undefined) seg.redirects.push({ op: pendingOp, target: word })
    else {
      seg.words.push(word)
      seg.expandable.push(ex)
    }
    pendingOp = undefined
    word = ''
    ex = ''
    started = false
    wasQuoted = false
  }
  const endSegment = (pipe: boolean) => {
    endWord()
    pendingOp = undefined
    if (seg.words.length > 0 || seg.redirects.length > 0 || heredocs.some(h => h.seg === seg)) order.push(seg)
    const stage = pipe ? seg.stage + 1 : 0
    if (!pipe) pipeline++
    seg = { words: [], expandable: [], redirects: [], stdin: '', pipeline, stage }
  }
  const readHeredocs = (from: number): number => {
    let i = from
    while (heredocs.length > 0) {
      const h = heredocs.shift() as Heredoc
      const body: string[] = []
      let closed = false
      while (i < src.length) {
        const nl = src.indexOf('\n', i)
        const line = src.slice(i, nl === -1 ? src.length : nl)
        i = nl === -1 ? src.length : nl + 1
        if ((h.strip ? line.replace(/^\t+/, '') : line) === h.delim) {
          closed = true
          break
        }
        body.push(line)
      }
      if (!closed) h.seg.opaqueStdin = true
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
      const close = src.indexOf("'", i)
      const end = close === -1 ? src.length : close
      quoted(src.slice(i, end))
      if (close !== -1) quote = undefined
      i = end
      continue
    }
    if (quote === '"') {
      if (c === '"') quote = undefined
      else if (c === '\\' && next !== undefined && '$`"\\\n'.includes(next)) {
        if (next !== '\n') quoted(next)
        i++
      } else if (c === '$' && next === '(') {
        const r = readParen(src, i + 2)
        nested(r.inner)
        quoted(src.slice(i, r.end + 1))
        i = r.end
      } else if (c === '`') {
        const r = readBacktick(src, i + 1)
        nested(r.inner)
        quoted(src.slice(i, r.end + 1))
        i = r.end
      } else quoted(c)
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
    } else if (c === '$' && next === '"') {
      // `$"..."` (locale translation) reads as `"..."`.
      quote = '"'
      started = true
      wasQuoted = true
      i++
    } else if (c === '$' && next === "'") {
      // ANSI-C quoting: decoded as bash does (`$'\x2eagentic-qe'` is `.agentic-qe`).
      const r = readAnsiC(src, i + 2)
      quoted(r.text)
      started = true
      wasQuoted = true
      i = r.end
    } else if ((c === '$' || ((c === '<' || c === '>') && !started)) && next === '(') {
      const r = readParen(src, i + 2)
      nested(r.inner)
      plain(src.slice(i, r.end + 1))
      started = true
      i = r.end
    } else if (c === '`') {
      const r = readBacktick(src, i + 1)
      nested(r.inner)
      plain(src.slice(i, r.end + 1))
      started = true
      i = r.end
    } else if (c === '\\') {
      if (next === '\n') i++
      else if (next !== undefined) {
        quoted(next)
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
    } else if (c === '(' && started && /[@!+*?]$/.test(word)) {
      // An extglob group (`.agentic-@(qe)`) belongs to its word.
      const r = readParen(src, i + 1)
      plain(src.slice(i, r.end + 1))
      i = r.end
    } else if (c === '(' && started && /^[A-Za-z_][A-Za-z0-9_]*\+?=$/.test(word)) {
      // An array assignment (`arr=($(find ...))`): its elements belong to the word; their substitutions run.
      const r = readParen(src, i + 1)
      for (const inner of substitutions(r.inner)) nested(inner)
      plain(src.slice(i, r.end + 1))
      i = r.end
    } else if (c === '(' || c === ')') endSegment(false)
    else if (c === '>' || c === '<' || (c === '&' && next === '>')) {
      REDIRECT.lastIndex = i
      const op = (REDIRECT.exec(src) as RegExpExecArray)[0]
      // A numeric word right before is the fd (`2>`), not an argument.
      if (started && !wasQuoted && /^\d+$/.test(word)) {
        word = ''
        ex = ''
        started = false
      } else endWord()
      i += op.length - 1
      FD_DUP.lastIndex = i + 1
      const dup = op === '>&' || op === '<&' ? FD_DUP.exec(src) : null
      if (dup !== null) i += dup[0].length
      else pendingOp = op === '>&' ? '>' : op
    } else if (c === '&') endSegment(false)
    else {
      // A run of ordinary characters at once.
      PLAIN.lastIndex = i
      const run = PLAIN.exec(src)
      plain(run === null ? c : run[0])
      if (run !== null) i += run[0].length - 1
      started = true
    }
  }
  endSegment(false)
  readHeredocs(src.length)

  // Each pipeline's stages in order; a stage reads the (at most FEED) stages right before it.
  const byPipeline = new Map<number, Building[]>()
  return order.map(o => {
    if (!('pipeline' in o)) return o
    const list = byPipeline.get(o.pipeline) ?? []
    if (list.length === 0) byPipeline.set(o.pipeline, list)
    list.push(o)
    return new Stage(o, list, list.length - 1)
  })
}

/** A simple command as `parse` hands it back; what feeds it is built on first read (most commands never look). */
class Stage implements Segment {
  readonly words: readonly string[]
  readonly expandable: readonly string[]
  readonly redirects: readonly Redirect[]
  readonly piped: boolean
  readonly opaqueStdin: boolean
  private readonly built: Building
  private readonly pipeline: readonly Building[]
  private readonly at: number
  private cachedUpstream: string | undefined
  private cachedStages: (readonly string[])[] | undefined

  constructor(built: Building, pipeline: readonly Building[], at: number) {
    this.built = built
    this.words = built.words
    this.expandable = built.expandable
    this.redirects = built.redirects
    this.piped = built.stage > 0
    this.opaqueStdin = built.opaqueStdin === true
    this.pipeline = pipeline
    this.at = at
  }

  private feeders(): Building[] {
    return this.at === 0 ? [] : this.pipeline.slice(Math.max(0, this.at - FEED), this.at)
  }

  get stages(): readonly (readonly string[])[] {
    this.cachedStages ??= this.feeders().map(u => u.words)
    return this.cachedStages
  }

  /** Heredoc bodies arrive after the command line, so stdin is read from the builder. */
  get stdin(): string {
    return this.built.stdin
  }

  get upstream(): string {
    this.cachedUpstream ??= this.feeders().map(u => `${u.words.join(' ')}\n${u.stdin}`).join('\n')
    return this.cachedUpstream
  }
}

/** Splits a command line into the text of its simple commands (words joined by spaces). */
export const segments = (command: string): string[] => parse(command).map(s => s.words.join(' '))

/** Words of one command line, as the commands see them. */
export const words = (command: string): string[] => parse(command).flatMap(s => [...s.words])

/** Shell keywords and grouping words that come before a command word (`then rm x`, `! rm x`, `{ rm x; }`). */
export const KEYWORDS = new Set(['!', '{', '}', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', 'fi', 'done', 'esac'])
/** Commands that take a command after them (their own options skipped). */
export const WRAPPERS = new Set([
  'sudo', 'doas', 'env', 'command', 'exec', 'nohup', 'time', 'nice', 'ionice', 'stdbuf', 'builtin', 'xargs', 'timeout', 'chronic', 'unbuffer',
  'npx', 'bunx', 'pnpx', 'watch', 'noglob', 'nocorrect', 'caffeinate', 'busybox', 'parallel', 'shx', 'wsl',
])
/** Package runners whose `exec`/`dlx`/`x` subcommand runs the command after it (`pnpm exec rimraf`). */
const RUNNERS = /^(pnpm|yarn|npm|bun)$/
const RUNNER_SUBCOMMANDS = /^(exec|dlx|x)$/
/** Wrapper options that take a separate value (`sudo -u root rm ...`). */
const VALUED = new Set(['-u', '-g', '-C', '-D', '-h', '-p', '-U', '-r', '-t', '-n', '-I', '-L', '-P', '-s', '-k', '--signal', '--kill-after', '--user', '--group', '--package', '--interval', '-j', '--jobs', '-d', '--distribution', '--cd'])

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
    // `coproc NAME { cmd; }` names the coprocess; `coproc cmd args` does not.
    else if (w === 'coproc') i += ws[i + 2] === '{' || ws[i + 2] === '(' ? 2 : 1
    else if (WRAPPERS.has(name) || (RUNNERS.test(name) && RUNNER_SUBCOMMANDS.test(ws[i + 1] ?? ''))) {
      i += WRAPPERS.has(name) ? 1 : 2
      while (i < ws.length && (isOption(ws[i] as string) || /^\d+(\.\d+)?[smhd]?$/.test(ws[i] as string))) {
        const after = ws[i + 1]
        i += VALUED.has(ws[i] as string) && after !== undefined && !isVerb(after) ? 2 : 1
      }
    } else return i
  }
  return i
}
