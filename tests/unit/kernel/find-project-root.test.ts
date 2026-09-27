/**
 * Regression tests for findProjectRoot() — Issue #516.
 *
 * Defect 1: an ancestor `.agentic-qe` (e.g. ~/.agentic-qe) must NOT hijack a
 * descendant project's root. Resolution must prefer the NEAREST `.agentic-qe`,
 * mirroring the existing `.git` nearest-wins logic.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { findProjectRoot, clearProjectRootCache } from '../../../src/kernel/unified-memory';

describe('findProjectRoot (Issue #516)', () => {
  let tmpRoot: string;
  let savedEnv: string | undefined;

  beforeEach(() => {
    // Real, normalized temp tree (realpath resolves macOS /tmp -> /private/tmp).
    tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-fpr-')));
    savedEnv = process.env.AQE_PROJECT_ROOT;
    delete process.env.AQE_PROJECT_ROOT;
    clearProjectRootCache();
  });

  afterEach(() => {
    if (savedEnv === undefined) delete process.env.AQE_PROJECT_ROOT;
    else process.env.AQE_PROJECT_ROOT = savedEnv;
    clearProjectRootCache();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function mkdirs(...dirs: string[]): void {
    for (const d of dirs) fs.mkdirSync(d, { recursive: true });
  }

  it('should_returnNearestAgenticQe_when_ancestorStoreAlsoExists', () => {
    // Arrange: ancestor store (the hijacker) ABOVE a project that has its own.
    const ancestorAqe = path.join(tmpRoot, '.agentic-qe');
    const project = path.join(tmpRoot, 'workspace', 'project');
    const projectAqe = path.join(project, '.agentic-qe');
    const startDir = path.join(project, 'src', 'deep', 'nested');
    mkdirs(ancestorAqe, projectAqe, startDir);

    // Act
    const root = findProjectRoot(startDir);

    // Assert: the project's own store wins, not the ancestor at tmpRoot.
    expect(root).toBe(project);
    expect(root).not.toBe(tmpRoot);
  });

  it('should_honorAqeProjectRootEnv_when_set', () => {
    // Arrange
    const project = path.join(tmpRoot, 'proj');
    mkdirs(path.join(project, '.agentic-qe'));
    process.env.AQE_PROJECT_ROOT = '/explicit/override';
    clearProjectRootCache();

    // Act
    const root = findProjectRoot(project);

    // Assert: explicit override takes precedence over the walk.
    expect(root).toBe('/explicit/override');
  });

  it('should_fallBackToNearestGit_when_noAgenticQeExists', () => {
    // Arrange: only a .git marker, no .agentic-qe anywhere.
    const repo = path.join(tmpRoot, 'repo');
    const startDir = path.join(repo, 'pkg', 'sub');
    mkdirs(path.join(repo, '.git'), startDir);

    // Act
    const root = findProjectRoot(startDir);

    // Assert
    expect(root).toBe(repo);
  });

  it('resolves independent SDK start directories without returning another project cache', () => {
    const first = path.join(tmpRoot, 'first');
    const second = path.join(tmpRoot, 'second');
    mkdirs(path.join(first, '.agentic-qe'), path.join(second, '.agentic-qe'));
    expect(findProjectRoot(first)).toBe(first);
    expect(findProjectRoot(second)).toBe(second);
  });

  it('honors an environment override changed after a prior resolution', () => {
    const project = path.join(tmpRoot, 'project');
    mkdirs(path.join(project, '.agentic-qe'));
    expect(findProjectRoot(project)).toBe(project);
    process.env.AQE_PROJECT_ROOT = path.join(tmpRoot, 'override');
    expect(findProjectRoot(project)).toBe(process.env.AQE_PROJECT_ROOT);
  });

  it('uses an explicit start directory as the no-marker fallback', () => {
    const project = path.join(tmpRoot, 'plain');
    mkdirs(project);
    expect(findProjectRoot(project)).toBe(project);
  });

  it('terminates for relative start paths and returns an absolute root', () => {
    const project = path.join(tmpRoot, 'relative');
    mkdirs(path.join(project, '.agentic-qe'));
    const moduleUrl = pathToFileURL(path.resolve('src/kernel/project-root.ts')).href;
    const output = execFileSync(process.execPath, [
      '--import', path.resolve('node_modules/tsx/dist/loader.mjs'), '--input-type=module', '-e',
      `import { findProjectRoot } from ${JSON.stringify(moduleUrl)}; console.log(findProjectRoot('.'));`,
    ], { cwd: project, env: { ...process.env, AQE_PROJECT_ROOT: '' }, timeout: 2000, encoding: 'utf8' });
    expect(output.trim()).toBe(project);
  });

  it('should_preferNearestAgenticQe_over_ancestorGit', () => {
    // Arrange: git root above, but a nearer .agentic-qe below it.
    const repo = path.join(tmpRoot, 'monorepo');
    const pkg = path.join(repo, 'packages', 'a');
    const startDir = path.join(pkg, 'src');
    mkdirs(path.join(repo, '.git'), path.join(pkg, '.agentic-qe'), startDir);

    // Act
    const root = findProjectRoot(startDir);

    // Assert: .agentic-qe (priority 2) beats .git (priority 3), and it's the nearest one.
    expect(root).toBe(pkg);
  });
});
