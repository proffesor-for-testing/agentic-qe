/**
 * A linear shell-glob matcher: `*`, `?`, `[...]` (with `!`/`^` negation and
 * ranges), case-insensitive. No regular expressions are built from the glob, so
 * a pattern of many stars cannot backtrack exponentially: runs of `*` collapse
 * to one, and matching is the two-pointer walk that retries only from the last
 * star (at most pattern-length x text-length steps). Pure: no `$`, no imports.
 */

type Token = { readonly t: 'star' } | { readonly t: 'any' } | { readonly t: 'lit'; readonly c: string } | { readonly t: 'class'; readonly neg: boolean; readonly body: string }

/**
 * A bracket expression from its `[`: bash's rules for where it ends (a `]` right after
 * `[`, `[!` or `[^` is a member). One holding `[:class:]`, `[=x=]`, `[.x.]` or a backslash
 * is read as matching any character: the matcher does not model it, so it may match.
 */
function readClass(g: string, at: number, last: Closers): { token: Token; end: number } | undefined {
  // Nothing can close it: fail fast instead of scanning (a run of `[` stays linear).
  if (at >= last.bracket) return undefined
  let k = at + 1
  const neg = g[k] === '!' || g[k] === '^'
  if (neg) k++
  const bodyStart = k
  if (g[k] === ']') k++
  let opaque = false
  for (; k < g.length; k++) {
    const c = g[k] as string
    if (c === '[' && (g[k + 1] === ':' || g[k + 1] === '=' || g[k + 1] === '.')) {
      const kind = g[k + 1] as ':' | '=' | '.'
      if (k + 2 > last[kind]) return undefined
      const close = g.indexOf(`${kind}]`, k + 2)
      if (close === -1) return undefined
      opaque = true
      k = close + 1
    } else if (c === '\\') {
      opaque = true
      k++
    } else if (c === ']') {
      return { token: opaque ? { t: 'any' } : { t: 'class', neg, body: g.slice(bodyStart, k) }, end: k }
    }
  }
  return undefined
}

/** Where the last `]`, `:]`, `=]` and `.]` are, so an unclosable bracket is known at once. */
type Closers = { readonly bracket: number; readonly ':': number; readonly '=': number; readonly '.': number }

function tokens(glob: string): Token[] {
  const out: Token[] = []
  const g = glob.toLowerCase()
  const last: Closers = { bracket: g.lastIndexOf(']'), ':': g.lastIndexOf(':]'), '=': g.lastIndexOf('=]'), '.': g.lastIndexOf('.]') }
  for (let i = 0; i < g.length; i++) {
    const c = g[i] as string
    if (c === '*') {
      if (out[out.length - 1]?.t !== 'star') out.push({ t: 'star' })
    } else if (c === '?') out.push({ t: 'any' })
    else if (c === '[') {
      const cls = readClass(g, i, last)
      if (cls === undefined) out.push({ t: 'lit', c })
      else {
        out.push(cls.token)
        i = cls.end
      }
    } else if (c === '\\' && i + 1 < g.length) out.push({ t: 'lit', c: g[++i] as string })
    else out.push({ t: 'lit', c })
  }
  return out
}

function inClass(body: string, ch: string): boolean {
  for (let i = 0; i < body.length; i++) {
    const lo = body[i] as string
    if (body[i + 1] === '-' && i + 2 < body.length) {
      const hi = body[i + 2] as string
      if (ch >= lo && ch <= hi) return true
      i += 2
    } else if (lo === ch) return true
  }
  return false
}

const one = (tok: Token, ch: string, slash: boolean): boolean => {
  if (ch === '/' && !slash && tok.t !== 'lit') return false
  if (tok.t === 'any') return true
  if (tok.t === 'lit') return tok.c === ch
  if (tok.t === 'class') return inClass(tok.body, ch) !== tok.neg
  return false
}

/**
 * Whether `glob` matches all of `text`. `slash`: `*`, `?` and classes may match
 * `/` (find's `-path`); otherwise they stop at it (a file name, a path component).
 */
export function globMatch(glob: string, text: string, slash = false): boolean {
  const toks = tokens(glob)
  const s = text.toLowerCase()
  let p = 0
  let i = 0
  let starP = -1
  let starI = -1
  while (i < s.length) {
    const tok = toks[p]
    if (tok?.t === 'star') {
      starP = p++
      starI = i
    } else if (tok !== undefined && one(tok, s[i] as string, slash)) {
      p++
      i++
    } else if (starP !== -1 && (slash || s[starI] !== '/')) {
      p = starP + 1
      i = ++starI
    } else return false
  }
  while (toks[p]?.t === 'star') p++
  return p === toks.length
}
