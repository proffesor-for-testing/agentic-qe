/**
 * Which paths are AQE's irreplaceable learning data.
 *
 * Pure: no `$`, no imports. Shared by the guard (hooks/guard.ts), the
 * `/aqe-mod fleet` verb and the tests.
 *
 * Protected, case-insensitively, anywhere in a path:
 * - the `.agentic-qe` directory itself (deleting or moving it loses everything);
 * - a direct child of `.agentic-qe/` named `*.db`, `*.db-wal`, `*.db-shm`,
 *   `*.db-journal` or `*.rvf` (memory.db and its WAL/SHM, brain/pattern stores);
 * - a glob directly under `.agentic-qe/` that could match one of those.
 *
 * Not protected: backups (`memory.db.bak-<ts>` does not end in `.db`),
 * subdirectories (`.agentic-qe/agents/`), config, logs.
 */

/** A learning-data file's name: what the CLAUDE.md Data Protection rule guards. */
export const DATA_FILE = /\.(db(-wal|-shm|-journal)?|rvf)$/i

/** Names a glob is tried against to decide whether it could reach learning data. */
const SAMPLES = ['memory.db', 'memory.db-wal', 'memory.db-shm', 'memory.db-journal', 'brain.rvf', 'patterns.rvf', 'x.db']

/** `.agentic-qe` as a path component, preceded by start, `/`, `=` or `:` (so `--db=.agentic-qe/x.db` counts). */
const COMPONENT = /(^|[/=:])\.agentic-qe(\/|$)/i

export type ProtectedKind = 'dir' | 'file' | 'glob'

/** Collapses `//`, `/./` and `a/../` so `.agentic-qe/./memory.db` and `x/../.agentic-qe/memory.db` read plainly. */
export function normalisePath(raw: string): string {
  let p = raw.replace(/\\/g, '/').replace(/\/{2,}/g, '/')
  const parts: string[] = []
  for (const part of p.split('/')) {
    if (part === '.' && parts.length > 0) continue
    if (part === '..' && parts.length > 0 && parts[parts.length - 1] !== '..' && parts[parts.length - 1] !== '') {
      parts.pop()
      continue
    }
    parts.push(part)
  }
  p = parts.join('/')
  return p
}

const hasGlob = (s: string) => /[*?[]/.test(s)

/** A shell glob as an anchored regex (`*`, `?`, `[...]`; braces are taken literally). */
export function globToRegex(glob: string): RegExp {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] as string
    if (c === '*') out += '[^/]*'
    else if (c === '?') out += '[^/]'
    else if (c === '[') {
      const end = glob.indexOf(']', i + 1)
      if (end === -1) out += '\\['
      else {
        out += `[${glob.slice(i + 1, end).replace(/^!/, '^').replace(/\\/g, '\\\\')}]`
        i = end
      }
    } else out += c.replace(/[.+^${}()|\\]/g, '\\$&')
  }
  return new RegExp(`^${out}$`, 'i')
}

/** Whether a glob (a file-name pattern, no directory part) could match a learning-data file. */
export const globReachesData = (glob: string): boolean => {
  try {
    const re = globToRegex(glob)
    return SAMPLES.some(name => re.test(name))
  } catch {
    return true
  }
}

/**
 * How a path touches learning data, or undefined when it does not.
 * `inAqe`: the command already changed into `.agentic-qe`, so a bare `memory.db` is the store.
 */
export function protectedKind(raw: string, inAqe = false): ProtectedKind | undefined {
  const path = normalisePath(raw.trim())
  if (path === '') return undefined
  const m = COMPONENT.exec(path)
  let rest: string
  if (m === null) {
    if (!inAqe || path.includes('/')) return undefined
    rest = path
  } else {
    rest = path.slice(m.index + m[0].length)
  }
  if (rest === '' || rest === '.') return 'dir'
  // Only direct children are the stores; `.agentic-qe/agents/x.db` is someone's fixture.
  if (rest.includes('/')) return undefined
  if (hasGlob(rest)) return globReachesData(rest) ? 'glob' : undefined
  return DATA_FILE.test(rest) ? 'file' : undefined
}

/** The last path component. */
export const baseName = (p: string): string => {
  const parts = normalisePath(p).split('/').filter(s => s !== '')
  return parts[parts.length - 1] ?? ''
}

/** True when a path names something under `.agentic-qe` at any depth (for `find` roots and `rsync --delete`). */
export const underAqe = (raw: string, inAqe = false): boolean =>
  COMPONENT.test(normalisePath(raw.trim())) || (inAqe && (raw === '.' || raw === './' || !raw.startsWith('/')))
