/**
 * Agentic QE v3 - Generated test file writer (#936 follow-up)
 *
 * `aqe test generate` writes each generated test beside its source. This
 * module decides whether a single write is safe:
 * - the resolved path must stay inside the project root, so a bad path
 *   (for example from a directory named `my.ts-app`) can never create files
 *   outside the project;
 * - an existing file is never replaced unless the caller passed --force,
 *   because generated files carry no marker that tells them apart from
 *   hand-written tests.
 *
 * @module cli/utils/generated-test-writer
 */

import * as fs from 'fs';
import * as path from 'path';

export type GeneratedTestWriteStatus = 'written' | 'exists' | 'outside-project';

export interface GeneratedTestWriteResult {
  status: GeneratedTestWriteStatus;
  /** Absolute path that was (or would have been) written. */
  path: string;
}

export interface GeneratedTestWriteOptions {
  /** Directory every written file must stay inside. */
  projectRoot: string;
  /** Overwrite an existing file instead of skipping it. */
  force?: boolean;
}

/** True when `file` is inside `root` (never equal to it). */
export function isInsideRoot(file: string, root: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(file));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Write one generated test file if it is safe to do so.
 *
 * @returns what happened; nothing is written unless status is 'written'.
 */
export function writeGeneratedTestFile(
  testFile: string,
  testCode: string,
  options: GeneratedTestWriteOptions
): GeneratedTestWriteResult {
  const target = path.resolve(testFile);
  if (!isInsideRoot(target, options.projectRoot)) {
    return { status: 'outside-project', path: target };
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    // 'wx' fails if the file exists, so the check and the write are atomic.
    fs.writeFileSync(target, testCode, { encoding: 'utf-8', flag: options.force ? 'w' : 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return { status: 'exists', path: target };
    throw error;
  }
  return { status: 'written', path: target };
}
