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
