/**
 * #1126: decide which caller-named paths a task handler may read.
 *
 * A task payload can come from MCP task_submit, task_orchestrate, a domain
 * MCP tool or `aqe task submit`, so every handler that reads a path from its
 * payload applies the same rule as code indexing (#1096) and sast-scan
 * (#1144): a path is read only when its realpath is a regular file (or, for a
 * target to walk, a directory) inside the project root's realpath. A path
 * spelled outside the root is refused before any filesystem call, so the
 * reason does not reveal whether it exists, and an outside directory is never
 * listed. A symlink pointing out, a device such as /dev/zero or a directory
 * is refused by name, and so is a file over the size limit when the handler
 * reads files whole.
 *
 * The check runs inside each handler rather than at one MCP entry point, so
 * no route into the handler can skip it. A refusal is a CallerInputError: it
 * is not retried and does not count toward the domain circuit breaker.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { findProjectRoot } from '../../kernel/project-root.js';
import { Result, ok, err } from '../types';
import { CallerInputError } from '../error-utils.js';

/** Largest file a handler reads whole into memory (the #1144 sast limit). */
export const MAX_PAYLOAD_FILE_BYTES = 2 * 1024 * 1024;

export type PayloadPathSkipReason =
  | 'not-found'
  | 'not-a-file'
  | 'outside-project-root'
  | 'unreadable'
  | 'too-large';

export interface SkippedPayloadPath {
  path: string;
  reason: PayloadPathSkipReason;
}

export interface ConfinedPayloadPaths {
  /** Requested paths (as given) that are regular files inside the project root. */
  accepted: string[];
  skipped: SkippedPayloadPath[];
}

export interface PayloadPathOptions {
  /** Project root; defaults to findProjectRoot(). */
  projectRoot?: string;
  /** Base for relative paths; defaults to process.cwd(), as FileReader does. */
  basePath?: string;
  /** Refuse files larger than this. Omit when the handler does not read files whole. */
  maxBytes?: number;
  /**
   * Accept a path inside the root that does not exist, for handlers that
   * report a missing file themselves (a test runner, a deleted file in a
   * changeset). A missing path outside the root is still refused.
   */
  allowMissing?: boolean;
}

/** Options for a single caller-named target that may be a directory. */
export interface PayloadTargetOptions extends PayloadPathOptions {
  /** Accept a directory inside the root as well as a regular file. */
  allowDirectory?: boolean;
}

/** True when `candidate` is `root` or lies beneath it (both absolute). */
function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/**
 * A missing path is accepted only when its nearest existing ancestor still
 * resolves inside the root, so a missing name beneath a symlink pointing out
 * is refused.
 */
async function escapesThroughParent(lexical: string, rootReal: string): Promise<boolean> {
  let dir = path.dirname(lexical);
  for (;;) {
    const real = await fs.realpath(dir).catch(() => null);
    if (real) return !isWithin(rootReal, real);
    const parent = path.dirname(dir);
    if (parent === dir) return true;
    dir = parent;
  }
}

