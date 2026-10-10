/**
 * Which paths are AQE's irreplaceable learning data.
 *
 * Pure: no `$`. Shared by the guard (hooks/guard.ts), the `/aqe-mod fleet`
 * verb and the tests.
 *
 * Protected, case-insensitively, anywhere in a path:
 * - the `.agentic-qe` directory itself (deleting or moving it loses everything),
 *   including a glob component that could match it (`.agentic*`, `.[a]gentic-qe`, `.*`);
 * - a direct child of `.agentic-qe/` named `*.db`, `*.db-wal`, `*.db-shm`,
 *   `*.db-journal` or `*.rvf` (memory.db and its WAL/SHM, brain/pattern stores);
 * - a glob directly under `.agentic-qe/` that could match one of those.
 *
 * Not protected: backups (`memory.db.bak-<ts>` does not end in `.db`, and a
 * name containing `backup` or a `.bak`/`-bak` part is a copy, not the store),
 * subdirectories (`.agentic-qe/agents/`), config, logs.
 *
 * Every `.agentic-qe` is protected wherever it lives, `/tmp/...` included: a
 * pure check cannot resolve globs, `$`-expansions or symlinks, so it cannot
 * tell a throwaway fixture from a project that lives under a temp directory.
 */
import { globMatch } from './glob'

/** A learning-data file's name: what the CLAUDE.md Data Protection rule guards. */
export const DATA_FILE = /\.(db(-wal|-shm|-journal)?|rvf)$/i

/** A backup's name (`memory-backup-20261009.db`, `memory.bak.db`, `x-bak-1.db`): a copy the guard lets tools write and remove. */
export const BACKUP_NAME = /backup|(^|[._-])bak([._-]|\d|$)/i

/** Names a glob is tried against to decide whether it could reach learning data. */
const SAMPLES = ['memory.db', 'memory.db-wal', 'memory.db-shm', 'memory.db-journal', 'brain.rvf', 'patterns.rvf', 'x.db']

const AQE = '.agentic-qe'

export type ProtectedKind = 'dir' | 'file' | 'glob'

/**
 * Collapses `\`, `//`, `/./`, `a/../` and a leading `./`, so `.agentic-qe/./memory.db`,
 * `x/../.agentic-qe/memory.db` and `./memory.db` read plainly. `./` alone reads as `.`.
 */
export function normalisePath(raw: string): string {
  const p = raw.replace(/\\/g, '/').replace(/\/{2,}/g, '/')
  const parts: string[] = []
  for (const part of p.split('/')) {
    if (part === '.' && parts.length > 0) continue
    if (part === '..' && parts.length > 0 && parts[parts.length - 1] !== '..' && parts[parts.length - 1] !== '' && parts[parts.length - 1] !== '.') {
      parts.pop()
      continue
    }
    parts.push(part)
  }
  while (parts.length > 1 && parts[0] === '.') parts.shift()
  const out = parts.join('/')
  return out === '' && p.startsWith('.') ? '.' : out
}

export const hasGlob = (s: string): boolean => /[*?[]/.test(s)

/** Whether a glob matches a name (linear; see glob.ts). */
export const globMatches = (glob: string, name: string): boolean => globMatch(glob, name)

/** Whether a glob (a file-name pattern, no directory part) could match a learning-data file. */
export const globReachesData = (glob: string): boolean => SAMPLES.some(name => globMatches(glob, name))

/**
 * Whether one path component names the `.agentic-qe` directory: literally (after
 * a `--db=` or `file:` style prefix), or as a glob the shell would expand to it.
 * A glob only reaches a dot-directory when it starts with `.` or a bracket.
 */
function namesAqe(component: string): boolean {
  const c = component.replace(/^.*[=:]/, '')
  if (c.toLowerCase() === AQE) return true
  return hasGlob(c) && (c.startsWith('.') || c.startsWith('[')) && globMatches(c, AQE)
}

/** The index of the first component naming `.agentic-qe`, or -1. */
const aqeIndex = (parts: readonly string[]): number => parts.findIndex(namesAqe)

/**
 * How a path touches learning data, or undefined when it does not.
 * `inAqe`: the command already changed into `.agentic-qe`, so a bare `memory.db` is the store.
 */
export function protectedKind(raw: string, inAqe = false): ProtectedKind | undefined {
  // Outside `.agentic-qe`, a path can only reach it by naming it or by a glob: a cheap exit for every other word.
  if (!inAqe && !/agentic|[*?[]/i.test(raw)) return undefined
  const path = normalisePath(stripUri(raw.trim()))
  if (path === '') return undefined
  const parts = path.split('/')
  const at = aqeIndex(parts)
  let rest: string
  if (at === -1) {
    if (!inAqe || path.includes('/')) return undefined
    rest = path
  } else {
    rest = parts.slice(at + 1).join('/')
  }
  if (rest === '' || rest === '.') return 'dir'
  // Only direct children are the stores; `.agentic-qe/agents/x.db` is someone's fixture.
  if (rest.includes('/')) return undefined
  if (hasGlob(rest)) return globReachesData(rest) ? 'glob' : undefined
  return DATA_FILE.test(rest) && !BACKUP_NAME.test(rest) ? 'file' : undefined
}

/** A `file:` URI's path without its `?query`/`#fragment` (`file:.agentic-qe/memory.db?mode=rw`). */
export const stripUri = (raw: string): string => (/^file:/i.test(raw) ? raw.replace(/[?#].*$/s, '') : raw)

/** The last path component. */
export const baseName = (p: string): string => {
  if (!/[\\/]/.test(p)) return p
  const parts = normalisePath(p).split('/').filter(s => s !== '')
  return parts[parts.length - 1] ?? ''
}

/** True when a path names something under `.agentic-qe` at any depth (for `find` roots and `rsync --delete`). */
export const underAqe = (raw: string, inAqe = false): boolean =>
  aqeIndex(normalisePath(raw.trim()).split('/')) !== -1 || (inAqe && (raw === '.' || raw === './' || !raw.startsWith('/')))
