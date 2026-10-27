/**
 * #1247: the runner project a test file belongs to.
 *
 * Vitest and Jest load their configuration (setup files, aliases, include
 * patterns, environment) from the directory they are started in. In a
 * monorepo whose packages have their own config (`apps/webapp/vitest.config.ts`)
 * a run started at the repository root never loads that package's setup, so
 * the package's tests fail or produce no report. Each test file is therefore
 * run from the nearest directory, at or above it, with runner configuration,
 * but never from above the project root. Only real configuration counts, so a
 * workspace package without its own config runs from the root that defines
 * its project.
 *
 * A run from the current working directory is kept whenever that directory is
 * already inside the file's runner project (a single-project repository, or a
 * server started inside the package), so those runs behave as before.
 */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { findProjectRoot } from '../kernel/project-root.js';
import { CallerInputError } from './error-utils.js';
import { requirePayloadFiles, requirePayloadPath } from './io/payload-path-guard.js';
import { safeJsonParse } from './safe-json.js';
import { runnerFilePath } from './test-runner-args.js';
import { Result, ok, err } from './types';

const CONFIG_EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'];

/**
 * Files whose presence makes a directory a Vitest or Jest project. A root
 * workspace file (`vitest.workspace.*`) counts too: its packages run from it.
 */
export const RUNNER_CONFIG_FILES: readonly string[] = [
  ...CONFIG_EXTENSIONS.map(ext => `vitest.config.${ext}`),
  ...[...CONFIG_EXTENSIONS, 'json'].map(ext => `vitest.workspace.${ext}`),
  ...CONFIG_EXTENSIONS.map(ext => `jest.config.${ext}`),
  'jest.config.json',
];

/** Vite configs: a runner project only when they configure `test`. */
const VITE_CONFIG_FILES = CONFIG_EXTENSIONS.map(ext => `vite.config.${ext}`);

/** Largest config or package.json read while looking for a runner setup. */
const MAX_MARKER_BYTES = 1024 * 1024;

export interface RunnerProjectOptions {
  /** Directory runs start in today; defaults to process.cwd(). */
  cwd?: string;
  /** Highest directory the search may reach; defaults to findProjectRoot(). */
  boundary?: string;
  /** Directories already checked, so files that share a directory check it once. */
  checked?: Map<string, boolean>;
}

/** A set of test files that run together from one directory. */
export interface RunnerProjectGroup {
  cwd: string;
  files: string[];
}

function realDir(dir: string): string {
  try {
    return realpathSync(dir);
  } catch {
    return path.resolve(dir);
  }
}

/** True when `candidate` is `root` or lies beneath it (both absolute). */
function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function readSmallFile(file: string): string | undefined {
  try {
    const stat = statSync(file);
    if (!stat.isFile() || stat.size > MAX_MARKER_BYTES) return undefined;
    return readFileSync(file, 'utf-8');
  } catch {
    return undefined;
  }
}

/**
 * True when a package.json in `dir` holds runner configuration (a top-level
 * `jest` or `vitest` key). Listing a runner as a dependency or in
 * `scripts.test` does not: in a workspace the packages do that while the root
 * config defines their projects and setup.
 */
function packageConfiguresRunner(dir: string): boolean {
  const text = readSmallFile(path.join(dir, 'package.json'));
  if (text === undefined) return false;
  let pkg: Record<string, unknown> | undefined;
  try {
    pkg = safeJsonParse(text) as Record<string, unknown> | undefined;
  } catch {
    return false;
  }
  if (!pkg || typeof pkg !== 'object') return false;
  return pkg.jest !== undefined || pkg.vitest !== undefined;
}

/** True when `dir` holds a Vitest or Jest configuration. */
export function isRunnerProjectDir(dir: string): boolean {
  if (RUNNER_CONFIG_FILES.some(name => existsSync(path.join(dir, name)))) return true;
  for (const name of VITE_CONFIG_FILES) {
    const text = readSmallFile(path.join(dir, name));
    if (text !== undefined && /\btest\s*:/.test(text)) return true;
  }
  return packageConfiguresRunner(dir);
}

/**
 * The nearest directory at or above `file` with runner configuration, searching no
 * higher than `boundary`. Undefined when the file lies outside the boundary or
 * no directory on the way has runner configuration.
 */
export function findRunnerProjectDir(
  file: string,
  boundary: string,
  cwd: string = process.cwd(),
  checked: Map<string, boolean> = new Map(),
): string | undefined {
  const root = realDir(boundary);
  let dir = path.dirname(runnerFilePath(file, cwd));
  if (!isWithin(root, dir)) return undefined;
  for (;;) {
    let isProject = checked.get(dir);
    if (isProject === undefined) {
      isProject = isRunnerProjectDir(dir);
      checked.set(dir, isProject);
    }
    if (isProject) return dir;
    if (dir === root) return undefined;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Directory to start the runner in for `file`: its runner project, unless the
 * current directory is already inside that project (or none is found), in
 * which case the current directory is kept.
 */
export function runnerCwdFor(file: string, options: RunnerProjectOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const project = findRunnerProjectDir(file, options.boundary ?? findProjectRoot(), cwd, options.checked);
  if (!project || isWithin(project, realDir(cwd))) return cwd;
  return project;
}

/**
 * Group `files` by the directory each must run from, in first-seen order.
 * Files keep the spelling they were given.
 */
export function groupByRunnerProject(files: readonly string[], options: RunnerProjectOptions = {}): RunnerProjectGroup[] {
  const resolved: RunnerProjectOptions = {
    cwd: options.cwd ?? process.cwd(),
    boundary: options.boundary ?? findProjectRoot(),
    checked: options.checked ?? new Map(),
  };
  const groups = new Map<string, string[]>();
  for (const file of files) {
    const cwd = runnerCwdFor(file, resolved);
    const group = groups.get(cwd);
    if (group) group.push(file);
    else groups.set(cwd, [file]);
  }
  return [...groups].map(([cwd, groupFiles]) => ({ cwd, files: groupFiles }));
}

/** Test files to run, and the directory to run them from when the caller named one. */
export interface TestRunTargets {
  testFiles: string[];
  projectRoot?: string;
}

/**
 * Handler-side check for an execute-tests payload. `testFiles` must name
 * files or directories inside the project (#1126). An explicit `projectRoot`
 * must be a directory inside the project, checked by realpath so `..`, an
 * outside absolute path or a symlink pointing out is refused; relative test
 * files are then read from it, and every path is returned absolute.
 */
export async function requireTestRunTargets(
  taskType: string,
  testFiles: unknown,
  projectRoot: unknown,
): Promise<Result<TestRunTargets, Error>> {
  const fileOptions = { allowMissing: true, allowDirectory: true };
  if (projectRoot === undefined) {
    const confined = await requirePayloadFiles(taskType, 'testFiles', testFiles, fileOptions);
    return confined.success ? ok({ testFiles: confined.value }) : confined;
  }
  const checked = await requirePayloadPath(taskType, 'projectRoot', projectRoot, { allowDirectory: true });
  if (!checked.success) return checked;
  const root = path.resolve(realDir(process.cwd()), checked.value);
  let isDirectory = false;
  try { isDirectory = statSync(root).isDirectory(); } catch { /* reported below */ }
  if (!isDirectory) {
    return err(new CallerInputError(`Invalid ${taskType} payload: 'projectRoot' must be a directory inside the project.`));
  }
  const confined = await requirePayloadFiles(taskType, 'testFiles', testFiles, { ...fileOptions, basePath: root });
  if (!confined.success) return confined;
  return ok({ testFiles: confined.value.map(file => path.resolve(root, file)), projectRoot: root });
}
