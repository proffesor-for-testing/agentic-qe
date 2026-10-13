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
import { isSharedSystemDir } from '../../../src/kernel/project-root';

describe('findProjectRoot (Issue #516)', () => {
  let tmpRoot: string;
  let fakeTmp: string;
  let savedEnv: string | undefined;
  let savedTmpdir: string | undefined;

  beforeEach(() => {
    // Hermetic (#1006): every walk starts below a test-owned fake OS temp dir.
    // The walk never looks at or above the temp dir, so a stray store such as
    // /tmp/.agentic-qe on the host cannot change these results.
    // realpath resolves macOS /tmp -> /private/tmp.
    fakeTmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-fpr-tmp-')));
    savedTmpdir = process.env.TMPDIR;
    process.env.TMPDIR = fakeTmp;
    tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(fakeTmp, 'aqe-fpr-')));
    savedEnv = process.env.AQE_PROJECT_ROOT;
    delete process.env.AQE_PROJECT_ROOT;
    clearProjectRootCache();
  });

  afterEach(() => {
    if (savedEnv === undefined) delete process.env.AQE_PROJECT_ROOT;
    else process.env.AQE_PROJECT_ROOT = savedEnv;
    if (savedTmpdir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = savedTmpdir;
    clearProjectRootCache();
    fs.rmSync(fakeTmp, { recursive: true, force: true });
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

  it.each(['directory', 'worktree file'])('ignores an ancestor store above the nearest git %s', marker => {
    const project = path.join(tmpRoot, 'new-project');
    const nested = path.join(project, 'src', 'deep');
    mkdirs(path.join(tmpRoot, '.agentic-qe'), nested);
    if (marker === 'directory') mkdirs(path.join(project, '.git'));
    else fs.writeFileSync(path.join(project, '.git'), 'gitdir: /external/worktree');
    expect(findProjectRoot(nested)).toBe(project);
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
  describe('home-directory store outside a git repository (#735)', () => {
    let savedHome: string | undefined;

    beforeEach(() => {
      savedHome = process.env.HOME;
      process.env.HOME = tmpRoot;
    });

    afterEach(() => {
      if (savedHome === undefined) delete process.env.HOME;
      else process.env.HOME = savedHome;
    });

    it('should_notAdoptHomeStore_when_nonGitProjectBelowHome', () => {
      // Arrange: a stray ~/.agentic-qe and a non-git project under $HOME.
      const project = path.join(tmpRoot, 'bar');
      mkdirs(path.join(tmpRoot, '.agentic-qe'), project);

      // Act
      const root = findProjectRoot(project);

      // Assert: the project resolves to itself, not to $HOME's store.
      expect(root).toBe(project);
    });

    it('should_useHomeRoot_when_runFromInsideHomeStore', () => {
      // Running from inside ~/.agentic-qe must not create a nested store.
      const inside = path.join(tmpRoot, '.agentic-qe', 'witness-keys');
      mkdirs(inside);

      expect(findProjectRoot(inside)).toBe(tmpRoot);
    });

    it('should_useHomeStore_when_runFromHomeItself', () => {
      mkdirs(path.join(tmpRoot, '.agentic-qe'));

      expect(findProjectRoot(tmpRoot)).toBe(tmpRoot);
    });
  });

  describe('shared temp and system directories (#1006)', () => {
    it('does not adopt a store in the OS temp dir for a marker-less project', () => {
      // A stray <tmpdir>/.agentic-qe left by an earlier run.
      const project = path.join(fakeTmp, 'fresh-project');
      mkdirs(path.join(fakeTmp, '.agentic-qe'), path.join(project, 'src'));

      expect(findProjectRoot(project)).toBe(project);
      expect(findProjectRoot(path.join(project, 'src'))).toBe(path.join(project, 'src'));
    });

    it('does not adopt a .git or package.json in the OS temp dir either', () => {
      const project = path.join(fakeTmp, 'plain');
      mkdirs(path.join(fakeTmp, '.git'), project);
      fs.writeFileSync(path.join(fakeTmp, 'package.json'), '{}');

      expect(findProjectRoot(project)).toBe(project);
    });

    it('does not adopt a store in a world-writable directory', () => {
      if (process.platform === 'win32') return;
      const shared = path.join(tmpRoot, 'shared');
      const project = path.join(shared, 'proj');
      mkdirs(path.join(shared, '.agentic-qe'), project);
      fs.chmodSync(shared, 0o1777);

      expect(findProjectRoot(project)).toBe(project);
    });

    it('still adopts a project store in a chmod-777 (non-sticky) workspace', () => {
      if (process.platform === 'win32') return;
      const workspace = path.join(tmpRoot, 'workspace');
      const nested = path.join(workspace, 'src');
      mkdirs(path.join(workspace, '.agentic-qe'), nested);
      fs.chmodSync(workspace, 0o777);

      expect(findProjectRoot(nested)).toBe(workspace);
    });

    it('never resolves the OS temp dir itself as a project root', () => {
      // Running from the temp dir with no marker must not create <tmpdir>/.agentic-qe.
      const root = findProjectRoot(fakeTmp);

      expect(root).not.toBe(fakeTmp);
      expect(isSharedSystemDir(root)).toBe(false);
      expect(fs.existsSync(path.join(fakeTmp, '.agentic-qe'))).toBe(false);
      if (process.platform !== 'win32') {
        expect(fs.statSync(root).mode & 0o077).toBe(0);
      }
    });

    it('does not adopt an existing store in the OS temp dir when run from it', () => {
      mkdirs(path.join(fakeTmp, '.agentic-qe'));

      expect(findProjectRoot(fakeTmp)).not.toBe(fakeTmp);
    });

    it('still honors a project store inside the temp dir', () => {
      const project = path.join(fakeTmp, 'aqe-project');
      const nested = path.join(project, 'src');
      mkdirs(path.join(project, '.agentic-qe'), nested);

      expect(findProjectRoot(nested)).toBe(project);
    });

    it('still honors AQE_PROJECT_ROOT pointing at a shared dir', () => {
      process.env.AQE_PROJECT_ROOT = fakeTmp;

      expect(findProjectRoot(fakeTmp)).toBe(fakeTmp);
    });

    it('classifies temp and system directories as shared', () => {
      expect(isSharedSystemDir(fakeTmp)).toBe(true);
      if (process.platform !== 'win32') {
        expect(isSharedSystemDir('/tmp')).toBe(true);
        expect(isSharedSystemDir('/var/tmp')).toBe(true);
        expect(isSharedSystemDir('/')).toBe(true);
        expect(isSharedSystemDir('/usr')).toBe(true);
      }
      expect(isSharedSystemDir(tmpRoot)).toBe(false);
    });
  });
});
