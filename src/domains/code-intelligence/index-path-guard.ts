/**
 * #1096: decide which requested paths code indexing may read.
 *
 * Every index entry point (the `index`/`index-code` tasks, `code_index`,
 * `aqe code index`) ends in KnowledgeGraphService.index, which runs these
 * checks before reading anything. A path is indexed only when its realpath is
 * a regular file inside the project root's realpath, so a symlink pointing out
 * of the project is skipped and reported instead of followed. Callers get the
 * skipped paths back with a reason; nothing skipped counts as indexed.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Result, ok, err } from '../../shared/types';
import type { SkippedIndexPath } from './interfaces';

export interface ConfinedIndexPaths {
  /** Requested paths (as given) that are regular files inside the project root. */
  accepted: string[];
  skipped: SkippedIndexPath[];
}

/** True when `candidate` is `root` or lies beneath it (both absolute). */
function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Validate the shape of a caller-supplied path list at a boundary, so a
 * non-array value fails with a clear message rather than deep inside indexing.
 */
export function validateIndexPaths(
  value: unknown,
  field = 'paths',
  context = 'Invalid index payload',
): Result<string[], Error> {
  if (!Array.isArray(value)) {
    return err(new Error(`${context}: '${field}' must be an array of file paths, got ${describe(value)}`));
  }
  for (let i = 0; i < value.length; i++) {
    const entry: unknown = value[i];
    if (typeof entry !== 'string' || entry.trim() === '') {
      return err(new Error(`${context}: '${field}[${i}]' must be a non-empty string, got ${describe(entry)}`));
    }
    if (entry.includes('\0')) {
      return err(new Error(`${context}: '${field}[${i}]' contains a null byte`));
    }
  }
  return ok(value as string[]);
}

/**
 * Boundary check shared by `task_submit` and `aqe task submit`: an `index` or
 * `index-code` task that carries `paths` must carry a well-formed list.
 * Returns undefined when the task is acceptable.
 */
export function validateIndexTaskPayload(type: string, payload: unknown): Error | undefined {
  if (type !== 'index' && type !== 'index-code') return undefined;
  if (payload === null || typeof payload !== 'object' || !('paths' in payload)) return undefined;
  const result = validateIndexPaths((payload as { paths: unknown }).paths);
  return result.success ? undefined : result.error;
}

/**
 * Split `paths` into those that may be indexed and those that must be skipped.
 * Relative paths resolve against `basePath` (default: cwd), as FileReader does.
 */
export async function confineIndexPaths(
  paths: readonly string[],
  projectRoot: string,
  basePath: string = process.cwd(),
): Promise<ConfinedIndexPaths> {
  const accepted: string[] = [];
  const skipped: SkippedIndexPath[] = [];
  const rootLexical = path.resolve(projectRoot);
  const rootReal = await fs.realpath(projectRoot).catch(() => rootLexical);

  for (const requested of paths) {
    const lexical = path.resolve(basePath, requested);
    // A path that is not even spelled inside the root is refused before any
    // filesystem call, so the reason cannot reveal whether an outside path
    // exists or is readable.
    if (!isWithin(rootLexical, lexical) && !isWithin(rootReal, lexical)) {
      skipped.push({ path: requested, reason: 'outside-project-root' });
      continue;
    }
    let real: string;
    try {
      real = await fs.realpath(lexical);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      skipped.push({ path: requested, reason: code === 'ENOENT' || code === 'ENOTDIR' ? 'not-found' : 'unreadable' });
      continue;
    }
    if (!isWithin(rootReal, real)) {
      skipped.push({ path: requested, reason: 'outside-project-root' });
      continue;
    }
    const stat = await fs.stat(real).catch(() => null);
    if (!stat) {
      skipped.push({ path: requested, reason: 'unreadable' });
    } else if (!stat.isFile()) {
      skipped.push({ path: requested, reason: 'not-a-file' });
    } else {
      accepted.push(requested);
    }
  }

  return { accepted, skipped };
}

/**
 * The error an index entry point returns when paths were requested but none
 * was indexed, so a task fails (and the CLI exits non-zero) instead of
 * reporting success for work that did not happen.
 */
export function nothingIndexedError(
  requested: number,
  skipped: readonly SkippedIndexPath[],
  errors: ReadonlyArray<{ file: string; error: string }> = [],
): Error {
  const details = [
    ...skipped.map((s) => `${s.path} (${s.reason})`),
    ...errors.map((e) => `${e.file} (${e.error})`),
  ];
  const shown = details.slice(0, 5).join(', ');
  const more = details.length > 5 ? `, and ${details.length - 5} more` : '';
  return new Error(
    `Nothing was indexed: 0 of ${requested} requested path(s) indexed` + (shown ? ` - ${shown}${more}` : ''),
  );
}