/** Split `paths` into those a handler may read and those it must refuse. */
export async function confinePayloadPaths(
  paths: readonly string[],
  options: PayloadTargetOptions = {},
): Promise<ConfinedPayloadPaths> {
  const projectRoot = options.projectRoot ?? findProjectRoot();
  const basePath = options.basePath ?? process.cwd();
  const accepted: string[] = [];
  const skipped: SkippedPayloadPath[] = [];
  const rootLexical = path.resolve(projectRoot);
  const rootReal = await fs.realpath(projectRoot).catch(() => rootLexical);

  for (const requested of paths) {
    const lexical = path.resolve(basePath, requested);
    if (!isWithin(rootLexical, lexical) && !isWithin(rootReal, lexical)) {
      skipped.push({ path: requested, reason: 'outside-project-root' });
      continue;
    }
    let real: string;
    try {
      real = await fs.realpath(lexical);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const missing = code === 'ENOENT' || code === 'ENOTDIR';
      // A dangling symlink exists by name: it is not a missing file to accept.
      const dangling = await fs.lstat(lexical).then(() => true, () => false);
      if (missing && !dangling && options.allowMissing && !(await escapesThroughParent(lexical, rootReal))) {
        accepted.push(requested);
      } else {
        skipped.push({ path: requested, reason: missing ? 'not-found' : 'unreadable' });
      }
      continue;
    }
    if (!isWithin(rootReal, real)) {
      skipped.push({ path: requested, reason: 'outside-project-root' });
      continue;
    }
    const stat = await fs.stat(real).catch(() => null);
    if (!stat) {
      skipped.push({ path: requested, reason: 'unreadable' });
    } else if (!(stat.isFile() || (options.allowDirectory && stat.isDirectory()))) {
      skipped.push({ path: requested, reason: 'not-a-file' });
    } else if (options.maxBytes !== undefined && stat.size > options.maxBytes) {
      skipped.push({ path: requested, reason: 'too-large' });
    } else {
      accepted.push(requested);
    }
  }

  return { accepted, skipped };
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Handler-side check for a payload path list: `value` must be an array of
 * non-empty path strings, and every entry must pass confinePayloadPaths.
 * Otherwise the whole request is refused and nothing is read. `taskType` and
 * `field` name the payload in the error, e.g. "Invalid generate-tests payload".
 */
export async function requirePayloadFiles(
  taskType: string,
  field: string,
  value: unknown,
  options: PayloadPathOptions = {},
): Promise<Result<string[], Error>> {
  const context = `Invalid ${taskType} payload`;
  if (!Array.isArray(value)) {
    return err(new CallerInputError(`${context}: '${field}' must be an array of file paths, got ${describe(value)}`));
  }
  for (let i = 0; i < value.length; i++) {
    const entry: unknown = value[i];
    if (typeof entry !== 'string' || entry.trim() === '') {
      return err(new CallerInputError(`${context}: '${field}[${i}]' must be a non-empty string, got ${describe(entry)}`));
    }
    if (entry.includes('\0')) {
      return err(new CallerInputError(`${context}: '${field}[${i}]' contains a null byte`));
    }
  }
  const { accepted, skipped } = await confinePayloadPaths(value as string[], options);
  if (skipped.length > 0) return err(refusal(context, field, skipped, options));
  return ok(accepted);
}

function refusal(context: string, field: string, skipped: SkippedPayloadPath[], options: PayloadTargetOptions): Error {
  const limit = options.maxBytes !== undefined
    ? `, at most ${Math.round(options.maxBytes / (1024 * 1024))} MB each`
    : '';
  const kinds = options.allowDirectory ? 'regular files or directories' : 'regular files';
  return new CallerInputError(
    `${context}: ${field} cannot be read: ${skipped.map(s => `${s.path} (${s.reason})`).join(', ')}. ` +
    `Pass ${kinds} inside the project${limit}.`,
  );
}

/**
 * Handler-side check for one caller-named path (a file, or with
 * allowDirectory a directory to walk). Returns the path resolved against
 * `basePath`, or an error naming the reason without reading anything.
 */
export async function requirePayloadPath(
  taskType: string,
  field: string,
  value: unknown,
  options: PayloadTargetOptions = {},
): Promise<Result<string, Error>> {
  const context = `Invalid ${taskType} payload`;
  if (typeof value !== 'string' || value.trim() === '') {
    return err(new CallerInputError(`${context}: '${field}' must be a non-empty path string, got ${describe(value)}`));
  }
  if (value.includes('\0')) {
    return err(new CallerInputError(`${context}: '${field}' contains a null byte`));
  }
  const { skipped } = await confinePayloadPaths([value], options);
  if (skipped.length > 0) return err(refusal(context, field, skipped, options));
  return ok(path.resolve(options.basePath ?? process.cwd(), value));
}
