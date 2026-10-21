/**
 * #1161: read a file inside the project root without a check-then-use race.
 *
 * The payload path guard (#1126) checks a path by name and the handler opens
 * it again later, so a file or symlink swapped in between could be read
 * unchecked. These readers OPEN first and validate what was opened:
 *
 * - the path's realpath is opened with O_NOFOLLOW (a symlink swapped onto the
 *   final name fails the open) and O_NONBLOCK (a FIFO cannot hang the open);
 * - the descriptor must be a regular file within the size limit (fstat);
 * - the descriptor's real location (/proc/self/fd/N on Linux; elsewhere the
 *   re-resolved realpath, which must be the same inode) must lie inside the
 *   project root, so a directory component swapped for a symlink is caught;
 * - the content is read from that same descriptor, and never past the limit,
 *   even if the file grows after the fstat.
 *
 * A path spelled outside the root is refused before any filesystem call,
 * unless the caller opts into `outsideRoot: 'allow'` for paths it accepts
 * from a trusted source (the other checks still apply).
 */

import { constants as fsConstants, type Stats } from 'node:fs';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { findProjectRoot } from '../../kernel/project-root.js';
import { CallerInputError } from '../error-utils.js';

/** Default upper bound for a confined read when the caller names none. */
export const DEFAULT_MAX_CONFINED_READ_BYTES = 128 * 1024 * 1024;

export type ConfinedReadReason =
  | 'not-found'
  | 'not-a-file'
  | 'outside-project-root'
  | 'unreadable'
  | 'too-large';

export interface ConfinedReadOptions {
  /** Project root; defaults to findProjectRoot(). */
  projectRoot?: string;
  /** Refuse files larger than this; defaults to DEFAULT_MAX_CONFINED_READ_BYTES. */
  maxBytes?: number;
  /**
   * A path spelled outside the project root is refused ('refuse', default),
   * or read without the containment check ('allow') when the caller already
   * trusts it. Paths spelled inside the root are always held to the root.
   */
  outsideRoot?: 'refuse' | 'allow';
}

/**
 * A confined read that was refused; `reason` matches the payload guard's.
 * `code` is the errno code when the filesystem gave one (ENOENT, ELOOP, ...),
 * otherwise the reason in errno style (OUTSIDE_PROJECT_ROOT, NOT_A_FILE,
 * TOO_LARGE), so callers that report error codes keep working.
 */
export class ConfinedReadError extends CallerInputError {
  readonly code: string;

  constructor(
    readonly filePath: string,
    readonly reason: ConfinedReadReason,
    errnoCode?: string,
  ) {
    super(`Cannot read ${filePath}: ${reason}`);
    this.name = 'ConfinedReadError';
    this.code = errnoCode ?? reason.toUpperCase().replace(/-/g, '_');
  }
}

/** Flags for opening a checked realpath: read-only, no final symlink, no FIFO wait. */
export const CONFINED_OPEN_FLAGS =
  fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_NONBLOCK ?? 0);

/** True when `candidate` is `root` or lies beneath it (both absolute). */
export function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/**
 * Where an OPEN descriptor really points. On Linux, /proc/self/fd/N resolves
 * to the opened file itself. Elsewhere, re-resolve the path and accept it only
 * if it is the same inode as the descriptor, so a swap after the open is
 * detected. Returns null when it cannot be proven.
 */
export async function openedLocation(fd: number, lexical: string, opened: Stats): Promise<string | null> {
  const sameFile = async (candidate: string): Promise<boolean> => {
    const st = await fs.stat(candidate).catch(() => null);
    return st !== null && st.dev === opened.dev && st.ino === opened.ino;
  };
  const viaProc = await fs.realpath(`/proc/self/fd/${fd}`).catch(() => null);
  if (viaProc && path.isAbsolute(viaProc) && await sameFile(viaProc)) return viaProc;
  const real = await fs.realpath(lexical).catch(() => null);
  if (real && await sameFile(real)) return real;
  return null;
}

/** Synchronous openedLocation, for callers that read synchronously. */
export function openedLocationSync(fd: number, lexical: string, opened: Stats): string | null {
  const sameFile = (candidate: string): boolean => {
    try {
      const st = fsSync.statSync(candidate);
      return st.dev === opened.dev && st.ino === opened.ino;
    } catch {
      return false;
    }
  };
  const realOrNull = (p: string): string | null => {
    try { return fsSync.realpathSync(p); } catch { return null; }
  };
  const viaProc = realOrNull(`/proc/self/fd/${fd}`);
  if (viaProc && path.isAbsolute(viaProc) && sameFile(viaProc)) return viaProc;
  const real = realOrNull(lexical);
  if (real && sameFile(real)) return real;
  return null;
}

function reasonFor(error: unknown): ConfinedReadReason {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT' || code === 'ENOTDIR') return 'not-found';
  // ELOOP: a symlink was swapped onto the checked realpath's final name.
  if (code === 'EISDIR' || code === 'ELOOP') return 'not-a-file';
  return 'unreadable';
}

function fail(filePath: string, reason: ConfinedReadReason, error?: unknown): ConfinedReadError {
  return new ConfinedReadError(filePath, reason, (error as NodeJS.ErrnoException | undefined)?.code);
}

