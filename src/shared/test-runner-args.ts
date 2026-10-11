/**
 * Safe argument builders for spawning test runners (issue #909).
 *
 * Runner CLIs read some values in ways that can select the wrong tests:
 * - Jest treats positional TestPathPatterns as regular expressions, so a path
 *   containing `(`, `[`, `+` or `.` can match other files or miss its own.
 * - A value that starts with `-` (a test name such as `-x`, or a relative path
 *   such as `-dash.test.ts`) is parsed as a flag by Jest, Vitest and Mocha.
 *   Vitest ignores everything after a `--` separator, so a separator alone
 *   cannot protect positional file filters.
 *
 * The rules used here:
 * - Name filters use the `--flag=value` form, so the value is never a flag.
 * - File filters are absolute paths, which never start with `-`.
 * - Jest file filters are regex-escaped and anchored as `^<path>$`, so they
 *   select exactly one file, and the leading `^` cannot be read as a flag.
 */

import { realpathSync, statSync } from 'node:fs';
import { basename, dirname, extname, resolve, sep } from 'node:path';

/** Runners whose test-name filter is a regular expression. */
export type NameFilterRunner = 'vitest' | 'jest' | 'mocha';

/** Escape every regular-expression metacharacter in a literal string. */
export function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Absolute path for a test file. Directory symlinks (for example `/tmp` on
 * macOS) are resolved the same way runners resolve their root, while the file
 * name itself is kept. The result never begins with `-`.
 */
export function runnerFilePath(file: string, cwd: string = process.cwd()): string {
  const absolute = resolve(cwd, file);
  try {
    return resolve(realpathSync(dirname(absolute)), basename(absolute));
  } catch {
    return absolute;
  }
}

/**
 * True when `absolutePath` names a directory. A path that does not exist is
 * treated as a directory when it has no file extension.
 */
function isDirectoryTarget(absolutePath: string): boolean {
  try {
    return statSync(absolutePath).isDirectory();
  } catch {
    return extname(absolutePath) === '';
  }
}

/**
 * Jest positional TestPathPattern for `file`. A file matches exactly; a
 * directory matches every path beneath it but not a sibling that shares its
 * prefix (`app` vs `app-other`). Separators are normalised to `/`, which Jest
 * maps to the platform separator.
 */
export function jestExactPathPattern(file: string, cwd: string = process.cwd()): string {
  const absolute = runnerFilePath(file, cwd);
  const normalized = absolute.split(sep).join('/');
  const end = isDirectoryTarget(absolute) ? '(?:/|$)' : '$';
  return `^${escapeRegExpLiteral(normalized)}${end}`;
}

/**
 * Literal test-name filter in `--flag=value` form. Mocha uses `--grep`; Jest
 * and Vitest use `--testNamePattern` (the long form of `-t`).
 */
export function nameFilterArg(runner: NameFilterRunner, testName: string): string {
  const pattern = escapeRegExpLiteral(testName);
  return runner === 'mocha' ? `--grep=${pattern}` : `--testNamePattern=${pattern}`;
}

/** True when a command vector (runner command plus its arguments) runs Jest. */
export function isJestCommand(args: readonly string[]): boolean {
  return args.some(arg => /(^|[\\/])jest(\.cmd|\.js|\.mjs)?$/i.test(arg));
}
