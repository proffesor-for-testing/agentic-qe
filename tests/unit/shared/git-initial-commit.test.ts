import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitAnalyzer } from '../../../src/shared/git/git-analyzer.js';

describe('GitAnalyzer initial commit with native Git', () => {
  let root: string;
  let analyzer: GitAnalyzer;
  const git = (...args: string[]) => execFileSync('git', args, {
    cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'aqe-git-initial-'));
    git('init', '-q');
    git('config', 'user.name', 'Native Git Test');
    git('config', 'user.email', 'native@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    writeFileSync(join(root, 'first.ts'), 'export const first = 1;\n');
    writeFileSync(join(root, 'second.ts'), 'export const second = 1;\n');
    git('add', '--', 'first.ts', 'second.ts');
    git('commit', '-qm', 'initial');
    analyzer = new GitAnalyzer({ repoRoot: root, enableCache: false });
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reports initial files for HEAD and an explicit root commit', async () => {
    const rootCommit = git('rev-parse', 'HEAD');
    expect((await analyzer.getCommitFiles()).sort()).toEqual(['first.ts', 'second.ts']);
    expect((await analyzer.getCommitFiles(rootCommit)).sort()).toEqual(['first.ts', 'second.ts']);
  });

  it('keeps subsequent commits limited to their changed files', async () => {
    const rootCommit = git('rev-parse', 'HEAD');
    writeFileSync(join(root, 'second.ts'), 'export const second = 2;\n');
    git('add', '--', 'second.ts');
    git('commit', '-qm', 'update second');
    expect(await analyzer.getCommitFiles()).toEqual(['second.ts']);
    expect((await analyzer.getCommitFiles(rootCommit)).sort()).toEqual(['first.ts', 'second.ts']);
  });

  it('retains empty results for an empty initial commit', async () => {
    git('checkout', '--orphan', 'empty-root');
    git('rm', '-rf', '.');
    git('commit', '--allow-empty', '-qm', 'empty initial');
    expect(await analyzer.getCommitFiles()).toEqual([]);
  });
});