interface Plan {
  lexical: string;
  rootReal: string;
  /** The path was spelled inside the root, so what is opened must stay there. */
  inRoot: boolean;
  limit: number;
}

function plan(filePath: string, rootReal: string, options: ConfinedReadOptions): Plan {
  if (typeof filePath !== 'string' || filePath === '' || filePath.includes('\0')) {
    throw fail(String(filePath), 'unreadable');
  }
  const rootLexical = path.resolve(options.projectRoot ?? findProjectRoot());
  const lexical = path.resolve(filePath);
  const inRoot = isWithinRoot(rootLexical, lexical) || isWithinRoot(rootReal, lexical);
  // Spelled outside the root: refused before any filesystem call, so the
  // reason cannot reveal whether an outside path exists.
  if (!inRoot && options.outsideRoot !== 'allow') throw fail(filePath, 'outside-project-root');
  return { lexical, rootReal, inRoot, limit: options.maxBytes ?? DEFAULT_MAX_CONFINED_READ_BYTES };
}

/** Check the opened descriptor's stat before anything is read. */
function checkOpened(filePath: string, st: Stats, limit: number): void {
  if (!st.isFile()) throw fail(filePath, 'not-a-file');
  if (st.size > limit) throw fail(filePath, 'too-large');
}

/**
 * Read a file by path, confined to the project root and validated on the
 * opened descriptor (see the module comment). Throws ConfinedReadError.
 */
export async function readConfinedFile(filePath: string, options: ConfinedReadOptions = {}): Promise<Buffer> {
  const root = path.resolve(options.projectRoot ?? findProjectRoot());
  const rootReal = await fs.realpath(root).catch(() => root);
  const p = plan(filePath, rootReal, options);

  let real: string;
  try {
    real = await fs.realpath(p.lexical);
  } catch (error) {
    throw fail(filePath, reasonFor(error), error);
  }
  if (p.inRoot && !isWithinRoot(p.rootReal, real)) throw fail(filePath, 'outside-project-root');

  let handle: fs.FileHandle;
  try {
    handle = await fs.open(real, CONFINED_OPEN_FLAGS);
  } catch (error) {
    throw fail(filePath, reasonFor(error), error);
  }
  try {
    const st = await handle.stat();
    checkOpened(filePath, st, p.limit);
    if (p.inRoot) {
      const location = await openedLocation(handle.fd, real, st);
      if (!location || !isWithinRoot(p.rootReal, location)) throw fail(filePath, 'outside-project-root');
    }
    // Read at most limit + 1 bytes from this descriptor: a file that grew
    // after the fstat is refused rather than read without bound.
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, p.limit + 1 - total));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      chunks.push(chunk.subarray(0, bytesRead));
      total += bytesRead;
      if (total > p.limit) throw fail(filePath, 'too-large');
    }
    return Buffer.concat(chunks, total);
  } catch (error) {
    if (error instanceof ConfinedReadError) throw error;
    throw fail(filePath, reasonFor(error), error);
  } finally {
    await handle.close().catch(() => undefined);
  }
}

/** readConfinedFile decoded as UTF-8. */
export async function readConfinedText(filePath: string, options: ConfinedReadOptions = {}): Promise<string> {
  return (await readConfinedFile(filePath, options)).toString('utf-8');
}

/** Synchronous readConfinedFile, for callers that cannot await. */
export function readConfinedFileSync(filePath: string, options: ConfinedReadOptions = {}): Buffer {
  const root = path.resolve(options.projectRoot ?? findProjectRoot());
  let rootReal = root;
  try { rootReal = fsSync.realpathSync(root); } catch { /* keep the lexical root */ }
  const p = plan(filePath, rootReal, options);

  let real: string;
  try {
    real = fsSync.realpathSync(p.lexical);
  } catch (error) {
    throw fail(filePath, reasonFor(error), error);
  }
  if (p.inRoot && !isWithinRoot(p.rootReal, real)) throw fail(filePath, 'outside-project-root');

  let fd: number;
  try {
    fd = fsSync.openSync(real, CONFINED_OPEN_FLAGS);
  } catch (error) {
    throw fail(filePath, reasonFor(error), error);
  }
  try {
    const st = fsSync.fstatSync(fd);
    checkOpened(filePath, st, p.limit);
    if (p.inRoot) {
      const location = openedLocationSync(fd, real, st);
      if (!location || !isWithinRoot(p.rootReal, location)) throw fail(filePath, 'outside-project-root');
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, p.limit + 1 - total));
      const bytesRead = fsSync.readSync(fd, chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      chunks.push(chunk.subarray(0, bytesRead));
      total += bytesRead;
      if (total > p.limit) throw fail(filePath, 'too-large');
    }
    return Buffer.concat(chunks, total);
  } catch (error) {
    if (error instanceof ConfinedReadError) throw error;
    throw fail(filePath, reasonFor(error), error);
  } finally {
    try { fsSync.closeSync(fd); } catch { /* already closed */ }
  }
}

/** readConfinedFileSync decoded as UTF-8. */
export function readConfinedTextSync(filePath: string, options: ConfinedReadOptions = {}): string {
  return readConfinedFileSync(filePath, options).toString('utf-8');
}
