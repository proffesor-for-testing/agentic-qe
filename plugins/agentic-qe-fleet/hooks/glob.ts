/**
 * A linear shell-glob matcher: `*`, `?`, `[...]` (with `!`/`^` negation and
 * ranges), case-insensitive. No regular expressions are built from the glob, so
 * a pattern of many stars cannot backtrack exponentially: runs of `*` collapse
 * to one, and matching is the two-pointer walk that retries only from the last
 * star (at most pattern-length x text-length steps). Pure: no `$`, no imports.
 */

type Token = { readonly t: 'star' } | { readonly t: 'any' } | { readonly t: 'lit'; readonly c: string } | { readonly t: 'class'; readonly neg: boolean; readonly body: string }

function tokens(glob: string): Token[] {
  const out: Token[] = []
  const g = glob.toLowerCase()
  for (let i = 0; i < g.length; i++) {
    const c = g[i] as string
    if (c === '*') {
      if (out[out.length - 1]?.t !== 'star') out.push({ t: 'star' })
    } else if (c === '?') out.push({ t: 'any' })
    else if (c === '[') {
      const end = g.indexOf(']', i + 2)
      if (end === -1) out.push({ t: 'lit', c })
      else {
        const inner = g.slice(i + 1, end)
        const neg = inner.startsWith('!') || inner.startsWith('^')
        out.push({ t: 'class', neg, body: neg ? inner.slice(1) : inner })
        i = end
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
