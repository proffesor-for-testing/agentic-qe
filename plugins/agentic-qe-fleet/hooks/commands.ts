/**
 * The command words the guard knows, shared by the per-command rules
 * (verbs.ts) and `find` (find.ts). Pure: no `$`.
 */
import type { Ctx } from './context'
import { baseName, normalisePath } from './paths'
import { INTERPRETER } from './scripts'

export const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'mksh', 'ash', 'fish'])
export const DELETERS = new Set(['rm', 'unlink', 'shred', 'srm', 'trash', 'trash-put', 'trash-cli', 'gio', 'rmdir', 'wipe', 'rimraf', 'del', 'del-cli'])
export const COPIERS = new Set(['cp', 'install', 'ln', 'rsync', 'scp'])
/** Compressors that replace the file they compress (unless told to keep it). */
export const COMPRESSORS = new Set(['gzip', 'bzip2', 'xz', 'lzma', 'compress', 'pigz', 'lzip'])
/** Other commands that move, rewrite or truncate the files they are given. */
export const REWRITERS = new Set(['mv', 'truncate', 'dd', 'tee', 'sed', 'xargs', 'parallel'])

/** Every command word the guard judges (so a wrapper's valued flag never swallows it). */
const KNOWN = new Set([...DELETERS, ...COPIERS, ...SHELLS, ...COMPRESSORS, ...REWRITERS, 'find', 'git', 'cd', 'pushd', 'sqlite3', 'sqlite', 'eval', 'su'])
export const isVerb = (w: string): boolean => KNOWN.has(baseName(w)) || INTERPRETER.test(baseName(w))

/** Whether a word, anywhere in an argv, is a command that can delete or overwrite (`-exec sudo rm`, `-exec git rm`). */
export const isDestructiveWord = (w: string): boolean => {
  const b = baseName(w)
  return DELETERS.has(b) || COPIERS.has(b) || SHELLS.has(b) || COMPRESSORS.has(b) || REWRITERS.has(b) || INTERPRETER.test(b) || b === 'eval'
}

/** One file of each learning-data kind: an exclusion must keep them all. */
export const DATA_SAMPLES = ['memory.db', 'memory.db-wal', 'memory.db-shm', 'memory.db-journal', 'brain.rvf']

/**
 * Whether a directory may hold the project's `.agentic-qe` beneath it, unless proven otherwise:
 * `.`, `..`, `../...`, `~`, anything unresolved (`$HOME`, `$(...)`), the project root or above
 * it, and any absolute path when the project root is unknown.
 */
export function holdsAqe(root: string, ctx: Ctx): boolean {
  // Unresolved: a `$`/`~` left as written, or an expansion the reader turned into a glob (`"$HOME"` reads as `*`).
  if (/[$`~*?[]/.test(root)) return true
  const r = normalisePath(root.trim())
  if (r === '.' || r === '' || r === '..' || r.startsWith('../')) return true
  if (!r.startsWith('/')) return false
  if (ctx.root === undefined) return true
  const project = normalisePath(ctx.root).replace(/\/+$/, '')
  const q = r.replace(/\/+$/, '')
  return q === '' || q === project || project.startsWith(`${q}/`)
}
