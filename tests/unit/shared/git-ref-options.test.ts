/**
 * Issue #960: option-shaped commit refs must never reach `git diff-tree`.
 * Uses native Git in a throwaway repository.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitAnalyzer } from '../../../src/shared/git/git-analyzer.js';

describe('GitAnalyzer.getCommitFiles rejects option-shaped refs (#960)', () => {
  let root: string;
  let scratch: string;
  let analyzer: GitAnalyzer;
  const git = (...args: string[]) => execFileSync('git', args, {
    cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'aqe-git-refopt-'));
    scratch = mkdtempSync(join(tmpdir(), 'aqe-git-refopt-out-'));
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Native Git Test');
    git('config', 'user.email', 'native@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    writeFileSync(join(root, 'first.ts'), 'export const first = 1;\n');
    git('add', '--', 'first.ts');
    git('commit', '-qm', 'first');
    writeFileSync(join(root, 'second.ts'), 'export const second = 1;\n');
    git('add', '--', 'second.ts');
    git('commit', '-qm', 'second');
    git('tag', 'v1.0.0');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    analyzer = new GitAnalyzer({ repoRoot: root, enableCache: false });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(scratch, { recursive: true, force: true });
  });

  it('throws for --output=<path> and git writes no file', async () => {
    const target = join(scratch, 'written-by-git');
    await expect(analyzer.getCommitFiles(`--output=${target}`)).rejects.toThrow(/must not start with "-"/);
    expect(existsSync(target)).toBe(false);
  });

  it('throws for any other option-shaped ref', async () => {
    await expect(analyzer.getCommitFiles('-p')).rejects.toThrow(/must not start with "-"/);
    await expect(analyzer.getCommitFiles('--all')).rejects.toThrow(/must not start with "-"/);
  });

  it('throws for refs containing whitespace or control characters', async () => {
    await expect(analyzer.getCommitFiles('HEAD --output=x')).rejects.toThrow(/whitespace/);
    await expect(analyzer.getCommitFiles('HEAD\n')).rejects.toThrow(/whitespace/);
  });

  it('keeps ordinary revisions working', async () => {
    const sha = git('rev-parse', 'HEAD');
    for (const ref of ['HEAD', sha, sha.slice(0, 7), 'main', 'origin/main', 'v1.0.0', 'v1.0.0^{commit}']) {
      expect(await analyzer.getCommitFiles(ref)).toEqual(['second.ts']);
    }
    expect(await analyzer.getCommitFiles('HEAD~1')).toEqual(['first.ts']);
    expect(await analyzer.getCommitFiles()).toEqual(['second.ts']);
  });

  it('still returns [] for a well-formed but unknown ref', async () => {
    expect(await analyzer.getCommitFiles('no-such-branch')).toEqual([]);
  });
});
