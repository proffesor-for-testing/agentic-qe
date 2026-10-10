/**
 * Bash brace expansion for the guard, bounded: a word expands to at most a
 * budget of results, and a word too long or too deeply nested is read with each
 * brace group as `*` (what the expansion can match). Linear passes only.
 * Pure: no `$`, no imports.
 */

const RANGE_NUM = /^(-?\d+)\.\.(-?\d+)$/
const RANGE_CHAR = /^([A-Za-z])\.\.([A-Za-z])$/

/** Past this word length or brace depth, braces are not expanded: each group reads as `*`. */
export const BRACE_MAX_LENGTH = 2048
export const BRACE_MAX_DEPTH = 32

/** Each `{`'s matching `}` and its depth-one commas, in one pass (`${` is a parameter, not a brace). */
function bracePairs(w: string): Array<{ open: number; close: number; cuts: number[] }> {
  const stack: Array<{ open: number; cuts: number[]; param: boolean }> = []
  const pairs: Array<{ open: number; close: number; cuts: number[] }> = []
  for (let i = 0; i < w.length; i++) {
    const c = w[i]
    if (c === '{') stack.push({ open: i, cuts: [], param: w[i - 1] === '$' })
    else if (c === '}') {
      const top = stack.pop()
      if (top !== undefined && !top.param) pairs.push({ open: top.open, close: i, cuts: top.cuts })
    } else if (c === ',' && stack.length > 0) (stack[stack.length - 1] as { cuts: number[] }).cuts.push(i)
  }
  return pairs.sort((a, b) => a.open - b.open)
}

/** The alternatives of the first expandable `{...}` in a word, or undefined. */
function firstBrace(w: string): { start: number; end: number; alts: string[] } | undefined {
  for (const { open, close, cuts } of bracePairs(w)) {
    if (cuts.length > 0) {
      const alts: string[] = []
      let from = open + 1
      for (const cut of [...cuts, close]) {
        alts.push(w.slice(from, cut))
        from = cut + 1
      }
      return { start: open, end: close, alts }
    }
    const inner = w.slice(open + 1, close)
    const num = RANGE_NUM.exec(inner)
    const chr = RANGE_CHAR.exec(inner)
    if (num !== null || chr !== null) {
      const a = num !== null ? Number(num[1]) : (chr?.[1] as string).charCodeAt(0)
      const b = num !== null ? Number(num[2]) : (chr?.[2] as string).charCodeAt(0)
      const alts: string[] = []
      const step = a <= b ? 1 : -1
      for (let k = a; alts.length <= 1024 && (step > 0 ? k <= b : k >= b); k += step) alts.push(num !== null ? String(k) : String.fromCharCode(k))
      return { start: open, end: close, alts }
    }
  }
  return undefined
}

/** A word with every outermost `{...}` (and any unbalanced tail from a stray `{`) read as `*`: what the expansion can match. */
function looseBraces(word: string): string {
  let out = ''
  let depth = 0
  for (let i = 0; i < word.length; i++) {
    const c = word[i]
    if (c === '{' && word[i - 1] !== '$') {
      if (depth++ === 0) out += '*'
    } else if (c === '}' && depth > 0) depth--
    else if (depth === 0) out += c
  }
  return out
}

const braceDepth = (word: string): number => {
  let depth = 0
  let max = 0
  for (const c of word) {
    if (c === '{') max = Math.max(max, ++depth)
    else if (c === '}' && depth > 0) depth--
  }
  return max
}

/**
 * Bash brace expansion of one word (`memory.db{,-wal}`, `memory.{db,db-wal}`,
 * nested `{a,{b,c}}`, `{1..3}`). Past `limit` results, or for a word longer than
 * BRACE_MAX_LENGTH or nested deeper than BRACE_MAX_DEPTH, each brace group is
 * read as `*` instead, so the word is judged as the glob it covers.
 */
export function expandBraces(word: string, limit = 256): string[] {
  if (!word.includes('{')) return [word]
  if (word.length > BRACE_MAX_LENGTH || braceDepth(word) > BRACE_MAX_DEPTH) return [looseBraces(word)]
  const out: string[] = []
  let over = false
  let steps = 0
  const walk = (w: string) => {
    if (over) return
    if (++steps > limit * 4) {
      over = true
      return
    }
    const b = firstBrace(w)
    if (b === undefined) {
      if (out.length >= limit) over = true
      else out.push(w)
      return
    }
    for (const alt of b.alts) walk(w.slice(0, b.start) + alt + w.slice(b.end + 1))
  }
  walk(word)
  return over ? [...out, looseBraces(word)] : out
}
